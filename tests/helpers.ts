import type Database from "better-sqlite3";
import type { AuthContext } from "../lib/auth";
import { newId, nowIso, openDatabase } from "../lib/db";
import { importBatch } from "../lib/importer";
import {
  FIXTURE_INVOICE_MAPPING,
  FIXTURE_PAYMENT_MAPPING,
  invoicesCsv,
  paymentsCsv,
} from "./fixtures/canonical";

export function makeDb(): Database.Database {
  return openDatabase(":memory:");
}

export function createAccount(
  db: Database.Database,
  businessName = "Test Studio",
): { userId: string; workspaceId: string } {
  const userId = newId();
  const workspaceId = newId();
  const now = nowIso();
  db.prepare(
    "INSERT INTO users (id, privy_did, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(userId, `did:privy:${newId()}`, "owner@example.com", "Test Owner", now, now);
  db.prepare(
    "INSERT INTO workspaces (id, name, owner_user_id, is_demo, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
  ).run(workspaceId, businessName, userId, now, now);
  db.prepare(
    "INSERT INTO memberships (id, workspace_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)",
  ).run(newId(), workspaceId, userId, now);
  return { userId, workspaceId };
}

export function contextFor(
  db: Database.Database,
  userId: string,
  workspaceId: string,
): AuthContext {
  const user = db.prepare("SELECT id, privy_did, email, display_name FROM users WHERE id = ?").get(userId) as {
    id: string;
    privy_did: string;
    email: string | null;
    display_name: string | null;
  };
  const workspace = db.prepare("SELECT id, name, is_demo FROM workspaces WHERE id = ?").get(workspaceId) as {
    id: string;
    name: string;
    is_demo: number;
  };
  return {
    session: {
      kind: "user",
      userId,
      workspaceId,
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    user: {
      id: user.id,
      privyDid: user.privy_did,
      email: user.email,
      displayName: user.display_name,
    },
    workspace: { id: workspace.id, name: workspace.name, isDemo: Boolean(workspace.is_demo) },
    role: "owner",
    actorLabel: user.email ?? "Test Owner",
  };
}

export function importFixture(
  db: Database.Database,
  workspaceId: string,
  name = "November client payments",
) {
  return importBatch(db, workspaceId, {
    name,
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
}
