import { parse } from "csv-parse/sync";
import { csvMaxRows } from "./config";
import { normalizeCurrency, normalizeDate, normalizeReference, normalizeText, parseAmountToMinor } from "./money";

export type CsvTable = {
  headers: string[];
  rows: Array<{ dataRowNumber: number; values: Record<string, string>; raw: string[] }>;
  delimiter: string;
};

export type RowError = {
  row: number;
  column: string;
  message: string;
  value?: string;
};

export type InvoiceMapping = {
  invoice_id: string;
  customer_name: string;
  amount: string;
  currency: string;
  due_date?: string;
};

export type PaymentMapping = {
  payment_id: string;
  payer_name: string;
  amount: string;
  currency: string;
  reference?: string;
  paid_at?: string;
};

export type MappedInvoice = {
  invoiceId: string;
  customerName: string;
  amountMinor: number;
  currency: string;
  dueDate: string | null;
  raw: Record<string, string>;
};

export type MappedPayment = {
  paymentId: string;
  payerName: string;
  amountMinor: number;
  currency: string;
  reference: string | null;
  paidAt: string | null;
  raw: Record<string, string>;
};

export type ParseResult =
  | { ok: true; table: CsvTable }
  | { ok: false; error: string; row?: number };

export function parseCsv(text: string, maxRows = csvMaxRows()): ParseResult {
  const clean = text.replace(/^\uFEFF/, "");
  if (!clean.trim()) return { ok: false, error: "The file is empty." };
  let records: string[][];
  try {
    records = parse(clean, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: false,
      trim: false,
      columns: false,
    }) as string[][];
  } catch (error) {
    const message = error instanceof Error ? error.message : "CSV could not be parsed.";
    const lineMatch = /line: (\d+)/i.exec(message);
    return {
      ok: false,
      error: "The CSV is malformed. Check quoted values, commas, and line endings.",
      row: lineMatch ? Number(lineMatch[1]) : undefined,
    };
  }
  if (records.length === 0) return { ok: false, error: "The file has no header row." };
  const headers = records[0]!.map((header) => header.trim());
  if (headers.some((header) => !header)) {
    return { ok: false, error: "Every column needs a header name." };
  }
  const seen = new Set<string>();
  for (const header of headers) {
    const key = header.toLowerCase();
    if (seen.has(key)) return { ok: false, error: `Duplicate column header: ${header}.` };
    seen.add(key);
  }
  const dataRecords = records.slice(1);
  if (dataRecords.length === 0) return { ok: false, error: "The file has no data rows." };
  if (dataRecords.length > maxRows) {
    return { ok: false, error: `The file has ${dataRecords.length} data rows; the limit is ${maxRows}.` };
  }
  const rows = dataRecords.map((record, index) => {
    if (record.length !== headers.length) {
      return {
        dataRowNumber: index + 1,
        values: {},
        raw: record,
      };
    }
    const values: Record<string, string> = {};
    headers.forEach((header, i) => {
      values[header] = record[i] ?? "";
    });
    return { dataRowNumber: index + 1, values, raw: record };
  });
  const badLength = rows.find((row) => row.raw.length !== headers.length);
  if (badLength) {
    return {
      ok: false,
      error: `Row ${badLength.dataRowNumber} has ${badLength.raw.length} columns; expected ${headers.length}.`,
      row: badLength.dataRowNumber,
    };
  }
  return { ok: true, table: { headers, rows, delimiter: "," } };
}

const INVOICE_ALIASES: Record<keyof InvoiceMapping, string[]> = {
  invoice_id: ["invoice_id", "invoiceid", "invoice", "invoice_number", "invoicenumber", "number"],
  customer_name: ["customer_name", "customername", "customer", "client", "client_name", "account"],
  amount: ["amount", "total", "total_due", "invoiced_amount", "amount_due", "value"],
  currency: ["currency", "ccy", "currency_code"],
  due_date: ["due_date", "duedate", "date_due", "due", "invoice_date"],
};

