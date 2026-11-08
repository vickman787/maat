import type Database from "better-sqlite3";
import { getBatchOverview, type BatchOverview } from "./batches";
import { newId, nowIso } from "./db";
import { minorToDecimalString } from "./money";
import type { ReviewEvent } from "./types";

function safeCsvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(safeCsvCell).join(",")];
  for (const row of rows) lines.push(row.map(safeCsvCell).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

type DecisionIndex = Map<string, ReviewEvent>;

function latestDecisions(db: Database.Database, workspaceId: string, batchId: string): DecisionIndex {
  const events = db
    .prepare(
      "SELECT * FROM review_events WHERE batch_id = ? AND workspace_id = ? ORDER BY created_at DESC",
    )
    .all(batchId, workspaceId) as ReviewEvent[];
  const map = new Map<string, ReviewEvent>();
  for (const event of events) {
    if (!map.has(event.invoice_row_id)) map.set(event.invoice_row_id, event);
  }
  return map;
}

export function invoiceCsv(db: Database.Database, workspaceId: string, batchId: string): string | null {
  const overview = getBatchOverview(db, workspaceId, batchId);
  if (!overview) return null;
  const decisions = latestDecisions(db, workspaceId, batchId);
  const headers = [
    "invoice_id",
    "customer_name",
    "invoice_amount",
    "currency",
    "due_date",
    "status",
    "review_state",
    "confirmed_allocated",
    "outstanding",
    "allocated_payment_ids",
    "suggestion_type",
    "suggestion_status",
    "last_decision",
    "last_decision_at",
    "source_file",
    "source_row",
  ];
  const rows = overview.invoices.map((invoice) => {
    const decision = decisions.get(invoice.id);
    return [
      invoice.invoiceId,
      invoice.customerName,
      minorToDecimalString(invoice.amountMinor, invoice.currency),
      invoice.currency,
      invoice.dueDate ?? "",
      invoice.status,
      invoice.reviewState,
      minorToDecimalString(invoice.allocatedMinor, invoice.currency),
      minorToDecimalString(invoice.outstandingMinor, invoice.currency),
      invoice.allocations.map((allocation) => allocation.paymentId).join(" "),
      invoice.suggestion?.type ?? "",
      invoice.suggestion?.status ?? "",
      decision?.action ?? "",
      decision?.created_at ?? "",
      invoice.sourceFile,
      invoice.sourceRow,
    ];
  });
  return toCsv(headers, rows);
}

export function unallocatedPaymentsCsv(
  db: Database.Database,
  workspaceId: string,
  batchId: string,
): string | null {
  const overview = getBatchOverview(db, workspaceId, batchId);
  if (!overview) return null;
  const headers = [
    "payment_id",
    "payer_name",
    "payment_amount",
    "currency",
    "reference",
    "paid_at",
    "allocated",
    "remaining",
    "suggested_for_invoices",
    "source_file",
    "source_row",
  ];
  const rows = overview.payments
    .filter((payment) => payment.remainingMinor > 0)
    .map((payment) => {
      const suggestedFor = overview.invoices
        .filter(
          (invoice) =>
            invoice.suggestion?.payment_row_id === payment.id &&
            (invoice.suggestion.status === "pending" || invoice.suggestion.status === "left_unresolved"),
        )
        .map((invoice) => invoice.invoiceId)
        .join(" ");
      return [
        payment.paymentId,
        payment.payerName,
        minorToDecimalString(payment.amountMinor, payment.currency),
        payment.currency,
        payment.reference ?? "",
        payment.paidAt ?? "",
        minorToDecimalString(payment.allocatedMinor, payment.currency),
        minorToDecimalString(payment.remainingMinor, payment.currency),
        suggestedFor,
        payment.sourceFile,
        payment.sourceRow,
      ];
    });
  return toCsv(headers, rows);
}

export function decisionsCsv(db: Database.Database, workspaceId: string, batchId: string): string | null {
  const overview = getBatchOverview(db, workspaceId, batchId);
  if (!overview) return null;
  const events = db
    .prepare("SELECT * FROM review_events WHERE batch_id = ? AND workspace_id = ? ORDER BY created_at")
    .all(batchId, workspaceId) as ReviewEvent[];
  const invoiceById = new Map(overview.invoices.map((invoice) => [invoice.id, invoice]));
  const paymentById = new Map(overview.payments.map((payment) => [payment.id, payment]));
  const headers = [
    "event_id",
    "invoice_id",
    "payment_id",
    "action",
    "amount",
    "currency",
    "note",
    "actor",
    "created_at",
    "allocation_id",
    "reverses_event_id",
  ];
  const rows = events.map((event) => [
    event.id,
    invoiceById.get(event.invoice_row_id)?.invoiceId ?? "",
    event.payment_row_id ? paymentById.get(event.payment_row_id)?.paymentId ?? "" : "",
    event.action,
    event.amount_minor === null ? "" : minorToDecimalString(event.amount_minor, overview.batch.currency),
    overview.batch.currency,
    event.note ?? "",
    event.actor_label,
    event.created_at,
    event.allocation_id ?? "",
    event.reverses_event_id ?? "",
  ]);
  return toCsv(headers, rows);
}

export function recordReportSnapshot(
  db: Database.Database,
  workspaceId: string,
  batchId: string,
  userId: string | null,
  overview: BatchOverview,
  generatedAt = nowIso(),
): string {
  const id = newId();
  const totals = {
    invoiced_minor: overview.summary.invoiced_minor,
    imported_minor: overview.summary.imported_minor,
    confirmed_minor: overview.summary.confirmed_minor,
    outstanding_minor: overview.summary.outstanding_minor,
    invoice_count: overview.summary.invoice_count,
    payment_count: overview.summary.payment_count,
    exact_count: overview.summary.exact_count,
    partial_count: overview.summary.partial_count,
    unpaid_count: overview.summary.unpaid_count,
    ambiguous_count: overview.summary.ambiguous_count,
    unallocated_payment_count: overview.summary.unallocated_payment_count,
    unallocated_minor: overview.summary.unallocated_minor,
    currency: overview.batch.currency,
  };
  const hashes = Object.fromEntries(overview.files.map((file) => [file.kind, file.sha256]));
  db.prepare(
    `INSERT INTO reports (id, batch_id, workspace_id, generated_at, generated_by_user_id, totals_json, source_hashes_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, batchId, workspaceId, generatedAt, userId, JSON.stringify(totals), JSON.stringify(hashes));
  return id;
}
