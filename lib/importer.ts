import type Database from "better-sqlite3";
import { uploadMaxBytes } from "./config";
import {
  parseCsv,
  validateInvoiceRows,
  validateMapping,
  validatePaymentRows,
  type InvoiceMapping,
  type PaymentMapping,
  type RowError,
} from "./csv";
import { newId, nowIso } from "./db";
import { deletePrivateFile, newStorageKey, safeDisplayFilename, savePrivateFile, sha256 } from "./storage";
import { AuthError } from "./auth";

export class ImportValidationError extends Error {
  errors: { invoices: RowError[]; payments: RowError[] };
  fileErrors: string[];
  constructor(fileErrors: string[], invoices: RowError[], payments: RowError[]) {
    super("Upload validation failed.");
    this.fileErrors = fileErrors;
    this.errors = { invoices, payments };
  }
}

export type ImportFile = {
  filename: string;
  mimeType: string;
  bytes: Buffer;
};

export type ImportInput = {
  name: string;
  currency: string;
  invoices: ImportFile;
  payments: ImportFile;
  invoiceMapping: InvoiceMapping;
  paymentMapping: PaymentMapping;
};

const ALLOWED_MIME = new Set([
  "text/csv",
  "application/vnd.ms-excel",
  "text/plain",
  "application/octet-stream",
  "",
]);

function validateFile(file: ImportFile, label: string): string[] {
  const errors: string[] = [];
  if (!file.filename.toLowerCase().endsWith(".csv")) {
    errors.push(`${label}: the file must have a .csv extension.`);
  }
  if (!ALLOWED_MIME.has(file.mimeType) && !file.mimeType.startsWith("text/")) {
    errors.push(`${label}: unsupported file type "${file.mimeType}". Upload a CSV file.`);
  }
  if (file.bytes.length === 0) errors.push(`${label}: the file is empty.`);
  if (file.bytes.length > uploadMaxBytes()) {
    errors.push(`${label}: the file exceeds the ${Math.floor(uploadMaxBytes() / (1024 * 1024))} MB limit.`);
  }
  return errors;
}

