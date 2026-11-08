import type Database from "better-sqlite3";
import { demoTtlHours } from "../../lib/config";
import { newId, nowIso } from "../../lib/db";
import {
  FIXTURE_INVOICE_MAPPING,
  FIXTURE_PAYMENT_MAPPING,
  invoicesCsv,
  paymentsCsv,
} from "./canonical";
import { importBatch } from "../../lib/importer";
import { deletePrivateFile } from "../../lib/storage";

const DEMO_BATCH_NAME = "November client payments";

function insertDemoWorkspace(db: Database.Database): string {
  const workspaceId = newId();
  const now = nowIso();
  db.prepare(
    "INSERT INTO workspaces (id, name, owner_user_id, is_demo, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, ?)",
  ).run(workspaceId, "Atlas Studio", now, now);
  return workspaceId;
}

export function cleanupExpiredDemos(db: Database.Database): number {
  const cutoff = new Date(Date.now() - demoTtlHours() * 3600 * 1000).toISOString();
  const workspaces = db
    .prepare("SELECT id FROM workspaces WHERE is_demo = 1 AND created_at < ?")
    .all(cutoff) as Array<{ id: string }>;
  for (const workspace of workspaces) {
    const files = db
      .prepare("SELECT storage_key FROM source_files WHERE workspace_id = ?")
      .all(workspace.id) as Array<{ storage_key: string }>;
    for (const file of files) deletePrivateFile(file.storage_key);
    db.prepare("DELETE FROM workspaces WHERE id = ?").run(workspace.id);
  }
  db.prepare("DELETE FROM demo_sessions WHERE created_at < ?").run(cutoff);
  db.prepare("DELETE FROM rate_limits WHERE window_start < ?").run(Math.floor(Date.now() / 3600000) - 24);
  return workspaces.length;
}

export function createDemoWorkspace(
  db: Database.Database,
  ipHash: string,
): { workspaceId: string; demoSessionId: string; batchId: string; jobId: string } {
  cleanupExpiredDemos(db);
  const workspaceId = insertDemoWorkspace(db);
  try {
    const imported = importBatch(db, workspaceId, {
      name: DEMO_BATCH_NAME,
      currency: "USD",
      invoices: {
        filename: "invoices-nov.csv",
        mimeType: "text/csv",
        bytes: Buffer.from(invoicesCsv(), "utf8"),
      },
      payments: {
        filename: "payments-nov.csv",
        mimeType: "text/csv",
        bytes: Buffer.from(paymentsCsv(), "utf8"),
      },
      invoiceMapping: FIXTURE_INVOICE_MAPPING,
      paymentMapping: FIXTURE_PAYMENT_MAPPING,
    });
    const demoSessionId = newId();
    const now = nowIso();
    db.prepare(
      "INSERT INTO demo_sessions (id, workspace_id, ip_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
    ).run(demoSessionId, workspaceId, ipHash, now, now);
    return { workspaceId, demoSessionId, batchId: imported.batchId, jobId: imported.jobId };
  } catch (error) {
    db.prepare("DELETE FROM workspaces WHERE id = ?").run(workspaceId);
    throw error;
  }
}

export function resetDemoWorkspace(
  db: Database.Database,
  workspaceId: string,
  ipHash: string,
): { workspaceId: string; demoSessionId: string; batchId: string; jobId: string } {
  const workspace = db
    .prepare("SELECT id FROM workspaces WHERE id = ? AND is_demo = 1")
    .get(workspaceId) as { id: string } | undefined;
  if (workspace) {
    const files = db
      .prepare("SELECT storage_key FROM source_files WHERE workspace_id = ?")
      .all(workspaceId) as Array<{ storage_key: string }>;
    for (const file of files) deletePrivateFile(file.storage_key);
    db.prepare("DELETE FROM workspaces WHERE id = ?").run(workspaceId);
  }
  return createDemoWorkspace(db, ipHash);
}
