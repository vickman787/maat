import type Database from "better-sqlite3";
import { newId, nowIso } from "./db";

export type SyncedAccount = {
  userId: string;
  workspaceId: string | null;
  workspaceName: string | null;
  needsOnboarding: boolean;
};

export function syncPrivyUser(
  db: Database.Database,
  did: string,
  email: string | null,
): SyncedAccount {
  return db
    .transaction(() => {
      const now = nowIso();
      let user = db.prepare("SELECT id FROM users WHERE privy_did = ?").get(did) as
        | { id: string }
        | undefined;
      if (!user) {
        const id = newId();
        db.prepare(
          "INSERT INTO users (id, privy_did, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        ).run(id, did, email, now, now);
        user = { id };
      } else if (email) {
        db.prepare("UPDATE users SET email = ?, updated_at = ? WHERE id = ? AND (email IS NULL OR email != ?)").run(
          email,
          now,
          user.id,
          email,
        );
      }
      const membership = db
        .prepare(
          `SELECT w.id, w.name FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
           WHERE m.user_id = ? AND w.is_demo = 0 ORDER BY m.created_at LIMIT 1`,
        )
        .get(user.id) as { id: string; name: string } | undefined;
      return {
        userId: user.id,
        workspaceId: membership?.id ?? null,
        workspaceName: membership?.name ?? null,
        needsOnboarding: !membership,
      };
    })
    .immediate();
}

export function createWorkspaceForUser(
  db: Database.Database,
  userId: string,
  businessName: string,
): { workspaceId: string; workspaceName: string } {
  const name = businessName.trim().slice(0, 120);
  if (!name) throw new Error("Business name is required.");
  return db
    .transaction(() => {
      const existing = db
        .prepare(
          `SELECT w.id, w.name FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
           WHERE m.user_id = ? AND w.is_demo = 0 ORDER BY m.created_at LIMIT 1`,
        )
        .get(userId) as { id: string; name: string } | undefined;
      if (existing) return { workspaceId: existing.id, workspaceName: existing.name };
      const workspaceId = newId();
      const now = nowIso();
      db.prepare(
        "INSERT INTO workspaces (id, name, owner_user_id, is_demo, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
      ).run(workspaceId, name, userId, now, now);
      db.prepare(
        "INSERT INTO memberships (id, workspace_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)",
      ).run(newId(), workspaceId, userId, now);
      return { workspaceId, workspaceName: name };
    })
    .immediate();
}