export function importBatch(
  db: Database.Database,
  workspaceId: string,
  input: ImportInput,
): { batchId: string; jobId: string; invoiceCount: number; paymentCount: number } {
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new AuthError(400, "Give this reconciliation batch a name.");
  if (input.currency !== "USD") {
    throw new AuthError(400, "Only USD is supported in this MVP. Mixed-currency and conversion workflows are out of scope.");
  }
  const fileErrors = [
    ...validateFile(input.invoices, "Invoices"),
    ...validateFile(input.payments, "Payments"),
  ];

  const invoiceText = input.invoices.bytes.toString("utf8");
  const paymentText = input.payments.bytes.toString("utf8");
  const invoiceParsed = parseCsv(invoiceText);
  const paymentParsed = parseCsv(paymentText);
  if (!invoiceParsed.ok) fileErrors.push(`Invoices: ${invoiceParsed.error}${invoiceParsed.row ? ` (row ${invoiceParsed.row})` : ""}`);
  if (!paymentParsed.ok) fileErrors.push(`Payments: ${paymentParsed.error}${paymentParsed.row ? ` (row ${paymentParsed.row})` : ""}`);
  if (!invoiceParsed.ok || !paymentParsed.ok) {
    throw new ImportValidationError(fileErrors, [], []);
  }

  const invoiceMapping = input.invoiceMapping;
  const paymentMapping = input.paymentMapping;
  const mappingErrors = [
    ...validateMapping(invoiceParsed.table, invoiceMapping, "invoices").map((error) => `Invoices: ${error}`),
    ...validateMapping(paymentParsed.table, paymentMapping, "payments").map((error) => `Payments: ${error}`),
  ];
  if (mappingErrors.length) {
    throw new ImportValidationError([...fileErrors, ...mappingErrors], [], []);
  }

  const invoiceValidated = validateInvoiceRows(invoiceParsed.table, invoiceMapping, input.currency);
  const paymentValidated = validatePaymentRows(paymentParsed.table, paymentMapping, input.currency);
  if (!invoiceValidated.ok || !paymentValidated.ok) {
    throw new ImportValidationError(
      fileErrors,
      invoiceValidated.ok ? [] : invoiceValidated.errors,
      paymentValidated.ok ? [] : paymentValidated.errors,
    );
  }
  if (fileErrors.length) throw new ImportValidationError(fileErrors, [], []);

  const batchId = newId();
  const jobId = newId();
  const createdAt = nowIso();
  const invoiceFileId = newId();
  const paymentFileId = newId();
  const invoiceKey = newStorageKey(workspaceId, batchId);
  const paymentKey = newStorageKey(workspaceId, batchId);
  const invoiceHash = sha256(input.invoices.bytes);
  const paymentHash = sha256(input.payments.bytes);
  const invoiceFilename = safeDisplayFilename(input.invoices.filename);
  const paymentFilename = safeDisplayFilename(input.payments.filename);

  try {
    savePrivateFile(invoiceKey, input.invoices.bytes);
    savePrivateFile(paymentKey, input.payments.bytes);
  } catch (error) {
    deletePrivateFile(invoiceKey);
    deletePrivateFile(paymentKey);
    throw error;
  }

  try {
    db.transaction(() => {
      db.prepare(
        "INSERT INTO batches (id, workspace_id, name, currency, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'queued', ?, ?)",
      ).run(batchId, workspaceId, name, input.currency, createdAt, createdAt);

      db.prepare(
        `INSERT INTO source_files
         (id, batch_id, workspace_id, kind, original_filename, size_bytes, sha256, storage_key, mapping_json, validation_json, uploaded_at)
         VALUES (?, ?, ?, 'invoices', ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        invoiceFileId,
        batchId,
        workspaceId,
        invoiceFilename,
        input.invoices.bytes.length,
        invoiceHash,
        invoiceKey,
        JSON.stringify(invoiceMapping),
        JSON.stringify({ valid: true, rows: invoiceValidated.rows.length, columns: invoiceParsed.table.headers }),
        createdAt,
      );
      db.prepare(
        `INSERT INTO source_files
         (id, batch_id, workspace_id, kind, original_filename, size_bytes, sha256, storage_key, mapping_json, validation_json, uploaded_at)
         VALUES (?, ?, ?, 'payments', ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        paymentFileId,
        batchId,
        workspaceId,
        paymentFilename,
        input.payments.bytes.length,
        paymentHash,
        paymentKey,
        JSON.stringify(paymentMapping),
        JSON.stringify({ valid: true, rows: paymentValidated.rows.length, columns: paymentParsed.table.headers }),
        createdAt,
      );

      const insertInvoice = db.prepare(
        `INSERT INTO invoice_rows
         (id, batch_id, workspace_id, source_file_id, source_row_number, invoice_id, customer_name, amount_minor, currency, due_date, raw_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      invoiceValidated.rows.forEach((row, index) => {
        insertInvoice.run(
          newId(),
          batchId,
          workspaceId,
          invoiceFileId,
          index + 1,
          row.invoiceId,
          row.customerName,
          row.amountMinor,
          row.currency,
          row.dueDate,
          JSON.stringify(row.raw),
          createdAt,
        );
      });
      const insertPayment = db.prepare(
        `INSERT INTO payment_rows
         (id, batch_id, workspace_id, source_file_id, source_row_number, payment_id, payer_name, amount_minor, currency, reference, paid_at, raw_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      paymentValidated.rows.forEach((row, index) => {
        insertPayment.run(
          newId(),
          batchId,
          workspaceId,
          paymentFileId,
          index + 1,
          row.paymentId,
          row.payerName,
          row.amountMinor,
          row.currency,
          row.reference,
          row.paidAt,
          JSON.stringify(row.raw),
          createdAt,
        );
      });

      db.prepare(
        `INSERT INTO jobs
         (id, batch_id, workspace_id, status, stage, progress, message, created_at, updated_at, idempotency_key)
         VALUES (?, ?, ?, 'queued', 'queued', 0, ?, ?, ?, 'initial-import')`,
      ).run(jobId, batchId, workspaceId, "Waiting for the reconciliation worker.", createdAt, createdAt);
    }).immediate();
  } catch (error) {
    deletePrivateFile(invoiceKey);
    deletePrivateFile(paymentKey);
    throw error;
  }

  return {
    batchId,
    jobId,
    invoiceCount: invoiceValidated.rows.length,
    paymentCount: paymentValidated.rows.length,
  };
}

