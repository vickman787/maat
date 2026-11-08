import type Database from "better-sqlite3";
import type {
  Allocation,
  BatchSummary,
  Job,
  PaymentRow,
  Suggestion,
  InvoiceRow,
  InvoiceStatus,
} from "./types";

export type BatchRecord = {
  id: string;
  workspace_id: string;
  name: string;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type InvoiceView = {
  id: string;
  invoiceId: string;
  customerName: string;
  amountMinor: number;
  currency: string;
  dueDate: string | null;
  sourceRow: number;
  sourceFile: string;
  originalValues: Record<string, string>;
  allocatedMinor: number;
  outstandingMinor: number;
  status: InvoiceStatus;
  reviewState: "needs_review" | "unresolved" | "confirmed" | "auto_confirmed" | "ready";
  suggestion: Suggestion | null;
  allocations: Array<{
    id: string;
    paymentRowId: string;
    paymentId: string;
    payerName: string;
    amountMinor: number;
    source: string;
    ruleReason: string | null;
    createdAt: string;
  }>;
};

export type PaymentView = {
  id: string;
  paymentId: string;
  payerName: string;
  amountMinor: number;
  currency: string;
  reference: string | null;
  paidAt: string | null;
  sourceRow: number;
  sourceFile: string;
  originalValues: Record<string, string>;
  allocatedMinor: number;
  remainingMinor: number;
};

export type SourceFileView = {
  id: string;
  kind: "invoices" | "payments";
  originalFilename: string;
  sizeBytes: number;
  sha256: string;
  uploadedAt: string;
  storageKey: string;
};

export type BatchOverview = {
  batch: BatchRecord;
  summary: BatchSummary;
  invoices: InvoiceView[];
  payments: PaymentView[];
  files: SourceFileView[];
  job: Job | null;
};

export function getBatch(
  db: Database.Database,
  workspaceId: string,
  batchId: string,
): BatchRecord | null {
  return (
    (db
      .prepare(
        "SELECT id, workspace_id, name, currency, status, created_at, updated_at FROM batches WHERE id = ? AND workspace_id = ?",
      )
      .get(batchId, workspaceId) as BatchRecord | undefined) ?? null
  );
}

export function getBatchOverview(
  db: Database.Database,
  workspaceId: string,
  batchId: string,
): BatchOverview | null {
  const batch = getBatch(db, workspaceId, batchId);
  if (!batch) return null;

  const invoiceRows = db
    .prepare(
      `SELECT i.*, f.original_filename
       FROM invoice_rows i
       JOIN source_files f ON f.id = i.source_file_id
       WHERE i.batch_id = ? AND i.workspace_id = ?
       ORDER BY i.source_row_number`,
    )
    .all(batchId, workspaceId) as Array<InvoiceRow & { original_filename: string }>;

  const paymentRows = db
    .prepare(
      `SELECT p.*, f.original_filename
       FROM payment_rows p
       JOIN source_files f ON f.id = p.source_file_id
       WHERE p.batch_id = ? AND p.workspace_id = ?
       ORDER BY p.source_row_number`,
    )
    .all(batchId, workspaceId) as Array<PaymentRow & { original_filename: string }>;

  const allocations = db
    .prepare(
      `SELECT a.*, p.payment_id, p.payer_name
       FROM allocations a
       JOIN payment_rows p ON p.id = a.payment_row_id
       WHERE a.batch_id = ? AND a.workspace_id = ? AND a.reversed_at IS NULL
       ORDER BY a.created_at`,
    )
    .all(batchId, workspaceId) as Array<
    Allocation & { payment_id: string; payer_name: string }
  >;

  const suggestions = db
    .prepare("SELECT * FROM suggestions WHERE batch_id = ? AND workspace_id = ? ORDER BY created_at DESC")
    .all(batchId, workspaceId) as Suggestion[];

  const files = db
    .prepare(
      `SELECT id, kind, original_filename, size_bytes, sha256, uploaded_at, storage_key
       FROM source_files WHERE batch_id = ? AND workspace_id = ? ORDER BY kind, uploaded_at`,
    )
    .all(batchId, workspaceId)
    .map((row) => {
      const r = row as {
        id: string;
        kind: "invoices" | "payments";
        original_filename: string;
        size_bytes: number;
        sha256: string;
        uploaded_at: string;
        storage_key: string;
      };
      return {
        id: r.id,
        kind: r.kind,
        originalFilename: r.original_filename,
        sizeBytes: r.size_bytes,
        sha256: r.sha256,
        uploadedAt: r.uploaded_at,
        storageKey: r.storage_key,
      };
    });

  const job = db
    .prepare("SELECT * FROM jobs WHERE batch_id = ? AND workspace_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(batchId, workspaceId) as Job | undefined;

  const invoiceAllocated = new Map<string, number>();
  const paymentAllocated = new Map<string, number>();
  const allocationsByInvoice = new Map<string, InvoiceView["allocations"]>();
  for (const allocation of allocations) {
    invoiceAllocated.set(
      allocation.invoice_row_id,
      (invoiceAllocated.get(allocation.invoice_row_id) ?? 0) + allocation.amount_minor,
    );
    paymentAllocated.set(
      allocation.payment_row_id,
      (paymentAllocated.get(allocation.payment_row_id) ?? 0) + allocation.amount_minor,
    );
    const list = allocationsByInvoice.get(allocation.invoice_row_id) ?? [];
    list.push({
      id: allocation.id,
      paymentRowId: allocation.payment_row_id,
      paymentId: allocation.payment_id,
      payerName: allocation.payer_name,
      amountMinor: allocation.amount_minor,
      source: allocation.source,
      ruleReason: allocation.rule_reason,
      createdAt: allocation.created_at,
    });
    allocationsByInvoice.set(allocation.invoice_row_id, list);
  }

  const suggestionByInvoice = new Map<string, Suggestion>();
  for (const suggestion of suggestions) {
    const current = suggestionByInvoice.get(suggestion.invoice_row_id);
    if (!current) {
      suggestionByInvoice.set(suggestion.invoice_row_id, suggestion);
      continue;
    }
    const currentPending = current.status === "pending";
    const nextPending = suggestion.status === "pending";
    if (nextPending && !currentPending) {
      suggestionByInvoice.set(suggestion.invoice_row_id, suggestion);
    }
  }

  const invoices: InvoiceView[] = invoiceRows.map((row) => {
    const allocatedMinor = invoiceAllocated.get(row.id) ?? 0;
    const outstandingMinor = row.amount_minor - allocatedMinor;
    const suggestion = suggestionByInvoice.get(row.id) ?? null;
    let status: InvoiceStatus;
    if (outstandingMinor <= 0) {
      status = allocationsByInvoice.get(row.id)?.every((allocation) => allocation.source === "automatic")
        ? "exact" : "settled";
    } else if (allocatedMinor > 0) {
      status = "partial";
    } else if (suggestion?.type === "partial" && suggestion.status === "pending") {
      status = "partial";
    } else if (suggestion?.type === "ambiguous" && suggestion.status === "pending") {
      status = "ambiguous";
    } else {
      status = "unpaid";
    }
    let reviewState: InvoiceView["reviewState"] = "ready";
    if (suggestion?.status === "pending") reviewState = "needs_review";
    else if (suggestion?.status === "left_unresolved") reviewState = "unresolved";
    else if (allocatedMinor > 0) {
      reviewState = allocationsByInvoice
        .get(row.id)!
        .every((allocation) => allocation.source === "automatic")
        ? "auto_confirmed"
        : "confirmed";
    } else if (suggestion?.status === "accepted" || suggestion?.status === "auto_allocated") {
      reviewState = "confirmed";
    }
    return {
      id: row.id,
      invoiceId: row.invoice_id,
      customerName: row.customer_name,
      amountMinor: row.amount_minor,
      currency: row.currency,
      dueDate: row.due_date,
      sourceRow: row.source_row_number,
      sourceFile: row.original_filename,
      originalValues: JSON.parse(row.raw_json) as Record<string, string>,
      allocatedMinor,
      outstandingMinor,
      status,
      reviewState,
      suggestion,
      allocations: allocationsByInvoice.get(row.id) ?? [],
    };
  });

  const payments: PaymentView[] = paymentRows.map((row) => {
    const allocatedMinor = paymentAllocated.get(row.id) ?? 0;
    return {
      id: row.id,
      paymentId: row.payment_id,
      payerName: row.payer_name,
      amountMinor: row.amount_minor,
      currency: row.currency,
      reference: row.reference,
      paidAt: row.paid_at,
      sourceRow: row.source_row_number,
      sourceFile: row.original_filename,
      originalValues: JSON.parse(row.raw_json) as Record<string, string>,
      allocatedMinor,
      remainingMinor: row.amount_minor - allocatedMinor,
    };
  });

  const summary = buildSummary(batch, invoices, payments);
  return { batch, summary, invoices, payments, files, job: job ?? null };
}

export function buildSummary(
  batch: BatchRecord,
  invoices: InvoiceView[],
  payments: PaymentView[],
): BatchSummary {
  const invoicedMinor = invoices.reduce((sum, invoice) => sum + invoice.amountMinor, 0);
  const importedMinor = payments.reduce((sum, payment) => sum + payment.amountMinor, 0);
  const confirmedMinor = invoices.reduce((sum, invoice) => sum + invoice.allocatedMinor, 0);
  const outstandingMinor = invoices.reduce((sum, invoice) => sum + invoice.outstandingMinor, 0);
  const exactCount = invoices.filter((invoice) => invoice.status === "exact").length;
  const partialCount = invoices.filter((invoice) => invoice.status === "partial").length;
  const unpaidCount = invoices.filter((invoice) => invoice.status === "unpaid").length;
  const ambiguousCount = invoices.filter((invoice) => invoice.status === "ambiguous").length;
  const needsReviewCount = invoices.filter((invoice) => invoice.reviewState === "needs_review").length;
  const unallocated = payments.filter((payment) => payment.remainingMinor > 0);
  return {
    id: batch.id,
    workspace_id: batch.workspace_id,
    name: batch.name,
    currency: batch.currency,
    status: batch.status as BatchSummary["status"],
    created_at: batch.created_at,
    invoice_count: invoices.length,
    payment_count: payments.length,
    invoiced_minor: invoicedMinor,
    imported_minor: importedMinor,
    confirmed_minor: confirmedMinor,
    outstanding_minor: outstandingMinor,
    exact_count: exactCount,
    partial_count: partialCount,
    unpaid_count: unpaidCount,
    ambiguous_count: ambiguousCount,
    needs_review_count: needsReviewCount,
    unallocated_payment_count: unallocated.length,
    unallocated_minor: unallocated.reduce((sum, payment) => sum + payment.remainingMinor, 0),
  };
}

export function listBatchSummaries(
  db: Database.Database,
  workspaceId: string,
): BatchSummary[] {
  const batches = db
    .prepare("SELECT id FROM batches WHERE workspace_id = ? ORDER BY created_at DESC")
    .all(workspaceId) as Array<{ id: string }>;
  const result: BatchSummary[] = [];
  for (const { id } of batches) {
    const overview = getBatchOverview(db, workspaceId, id);
    if (overview) result.push(overview.summary);
  }
  return result;
}

export function getBatchFiles(
  db: Database.Database,
  workspaceId: string,
  batchId: string,
): SourceFileView[] {
  const rows = db
    .prepare(
      "SELECT id, kind, original_filename, size_bytes, sha256, uploaded_at, storage_key FROM source_files WHERE batch_id = ? AND workspace_id = ? ORDER BY kind",
    )
    .all(batchId, workspaceId) as Array<{
    id: string;
    kind: "invoices" | "payments";
    original_filename: string;
    size_bytes: number;
    sha256: string;
    uploaded_at: string;
    storage_key: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    originalFilename: row.original_filename,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    uploadedAt: row.uploaded_at,
    storageKey: row.storage_key,
  }));
}