const PAYMENT_ALIASES: Record<keyof PaymentMapping, string[]> = {
  payment_id: ["payment_id", "paymentid", "payment", "payment_number", "paymentnumber", "id"],
  payer_name: ["payer_name", "payername", "payer", "customer", "client", "name"],
  amount: ["amount", "amount_received", "received", "payment_amount", "total", "value"],
  currency: ["currency", "ccy", "currency_code"],
  reference: ["reference", "invoice_reference", "invoice_ref", "reference_number", "ref", "invoice"],
  paid_at: ["paid_at", "paidat", "payment_date", "date_paid", "date", "paid_on"],
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function suggest(headers: string[], aliases: string[]): string | undefined {
  const normalized = new Map(headers.map((header) => [normalizeHeader(header), header]));
  for (const alias of aliases) {
    const match = normalized.get(normalizeHeader(alias));
    if (match) return match;
  }
  return undefined;
}

export function suggestInvoiceMapping(headers: string[]): Partial<InvoiceMapping> {
  const result: Partial<InvoiceMapping> = {};
  for (const [field, aliases] of Object.entries(INVOICE_ALIASES) as Array<
    [keyof InvoiceMapping, string[]]
  >) {
    const match = suggest(headers, aliases);
    if (match) result[field] = match;
  }
  return result;
}

export function suggestPaymentMapping(headers: string[]): Partial<PaymentMapping> {
  const result: Partial<PaymentMapping> = {};
  for (const [field, aliases] of Object.entries(PAYMENT_ALIASES) as Array<
    [keyof PaymentMapping, string[]]
  >) {
    const match = suggest(headers, aliases);
    if (match) result[field] = match;
  }
  return result;
}

export function validateMapping(
  table: CsvTable,
  mapping: Record<string, unknown>,
  kind: "invoices" | "payments",
): string[] {
  const errors: string[] = [];
  const required =
    kind === "invoices"
      ? ["invoice_id", "customer_name", "amount", "currency"]
      : ["payment_id", "payer_name", "amount", "currency"];
  const allowed =
    kind === "invoices"
      ? ["invoice_id", "customer_name", "amount", "currency", "due_date"]
      : ["payment_id", "payer_name", "amount", "currency", "reference", "paid_at"];
  for (const field of required) {
    const header = mapping[field];
    if (typeof header !== "string" || !header) {
      errors.push(`${field.replace(/_/g, " ")} must be mapped to a column.`);
    } else if (!table.headers.includes(header)) {
      errors.push(`${field.replace(/_/g, " ")} maps to a column that is not in this file.`);
    }
  }
  for (const field of Object.keys(mapping)) {
    if (!allowed.includes(field)) continue;
    const header = mapping[field];
    if (typeof header === "string" && header && !table.headers.includes(header)) {
      errors.push(`${field.replace(/_/g, " ")} maps to a column that is not in this file.`);
    }
  }
  const used = Object.entries(mapping)
    .filter(([field, value]) => allowed.includes(field) && typeof value === "string" && value)
    .map(([, value]) => value as string);
  const duplicates = used.filter((header, index) => used.indexOf(header) !== index);
  if (duplicates.length) errors.push(`Each source column can only be mapped once (${[...new Set(duplicates)].join(", ")}).`);
  return [...new Set(errors)];
}

export type ValidatedInvoices =
  | { ok: true; rows: MappedInvoice[] }
  | { ok: false; errors: RowError[] };

export function validateInvoiceRows(
  table: CsvTable,
  mapping: InvoiceMapping,
  batchCurrency: string,
): ValidatedInvoices {
  const errors: RowError[] = [];
  const rows: MappedInvoice[] = [];
  const seenIds = new Map<string, number>();
  for (const row of table.rows) {
    const invoiceId = normalizeText(row.values[mapping.invoice_id], 120);
    const customerName = normalizeText(row.values[mapping.customer_name], 200);
    const amountRaw = row.values[mapping.amount] ?? "";
    const currencyRaw = row.values[mapping.currency] ?? "";
    const dueRaw = mapping.due_date ? row.values[mapping.due_date] ?? "" : "";
    if (!invoiceId) {
      errors.push({ row: row.dataRowNumber, column: mapping.invoice_id, message: "Invoice ID is required.", value: row.values[mapping.invoice_id] });
    } else {
      const key = invoiceId.toLowerCase();
      if (seenIds.has(key)) {
        errors.push({
          row: row.dataRowNumber,
          column: mapping.invoice_id,
          message: `Duplicate invoice ID "${invoiceId}" (first seen in row ${seenIds.get(key)}).`,
          value: invoiceId,
        });
      } else {
        seenIds.set(key, row.dataRowNumber);
      }
    }
    if (!customerName) {
      errors.push({ row: row.dataRowNumber, column: mapping.customer_name, message: "Customer name is required.", value: row.values[mapping.customer_name] });
    }
    const currency = normalizeCurrency(currencyRaw);
    if (!currency) {
      errors.push({ row: row.dataRowNumber, column: mapping.currency, message: "Currency must be a three-letter code such as USD.", value: currencyRaw });
    } else if (currency !== batchCurrency) {
      errors.push({
        row: row.dataRowNumber,
        column: mapping.currency,
        message: `Currency ${currency} does not match this batch (${batchCurrency}). Mixed currencies are not supported.`,
        value: currencyRaw,
      });
    }
    const amount = parseAmountToMinor(amountRaw, batchCurrency);
    if (!amount.ok) {
      errors.push({ row: row.dataRowNumber, column: mapping.amount, message: amount.error, value: amountRaw });
    }
    const due = normalizeDate(dueRaw);
    if (!due.ok) {
      errors.push({ row: row.dataRowNumber, column: mapping.due_date ?? "due_date", message: due.error, value: dueRaw });
    }
    if (invoiceId && customerName && currency === batchCurrency && amount.ok && due.ok) {
      rows.push({
        invoiceId,
        customerName,
        amountMinor: amount.minor,
        currency,
        dueDate: due.value,
        raw: row.values,
      });
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, rows };
}

export type ValidatedPayments =
  | { ok: true; rows: MappedPayment[] }
  | { ok: false; errors: RowError[] };

export function validatePaymentRows(
  table: CsvTable,
  mapping: PaymentMapping,
  batchCurrency: string,
): ValidatedPayments {
  const errors: RowError[] = [];
  const rows: MappedPayment[] = [];
  const seenIds = new Map<string, number>();
  for (const row of table.rows) {
    const paymentId = normalizeText(row.values[mapping.payment_id], 120);
    const payerName = normalizeText(row.values[mapping.payer_name], 200);
    const amountRaw = row.values[mapping.amount] ?? "";
    const currencyRaw = row.values[mapping.currency] ?? "";
    const referenceRaw = mapping.reference ? row.values[mapping.reference] ?? "" : "";
    const paidRaw = mapping.paid_at ? row.values[mapping.paid_at] ?? "" : "";
    if (!paymentId) {
      errors.push({ row: row.dataRowNumber, column: mapping.payment_id, message: "Payment ID is required.", value: row.values[mapping.payment_id] });
    } else {
      const key = paymentId.toLowerCase();
      if (seenIds.has(key)) {
        errors.push({
          row: row.dataRowNumber,
          column: mapping.payment_id,
          message: `Duplicate payment ID "${paymentId}" (first seen in row ${seenIds.get(key)}).`,
          value: paymentId,
        });
      } else {
        seenIds.set(key, row.dataRowNumber);
      }
    }
    if (!payerName) {
      errors.push({ row: row.dataRowNumber, column: mapping.payer_name, message: "Payer name is required.", value: row.values[mapping.payer_name] });
    }
    const currency = normalizeCurrency(currencyRaw);
    if (!currency) {
      errors.push({ row: row.dataRowNumber, column: mapping.currency, message: "Currency must be a three-letter code such as USD.", value: currencyRaw });
    } else if (currency !== batchCurrency) {
      errors.push({
        row: row.dataRowNumber,
        column: mapping.currency,
        message: `Currency ${currency} does not match this batch (${batchCurrency}). Mixed currencies are not supported.`,
        value: currencyRaw,
      });
    }
    const amount = parseAmountToMinor(amountRaw, batchCurrency);
    if (!amount.ok) {
      errors.push({ row: row.dataRowNumber, column: mapping.amount, message: amount.error, value: amountRaw });
    }
    const paid = normalizeDate(paidRaw);
    if (!paid.ok) {
      errors.push({ row: row.dataRowNumber, column: mapping.paid_at ?? "paid_at", message: paid.error, value: paidRaw });
    }
    if (paymentId && payerName && currency === batchCurrency && amount.ok && paid.ok) {
      rows.push({
        paymentId,
        payerName,
        amountMinor: amount.minor,
        currency,
        reference: normalizeReference(referenceRaw),
        paidAt: paid.value,
        raw: row.values,
      });
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, rows };
}

export function previewRows(table: CsvTable, limit = 5): Array<Record<string, string>> {
  return table.rows.slice(0, limit).map((row) => row.values);
}

