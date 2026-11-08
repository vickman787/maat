import { NextResponse } from "next/server";
import { assertSameOrigin, handleApiError, jsonError } from "@/lib/api";
import { requireWorkspaceContext } from "@/lib/auth";
import { ImportValidationError, importBatch } from "@/lib/importer";
import type { InvoiceMapping, PaymentMapping } from "@/lib/csv";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

function parseMapping<T>(value: FormDataEntryValue | null): T | null {
  if (typeof value !== "string" || !value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const ctx = await requireWorkspaceContext();
    const form = await request.formData();
    const name = form.get("name");
    const currency = form.get("currency");
    const invoices = form.get("invoices");
    const payments = form.get("payments");
    const invoiceMapping = parseMapping<InvoiceMapping>(form.get("invoiceMapping"));
    const paymentMapping = parseMapping<PaymentMapping>(form.get("paymentMapping"));
    if (typeof name !== "string" || !name.trim()) return jsonError("Give this reconciliation batch a name.", 400);
    if (typeof currency !== "string" || currency !== "USD") return jsonError("Only USD batches are supported.", 400);
    if (!(invoices instanceof File) || !(payments instanceof File)) {
      return jsonError("Choose both an invoices CSV and a payments CSV.", 400);
    }
    if (!invoiceMapping || !paymentMapping) {
      return jsonError("Confirm the column mapping for both files.", 400);
    }
    const imported = importBatch(getDb(), ctx.workspace.id, {
      name,
      currency,
      invoices: {
        filename: invoices.name,
        mimeType: invoices.type,
        bytes: Buffer.from(await invoices.arrayBuffer()),
      },
      payments: {
        filename: payments.name,
        mimeType: payments.type,
        bytes: Buffer.from(await payments.arrayBuffer()),
      },
      invoiceMapping,
      paymentMapping,
    });
    return NextResponse.json({ ok: true, ...imported }, { status: 201 });
  } catch (error) {
    if (error instanceof ImportValidationError) {
      return NextResponse.json(
        { error: "Upload validation failed.", fileErrors: error.fileErrors, errors: error.errors },
        { status: 422 },
      );
    }
    return handleApiError(error);
  }
}
