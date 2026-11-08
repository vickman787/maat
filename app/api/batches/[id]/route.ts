import { NextResponse } from "next/server";
import { assertSameOrigin, handleApiError, jsonError } from "@/lib/api";
import { requireWorkspaceContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { deletePrivateFile } from "@/lib/storage";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const ctx = await requireWorkspaceContext();
    const { id } = await params;
    const db = getDb();
    const batch = db
      .prepare("SELECT id FROM batches WHERE id = ? AND workspace_id = ?")
      .get(id, ctx.workspace.id) as { id: string } | undefined;
    if (!batch) return jsonError("Batch not found.", 404);
    const activeJob = db
      .prepare(
        "SELECT id FROM jobs WHERE batch_id = ? AND workspace_id = ? AND status IN ('queued','validating','matching','explaining')",
      )
      .get(id, ctx.workspace.id);
    if (activeJob) return jsonError("Wait for the reconciliation job to finish before deleting this batch.", 409);
    const files = db
      .prepare("SELECT storage_key FROM source_files WHERE batch_id = ? AND workspace_id = ?")
      .all(id, ctx.workspace.id) as Array<{ storage_key: string }>;
    for (const file of files) deletePrivateFile(file.storage_key);
    db.prepare("DELETE FROM batches WHERE id = ? AND workspace_id = ?").run(id, ctx.workspace.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

