import { getDb } from "./db";
import { demoMaxPerHour } from "./config";

export function consumeRateLimit(key: string, limit: number): { allowed: boolean; remaining: number } {
  const db = getDb();
  const windowStart = Math.floor(Date.now() / 3600000);
  const row = db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count)
       VALUES (?, ?, 1)
       ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .get(key, windowStart) as { count: number };
  db.prepare("DELETE FROM rate_limits WHERE window_start < ?").run(windowStart - 24);
  return { allowed: row.count <= limit, remaining: Math.max(0, limit - row.count) };
}

export function consumeDemoRateLimit(ipHash: string) {
  return consumeRateLimit(`demo:${ipHash}`, demoMaxPerHour());
}
