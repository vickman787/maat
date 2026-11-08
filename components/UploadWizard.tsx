"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  LoaderCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";

type LoadedFile = {
  file: File;
  headers: string[];
  rows: Array<Record<string, string>>;
  parseError: string | null;
};

type RowError = { row: number; column: string; message: string };

const INVOICE_FIELDS: Array<{ key: string; label: string; required: boolean }> = [
  { key: "invoice_id", label: "Invoice ID", required: true },
  { key: "customer_name", label: "Customer", required: true },
  { key: "amount", label: "Amount", required: true },
  { key: "currency", label: "Currency", required: true },
  { key: "due_date", label: "Due date", required: false },
];

const PAYMENT_FIELDS: Array<{ key: string; label: string; required: boolean }> = [
  { key: "payment_id", label: "Payment ID", required: true },
  { key: "payer_name", label: "Payer", required: true },
  { key: "amount", label: "Amount", required: true },
  { key: "currency", label: "Currency", required: true },
  { key: "reference", label: "Reference", required: false },
  { key: "paid_at", label: "Paid on", required: false },
];

const INVOICE_ALIASES: Record<string, string[]> = {
  invoice_id: ["invoiceid", "invoice", "invoicenumber", "number"],
  customer_name: ["customername", "customer", "client", "clientname", "account"],
  amount: ["total", "totaldue", "invoicedamount", "amountdue", "value"],
  currency: ["ccy", "currencycode"],
  due_date: ["duedate", "datedue", "due", "invoicedate"],
};

const PAYMENT_ALIASES: Record<string, string[]> = {
  payment_id: ["paymentid", "payment", "paymentnumber", "id"],
  payer_name: ["payername", "payer", "customer", "client", "name"],
  amount: ["amountreceived", "received", "paymentamount", "total", "value"],
  currency: ["ccy", "currencycode"],
  reference: ["invoicereference", "invoiceref", "referencenumber", "ref", "invoice"],
  paid_at: ["paidat", "paymentdate", "datepaid", "date", "paidon"],
};

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function suggest(headers: string[], aliases: Record<string, string[]>): Record<string, string> {
  const map: Record<string, string> = {};
  const byNorm = new Map(headers.map((header) => [norm(header), header]));
  for (const [field, candidates] of Object.entries(aliases)) {
    const direct = byNorm.get(norm(field));
    if (direct) {
      map[field] = direct;
      continue;
    }
    for (const candidate of candidates) {
      const match = byNorm.get(candidate);
      if (match) {
        map[field] = match;
        break;
      }
    }
  }
  return map;
}

