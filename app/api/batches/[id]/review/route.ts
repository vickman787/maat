import { NextResponse } from "next/server";
import { assertSameOrigin, handleApiError, jsonError, readJsonBody } from "@/lib/api";
import { requireWorkspaceContext } from "@/lib/auth";
import { performReview, type ReviewPayload } from "@/lib/review";
import { getDb } from "@/lib/db";

const ACTIONS = new Set(["confirm", "reject", "leave_unresolved", "manual_allocate", "undo"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const ctx = await requireWorkspaceContext();
    const { id } = await params;
    const raw = await readJsonBody<Record<string, unknown>>(request);
    const action = String(raw.action ?? "");
    if (!ACTIONS.has(action)) return jsonError("Unknown review action.", 400);
    const invoiceRowId = typeof raw.invoiceRowId === "string" ? raw.invoiceRowId : "";
    if (!invoiceRowId) return jsonError("Invoice is required.", 400);
    const payload: ReviewPayload = {
      action: action as ReviewPayload["action"],
      suggestionId: typeof raw.suggestionId === "string" ? raw.suggestionId : undefined,
      paymentRowId: typeof raw.paymentRowId === "string" ? raw.paymentRowId : undefined,
      amount: typeof raw.amount === "string" ? raw.amount : undefined,
      note: typeof raw.note === "string" ? raw.note : undefined,
      allocationId: typeof raw.allocationId === "string" ? raw.allocationId : undefined,
    };
    const result = performReview(getDb(), ctx, ctx.workspace.id, id, invoiceRowId, payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleApiError(error);
  }
}
