import { NextResponse } from "next/server";
import { assertSameOrigin, handleApiError, jsonError, readJsonBody } from "@/lib/api";
import { requireUserContext } from "@/lib/auth";
import { createWorkspaceForUser } from "@/lib/accounts";
import { attachSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { AuthError } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const ctx = await requireUserContext();
    if (ctx.workspace) {
      return NextResponse.json({ ok: true, workspaceId: ctx.workspace.id, alreadyExists: true });
    }
    const body = await readJsonBody<{ businessName?: string }>(request);
    const name = typeof body.businessName === "string" ? body.businessName.trim() : "";
    if (!name) return jsonError("Business display name is required.", 400);
    if (name.length > 120) return jsonError("Business display name must be 120 characters or fewer.", 400);
    const workspace = createWorkspaceForUser(getDb(), ctx.user.id, name);
    const response = NextResponse.json({ ok: true, workspaceId: workspace.workspaceId });
    return attachSession(response, {
      kind: "user",
      privyAccessToken: ctx.session.kind === "user" ? ctx.session.privyAccessToken : undefined,
      userId: ctx.user.id,
      workspaceId: workspace.workspaceId,
      exp: ctx.session.exp,
    });
  } catch (error) {
    if (error instanceof AuthError) return handleApiError(error);
    if (error instanceof Error && error.message === "Business name is required.") {
      return jsonError("Business display name is required.", 400);
    }
    return handleApiError(error);
  }
}
