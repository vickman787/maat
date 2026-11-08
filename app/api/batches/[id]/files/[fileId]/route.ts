import { NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { readPrivateFile } from "@/lib/storage";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id, fileId } = await params;
    const file = getDb().prepare("SELECT storage_key FROM source_files WHERE id = ? AND batch_id = ? AND workspace_id = ?").get(fileId, id, ctx.workspace.id) as { storage_key: string } | undefined;
    if (!file) return jsonError("Source file not found.", 404);
    return new NextResponse(new Uint8Array(readPrivateFile(file.storage_key)), { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="original-source.csv"',
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return handleApiError(error); }
}
