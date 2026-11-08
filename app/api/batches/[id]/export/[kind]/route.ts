import { NextResponse } from "next/server";
import { handleApiError, jsonError } from "@/lib/api";
import { requireWorkspaceContext } from "@/lib/auth";
import { getBatchOverview } from "@/lib/batches";
import { getDb } from "@/lib/db";
import { decisionsCsv, invoiceCsv, recordReportSnapshot, unallocatedPaymentsCsv } from "@/lib/reports";

const KINDS = {
  invoices: { file: "reconciliation", fn: invoiceCsv },
  unallocated: { file: "unallocated-payments", fn: unallocatedPaymentsCsv },
  decisions: { file: "decision-history", fn: decisionsCsv },
} as const;

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "batch";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id, kind } = await params;
    const entry = KINDS[kind as keyof typeof KINDS];
    if (!entry) return jsonError("Unknown export type.", 404);
    const db = getDb();
    const overview = getBatchOverview(db, ctx.workspace.id, id);
    if (!overview) return jsonError("Batch not found.", 404);
    const csv = entry.fn(db, ctx.workspace.id, id);
    if (csv === null) return jsonError("Batch not found.", 404);
    recordReportSnapshot(db, ctx.workspace.id, id, ctx.user?.id ?? null, overview);
    const filename = `maat-${slug(overview.batch.name)}-${entry.file}.csv`;
    const response = new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
