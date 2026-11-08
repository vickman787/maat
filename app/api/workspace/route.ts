import { NextResponse } from "next/server";
import { assertSameOrigin, handleApiError, jsonError, readJsonBody } from "@/lib/api";
import { requireWorkspaceContext } from "@/lib/auth";
import { getDb, nowIso } from "@/lib/db";

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const ctx = await requireWorkspaceContext();
    if (ctx.workspace.isDemo) {
      return jsonError("The demo workspace name is fixed. Create a personal workspace to use Settings.", 403);
    }
    if (ctx.role !== "owner") return jsonError("Only the workspace owner can change the business name.", 403);
    const body = await readJsonBody<{ businessName?: string }>(request);
    const name = typeof body.businessName === "string" ? body.businessName.trim() : "";
    if (!name) return jsonError("Business display name is required.", 400);
    if (name.length > 120) return jsonError("Business display name must be 120 characters or fewer.", 400);
    getDb()
      .prepare("UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?")
      .run(name, nowIso(), ctx.workspace.id);
    return NextResponse.json({ ok: true, businessName: name });
  } catch (error) {
    return handleApiError(error);
  }
}
