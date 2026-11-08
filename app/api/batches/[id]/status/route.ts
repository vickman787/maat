import { NextResponse } from "next/server";
import { handleApiError, noStore } from "@/lib/api";
import { requireWorkspaceContext } from "@/lib/auth";
import { getBatchOverview } from "@/lib/batches";
import { getDb } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id } = await params;
    const overview = getBatchOverview(getDb(), ctx.workspace.id, id);
    if (!overview) {
      return noStore(NextResponse.json({ error: "Batch not found." }, { status: 404 }));
    }
    return noStore(
      NextResponse.json({
        ok: true,
        batchStatus: overview.batch.status,
        summary: overview.summary,
        job: overview.job
          ? {
              id: overview.job.id,
              status: overview.job.status,
              stage: overview.job.stage,
              progress: overview.job.progress,
              message: overview.job.message,
              error: overview.job.error,
              retry_count: overview.job.retry_count,
              max_retries: overview.job.max_retries,
            }
          : null,
      }),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
