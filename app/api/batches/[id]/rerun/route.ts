import { NextResponse } from "next/server";
import { assertSameOrigin, handleApiError, jsonError } from "@/lib/api";
import { requireWorkspaceContext } from "@/lib/auth";
import { rerunMatching } from "@/lib/jobs";
import { getDb } from "@/lib/db";
import { getBatch } from "@/lib/batches";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const ctx = await requireWorkspaceContext();
    const { id } = await params;
    if (!getBatch(getDb(), ctx.workspace.id, id)) return jsonError("Batch not found.", 404);
    try {
      const job = rerunMatching(getDb(), ctx.workspace.id, id);
      return NextResponse.json({ ok: true, jobId: job.id, status: job.status });
    } catch (error) {
      if (error instanceof Error) return jsonError(error.message, 409);
      throw error;
    }
  } catch (error) {
    return handleApiError(error);
  }
}
