import { getDb } from "./db";
import { readSession } from "./session";
import { demoTtlHours } from "./config";
import type { Session } from "./types";

export type AuthUser = {
  id: string;
  privyDid: string;
  email: string | null;
  displayName: string | null;
};

export type AuthWorkspace = {
  id: string;
  name: string;
  isDemo: boolean;
};

export type AuthContext = {
  session: Session;
  user: AuthUser | null;
  workspace: AuthWorkspace | null;
  role: "owner" | "member" | "demo" | null;
  actorLabel: string;
};

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await readSession();
  if (!session) return null;
  const db = getDb();

  if (session.kind === "demo") {
    const cutoff = new Date(Date.now() - demoTtlHours() * 3600 * 1000).toISOString();
    const demo = db
      .prepare(
        `SELECT ds.id, w.id AS workspace_id, w.name, w.is_demo
         FROM demo_sessions ds
         JOIN workspaces w ON w.id = ds.workspace_id
         WHERE ds.id = ? AND ds.workspace_id = ? AND w.is_demo = 1 AND ds.created_at >= ?`,
      )
      .get(session.demoSessionId, session.workspaceId, cutoff) as
      | { id: string; workspace_id: string; name: string; is_demo: number }
      | undefined;
    if (!demo) return null;
    db.prepare("UPDATE demo_sessions SET last_seen_at = ? WHERE id = ?").run(new Date().toISOString(), demo.id);
    return {
      session,
      user: null,
      workspace: { id: demo.workspace_id, name: demo.name, isDemo: true },
      role: "demo",
      actorLabel: "Demo visitor",
    };
  }

  const user = db
    .prepare("SELECT id, privy_did, email, display_name FROM users WHERE id = ?")
    .get(session.userId) as
    | { id: string; privy_did: string; email: string | null; display_name: string | null }
    | undefined;
  if (!user) return null;

  const authUser: AuthUser = {
    id: user.id,
    privyDid: user.privy_did,
    email: user.email,
    displayName: user.display_name,
  };

  if (!session.workspaceId) {
    return {
      session,
      user: authUser,
      workspace: null,
      role: null,
      actorLabel: user.email ?? user.display_name ?? "Signed-in user",
    };
  }

  const membership = db
    .prepare(
      `SELECT m.role, w.id, w.name, w.is_demo
       FROM memberships m
       JOIN workspaces w ON w.id = m.workspace_id
       WHERE m.user_id = ? AND m.workspace_id = ?`,
    )
    .get(user.id, session.workspaceId) as
    | { role: string; id: string; name: string; is_demo: number }
    | undefined;
  if (!membership) return null;

  return {
    session,
    user: authUser,
    workspace: { id: membership.id, name: membership.name, isDemo: Boolean(membership.is_demo) },
    role: membership.role === "owner" ? "owner" : "member",
    actorLabel: authUser.email ?? authUser.displayName ?? "Workspace member",
  };
}

export async function requireAuthContext(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthError(401, "Your session has expired. Please sign in again.");
  return ctx;
}

export async function requireUserContext(): Promise<AuthContext & { user: AuthUser }> {
  const ctx = await requireAuthContext();
  if (!ctx.user) throw new AuthError(403, "A personal session is required for this action.");
  return ctx as AuthContext & { user: AuthUser };
}

export async function requireWorkspaceContext(): Promise<
  AuthContext & { workspace: AuthWorkspace }
> {
  const ctx = await requireAuthContext();
  if (!ctx.workspace) throw new AuthError(403, "Finish setting up your workspace first.");
  return ctx as AuthContext & { workspace: AuthWorkspace };
}
