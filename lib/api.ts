import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { AuthError } from "./auth";
import { appUrl, env } from "./config";

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof AuthError) {
    return jsonError(error.message, error.status);
  }
  if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
    return jsonError("This action was already recorded. Refresh and try again.", 409);
  }
  console.error("[maat] api error:", error instanceof Error ? error.message : "unknown error");
  return jsonError("Something went wrong. Please try again.", 500);
}

export function assertSameOrigin(request: Request): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin) {
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
      throw new AuthError(403, "Cross-site request blocked.");
    }
    return;
  }
  const allowed = new Set<string>([appUrl()]);
  try {
    const requestUrl = new URL(request.url);
    allowed.add(requestUrl.origin);
  } catch {
    // Ignore malformed request URLs; the configured origin still applies.
  }
  if (!allowed.has(origin)) throw new AuthError(403, "Cross-site request blocked.");
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(`${ip}:${env("SESSION_SECRET")}`).digest("hex").slice(0, 32);
}

export function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export async function readJsonBody<T = unknown>(request: Request, maxBytes = 64 * 1024): Promise<T> {
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new AuthError(413, "Request body is too large.");
  }
  try {
    return JSON.parse(text || "{}") as T;
  } catch {
    throw new AuthError(400, "Request body must be valid JSON.");
  }
}
