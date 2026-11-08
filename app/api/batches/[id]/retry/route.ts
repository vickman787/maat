import { NextResponse } from "next/server";
import { assertSameOrigin, handleApiError, jsonError } from "@/lib/api";
import { requireWorkspaceContext } from "@/lib/auth";
import { retryFailedJob } from "@/lib/jobs";
import { getDb } from "@/lib/db";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const ctx = await requireWorkspaceContext();
    const { id } = await params;
    try {
      const job = retryFailedJob(getDb(), ctx.workspace.id, id);
      return NextResponse.json({ ok: true, jobId: job.id, status: job.status });
    } catch (error) {
      if (error instanceof Error) return jsonError(error.message, 409);
      throw error;
    }
  } catch (error) {
    return handleApiError(error);
  }
}