function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadWizard() {
  const router = useRouter();
  const [name, setName] = useState("November client payments");
  const [invoices, setInvoices] = useState<LoadedFile | null>(null);
  const [payments, setPayments] = useState<LoadedFile | null>(null);
  const [invoiceMapping, setInvoiceMapping] = useState<Record<string, string>>({});
  const [paymentMapping, setPaymentMapping] = useState<Record<string, string>>({});
  const [clientError, setClientError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<{
    error?: string;
    fileErrors?: string[];
    errors?: { invoices?: RowError[]; payments?: RowError[] };
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const invoiceInput = useRef<HTMLInputElement>(null);
  const paymentInput = useRef<HTMLInputElement>(null);

  async function loadFile(file: File, kind: "invoices" | "payments") {
    setClientError(null);
    setServerErrors(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setClientError(`${file.name}: choose a .csv file.`);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setClientError(`${file.name}: the limit is 5 MB per file.`);
      return;
    }
    if (file.size === 0) {
      setClientError(`${file.name}: the file is empty.`);
      return;
    }
    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
    });
    const headers = (parsed.meta.fields ?? []).filter(Boolean);
    if (headers.length === 0 || parsed.data.length === 0) {
      setClientError(`${file.name}: the CSV needs a header row and at least one data row.`);
      return;
    }
    if (parsed.data.length > 5000) {
      setClientError(`${file.name}: ${parsed.data.length} rows exceeds the 5,000 row limit.`);
      return;
    }
    const loaded: LoadedFile = {
      file,
      headers,
      rows: parsed.data,
      parseError: parsed.errors.length ? parsed.errors[0]!.message : null,
    };
    if (kind === "invoices") {
      setInvoices(loaded);
      setInvoiceMapping(suggest(headers, INVOICE_ALIASES));
    } else {
      setPayments(loaded);
      setPaymentMapping(suggest(headers, PAYMENT_ALIASES));
    }
  }

  function removeFile(kind: "invoices" | "payments") {
    if (kind === "invoices") {
      setInvoices(null);
      setInvoiceMapping({});
      if (invoiceInput.current) invoiceInput.current.value = "";
    } else {
      setPayments(null);
      setPaymentMapping({});
      if (paymentInput.current) paymentInput.current.value = "";
    }
    setServerErrors(null);
  }

  const mappingProblems = useMemo(() => {
    const problems: string[] = [];
    const requiredInvoice = INVOICE_FIELDS.filter((field) => field.required);
    const requiredPayment = PAYMENT_FIELDS.filter((field) => field.required);
    if (invoices) {
      for (const field of requiredInvoice) {
        if (!invoiceMapping[field.key]) problems.push(`Invoices: map ${field.label}.`);
      }
    }
    if (payments) {
      for (const field of requiredPayment) {
        if (!paymentMapping[field.key]) problems.push(`Payments: map ${field.label}.`);
      }
    }
    return problems;
  }, [invoices, payments, invoiceMapping, paymentMapping]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setClientError(null);
    setServerErrors(null);
    if (!name.trim()) {
      setClientError("Give this reconciliation batch a name.");
      return;
    }
    if (!invoices || !payments) {
      setClientError("Choose both an invoices CSV and a payments CSV.");
      return;
    }
    if (mappingProblems.length) {
      setClientError("Confirm the required column mappings before matching.");
      return;
    }
    const form = new FormData();
    form.set("name", name.trim());
    form.set("currency", "USD");
    form.set("invoices", invoices.file);
    form.set("payments", payments.file);
    form.set("invoiceMapping", JSON.stringify(invoiceMapping));
    form.set("paymentMapping", JSON.stringify(paymentMapping));
    setBusy(true);
    try {
      const response = await fetch("/api/batches", { method: "POST", body: form });
      const body = (await response.json()) as {
        error?: string;
        batchId?: string;
        fileErrors?: string[];
        errors?: { invoices?: RowError[]; payments?: RowError[] };
      };
      if (!response.ok) {
        setServerErrors(body);
        setBusy(false);
        return;
      }
      router.push(`/batches/${body.batchId}`);
      router.refresh();
    } catch {
      setServerErrors({ error: "The upload could not be completed. Check your connection and retry." });
      setBusy(false);
    }
  }

  const rowErrors = [
    ...(serverErrors?.errors?.invoices ?? []).map((error) => ({ ...error, file: "Invoices" })),
    ...(serverErrors?.errors?.payments ?? []).map((error) => ({ ...error, file: "Payments" })),
  ];

  return (
    <form onSubmit={submit} noValidate>
      <section className="panel" style={{ marginBottom: "1.1rem" }}>
        <div className="section-title">
          <div>
            <div className="eyebrow">Batch details</div>
            <h2>Name this reconciliation</h2>
          </div>
          <span className="pill gray">USD only</span>
        </div>
        <div className="grid-2 equal">
          <div className="field">
            <label htmlFor="batch-name">Batch name</label>
            <input
              id="batch-name"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              required
            />
            <span className="field-hint">Shown in the workbench and exported report.</span>
          </div>
          <div className="field">
            <label htmlFor="batch-currency">Currency</label>
            <select id="batch-currency" className="select" value="USD" disabled>
              <option value="USD">USD — US dollar</option>
            </select>
            <span className="field-hint">
              One currency per batch. Mixed currencies are rejected, never converted.
            </span>
          </div>
        </div>
      </section>

      <div className="upload-grid">
        <FileCard
          kind="invoices"
          title="What you're owed"
          subtitle="Invoices"
          loaded={invoices}
          inputRef={invoiceInput}
          onChoose={(file) => void loadFile(file, "invoices")}
          onRemove={() => removeFile("invoices")}
        />
        <FileCard
          kind="payments"
          title="What you received"
          subtitle="Payments"
          loaded={payments}
          inputRef={paymentInput}
          onChoose={(file) => void loadFile(file, "payments")}
          onRemove={() => removeFile("payments")}
        />
      </div>

      <section className="panel" style={{ marginBottom: "1.1rem" }}>
        <div className="section-title">
          <div>
            <h2>Confirm your columns</h2>
            <p>Choose how the source fields map to Ma&apos;at. Only required fields block matching.</p>
          </div>
        </div>
        {!invoices && !payments ? (
          <div className="notice">Choose a CSV above to reveal its columns and preview rows.</div>
        ) : (
          <div className="stack" style={{ gap: "1.4rem" }}>
            {invoices && (
              <MappingBlock
                title="Invoices"
                loaded={invoices}
                fields={INVOICE_FIELDS}
                mapping={invoiceMapping}
                setMapping={setInvoiceMapping}
              />
            )}
            {payments && (
              <MappingBlock
                title="Payments"
                loaded={payments}
                fields={PAYMENT_FIELDS}
                mapping={paymentMapping}
                setMapping={setPaymentMapping}
                extraClass="payments"
              />
            )}
          </div>
        )}
      </section>

      {(clientError || serverErrors) && (
        <div className="validation-summary" role="alert">
          <b>
            <AlertTriangle size={14} style={{ display: "inline", marginRight: 5 }} />
            {serverErrors?.error ?? "Check the upload before matching"}
          </b>
          {clientError && <div>{clientError}</div>}
          {serverErrors?.fileErrors?.map((error) => (
            <div key={error}>{error}</div>
          ))}
          {rowErrors.length > 0 && (
            <ul>
              {rowErrors.slice(0, 20).map((error, index) => (
                <li key={`${error.file}-${error.row}-${error.column}-${index}`}>
                  {error.file} row {error.row}, {error.column}: {error.message}
                </li>
              ))}
              {rowErrors.length > 20 && <li>…and {rowErrors.length - 20} more errors.</li>}
            </ul>
          )}
        </div>
      )}

      <div className="action-bar">
        <span className="muted">
          Matching stays disabled until both files pass validation. Uploaded rows are preserved exactly;
          normalized fields are stored separately.
        </span>
        <button type="submit" className="button" disabled={busy || mappingProblems.length > 0 || !invoices || !payments}>
          {busy ? <LoaderCircle size={15} className="spin" /> : null}
          {busy ? "Validating and queuing…" : "Validate & match →"}
        </button>
      </div>
    </form>
  );
}

