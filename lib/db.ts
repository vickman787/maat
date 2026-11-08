import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { databaseFile, loadLocalEnv } from "./config";
import { MIGRATIONS } from "./migrations";

type GlobalWithDb = typeof globalThis & { __maatDb?: Database.Database };

const globalWithDb = globalThis as GlobalWithDb;

export function migrate(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations").all().map((row) => (row as { version: number }).version),
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    const run = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
    });
    run();
  }
}

export function openDatabase(file = databaseFile()): Database.Database {
  loadLocalEnv();
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return db;
}

export function getDb(): Database.Database {
  if (!globalWithDb.__maatDb) {
    globalWithDb.__maatDb = openDatabase();
  }
  return globalWithDb.__maatDb;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}

export function inTransaction<T>(db: Database.Database, fn: () => T): T {
  return db.transaction(fn)();
}