function FileCard({
  kind,
  title,
  subtitle,
  loaded,
  inputRef,
  onChoose,
  onRemove,
}: {
  kind: "invoices" | "payments";
  title: string;
  subtitle: string;
  loaded: LoadedFile | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChoose: (file: File) => void;
  onRemove: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const id = `${kind}-file`;

  return (
    <section className="panel upload-card">
      <div className="eyebrow">0{kind === "invoices" ? 1 : 2} / {subtitle.toUpperCase()}</div>
      <h2 style={{ marginBottom: "0.9rem" }}>{title}</h2>
      {!loaded ? (
        <label
          htmlFor={id}
          className={`dropzone${dragging ? " dragging" : ""}`}
          role="button"
          tabIndex={0}
          aria-label={`Choose ${subtitle.toLowerCase()} CSV file`}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) onChoose(file);
          }}
        >
          <FileUp size={28} aria-hidden="true" />
          <b>Choose or drop a CSV</b>
          <p>Header row + up to 5,000 data rows · max 5 MB</p>
          <input
            id={id}
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onChoose(file);
            }}
          />
        </label>
      ) : (
        <div className="dropzone" style={{ cursor: "default" }}>
          <CheckCircle2 size={26} aria-hidden="true" style={{ color: "var(--green)" }} />
          <b>{loaded.file.name}</b>
          <p>
            {loaded.rows.length} rows · {loaded.headers.length} columns · {bytesLabel(loaded.file.size)}
          </p>
          {loaded.parseError && <span className="small danger-text">Parser warning: {loaded.parseError}</span>}
          <div className="row" style={{ marginTop: "0.4rem" }}>
            <label
              htmlFor={`${id}-replace`}
              className="button secondary small-button"
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  document.getElementById(`${id}-replace`)?.click();
                }
              }}
            >
              <RotateCcw size={13} /> Replace
              <input
                id={`${id}-replace`}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                tabIndex={-1}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onChoose(file);
                }}
              />
            </label>
            <button type="button" className="button secondary small-button" onClick={onRemove}>
              <Trash2 size={13} /> Remove
            </button>
          </div>
        </div>
      )}
      <div className="file-meta">
        <span>CSV · up to 5 MB</span>
      </div>
    </section>
  );
}

function MappingBlock({
  title,
  loaded,
  fields,
  mapping,
  setMapping,
  extraClass = "",
}: {
  title: string;
  loaded: LoadedFile;
  fields: Array<{ key: string; label: string; required: boolean }>;
  mapping: Record<string, string>;
  setMapping: (update: (current: Record<string, string>) => Record<string, string>) => void;
  extraClass?: string;
}) {
  return (
    <div>
      <div className="row" style={{ marginBottom: "0.6rem" }}>
        <span className="pill gray">{title}</span>
        <span className="small muted">{loaded.rows.length} rows</span>
      </div>
      <div className={`mapping-grid ${extraClass}`}>
        {fields.map((field) => (
          <div className="field" key={field.key}>
            <label htmlFor={`${title}-${field.key}`}>
              {field.label}
              {field.required ? " *" : ""}
            </label>
            <select
              id={`${title}-${field.key}`}
              className="select"
              value={mapping[field.key] ?? ""}
              onChange={(event) =>
                setMapping((current) => ({ ...current, [field.key]: event.target.value }))
              }
            >
              <option value="">{field.required ? "Select a column…" : "Not mapped"}</option>
              {loaded.headers.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="preview-table table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {loaded.headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loaded.rows.slice(0, 5).map((row, index) => (
              <tr key={index}>
                {loaded.headers.map((header) => (
                  <td key={header}>{row[header] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="file-meta">
        <span>Previewing {Math.min(5, loaded.rows.length)} of {loaded.rows.length} data rows</span>
      </div>
    </div>
  );
}

