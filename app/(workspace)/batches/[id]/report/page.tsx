import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, FileText, Sparkles } from "lucide-react";
import { requireWorkspaceContext } from "@/lib/auth";
import { getBatchOverview } from "@/lib/batches";
import { getDb } from "@/lib/db";
import { formatMoney, formatMoneyShort } from "@/lib/money";
import { recordReportSnapshot } from "@/lib/reports";
import { Logo } from "@/components/Logo";
import { Stepper } from "@/components/Stepper";
import { PrintButton } from "@/components/PrintButton";
import { BatchStatusPill } from "@/components/StatusPill";

export const dynamic = "force-dynamic";
export const metadata = { title: "Report" };

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspaceContext();
  const { id } = await params;
  const db = getDb();
  const overview = getBatchOverview(db, ctx.workspace.id, id);
  if (!overview) notFound();
  const generatedAt = new Date().toISOString();
  recordReportSnapshot(db, ctx.workspace.id, id, ctx.user?.id ?? null, overview, generatedAt);

  const { summary, batch, files } = overview;
  const partialInvoices = overview.invoices.filter((invoice) => invoice.status === "partial");
  const unpaidInvoices = overview.invoices.filter((invoice) => invoice.status === "unpaid");
  const ambiguousInvoices = overview.invoices.filter((invoice) => invoice.status === "ambiguous");
  const unresolved = overview.invoices.filter(
    (invoice) => invoice.reviewState === "needs_review" || invoice.reviewState === "unresolved",
  );
  const unallocated = overview.payments.filter((payment) => payment.remainingMinor > 0);
  const aiCounts = db
    .prepare("SELECT ai_status, COUNT(*) AS n FROM suggestions WHERE batch_id = ? AND workspace_id = ? GROUP BY ai_status")
    .all(id, ctx.workspace.id) as Array<{ ai_status: string; n: number }>;
  const aiSuccess = aiCounts.find((row) => row.ai_status === "success")?.n ?? 0;
  const aiUnavailable = aiCounts.find((row) => row.ai_status === "unavailable")?.n ?? 0;

  return (
    <>
      <div className="breadcrumb">
        <Link href="/dashboard">Workspace</Link>
        <span className="sep">/</span>
        <Link href="/batches">Reconciliations</Link>
        <span className="sep">/</span>
        <Link href={`/batches/${id}`}>{batch.name}</Link>
        <span className="sep">/</span>
        Report
      </div>
      <div className="page-header">
        <div>
          <h1>Ready for a clearer close.</h1>
          <p>Export your current reconciliation, including anything still unresolved.</p>
        </div>
        <div className="page-actions">
          <a
            className="button"
            href={`/api/batches/${id}/export/invoices`}
            download
          >
            <Download size={15} /> Download CSV
          </a>
          <PrintButton />
        </div>
      </div>
      <Stepper current={3} />

      <div className="report-grid">
        <section className="report-paper">
          <div className="report-brand">
            <Logo href="/dashboard" size={30} />
            <span>RECONCILIATION REPORT</span>
          </div>
          <h2>{batch.name}</h2>
          <p className="muted">
            {ctx.workspace.name} · {batch.currency} · {"Private workspace"} ·
            Prepared {formatDateTime(generatedAt)}
          </p>
          <div className="report-metrics">
            <div>
              <small>Total invoiced</small>
              <strong>{formatMoneyShort(summary.invoiced_minor, batch.currency)}</strong>
            </div>
            <div>
              <small>Imported payments</small>
              <strong>{formatMoneyShort(summary.imported_minor, batch.currency)}</strong>
            </div>
            <div>
              <small>Confirmed allocations</small>
              <strong>{formatMoneyShort(summary.confirmed_minor, batch.currency)}</strong>
            </div>
          </div>

          <h3>Review summary</h3>
          <table className="report-table">
            <tbody>
              <tr>
                <td>Exact invoice matches</td>
                <td>{summary.exact_count}</td>
              </tr>
              <tr><td>Manually settled invoices</td><td>{overview.invoices.filter((invoice) => invoice.status === "settled").length}</td></tr>
              <tr>
                <td>Partial payments</td>
                <td>
                  {summary.partial_count}
                  {partialInvoices.length > 0
                    ? ` · ${formatMoney(
                        partialInvoices.reduce((sum, invoice) => sum + invoice.outstandingMinor, 0),
                        batch.currency,
                      )} outstanding`
                    : ""}
                </td>
              </tr>
              <tr>
                <td>Unpaid invoices</td>
                <td>
                  {summary.unpaid_count}
                  {unpaidInvoices.length > 0
                    ? ` · ${formatMoney(
                        unpaidInvoices.reduce((sum, invoice) => sum + invoice.outstandingMinor, 0),
                        batch.currency,
                      )} outstanding`
                    : ""}
                </td>
              </tr>
              <tr>
                <td>Ambiguous invoices</td>
                <td>
                  {summary.ambiguous_count}
                  {ambiguousInvoices.length > 0
                    ? ` · ${formatMoney(
                        ambiguousInvoices.reduce((sum, invoice) => sum + invoice.outstandingMinor, 0),
                        batch.currency,
                      )} not allocated`
                    : ""}
                </td>
              </tr>
              <tr>
                <td>Payments not allocated</td>
                <td>
                  {summary.unallocated_payment_count} rows · {formatMoney(summary.unallocated_minor, batch.currency)}
                </td>
              </tr>
              <tr>
                <td>Pending review items</td>
                <td>{summary.needs_review_count}</td>
              </tr>
              <tr>
                <td>Total invoice outstanding</td>
                <td>{formatMoney(summary.outstanding_minor, batch.currency)}</td>
              </tr>
            </tbody>
          </table>

          <h3 style={{ marginTop: "1.1rem" }}>Activity</h3>
          <div className="kv-list" style={{ fontSize: "0.7rem" }}>
            <div><dt>Files validated</dt><dd>{files.length} source files · {summary.invoice_count} invoices · {summary.payment_count} payments</dd></div>
            <div><dt>Records normalized</dt><dd>Original values preserved separately</dd></div>
            <div><dt>Exact matches allocated</dt><dd>{summary.exact_count} invoices</dd></div>
            <div><dt>Confirmed allocations</dt><dd>{formatMoney(summary.confirmed_minor, batch.currency)}</dd></div>
            <div><dt>Exceptions identified</dt><dd>{summary.partial_count + summary.unpaid_count + summary.ambiguous_count} invoices</dd></div>
            <div><dt>AI evidence prepared</dt><dd>{aiSuccess} succeeded · {aiUnavailable} unavailable</dd></div>
            <div><dt>Review needed</dt><dd>{summary.needs_review_count} pending</dd></div>
            <div><dt>Report ready</dt><dd>{formatDateTime(generatedAt)}</dd></div>
          </div>

          <div className="report-note">
            <b>Unresolved items are included.</b>
            <p>
              {unresolved.length === 0 && unallocated.length === 0
                ? "No unresolved invoices or unallocated payments remain in this batch."
                : [
                    unresolved.length > 0
                      ? `${unresolved.length} invoice${unresolved.length === 1 ? "" : "s"} still need review or were left unresolved (${unresolved.map((invoice) => invoice.invoiceId).join(", ")}).`
                      : "",
                    unallocated.length > 0
                      ? `${unallocated.length} payment row${unallocated.length === 1 ? "" : "s"} totaling ${formatMoney(summary.unallocated_minor, batch.currency)} remain unallocated (${unallocated.map((payment) => payment.paymentId).join(", ")}).`
                      : "",
                    "They are not counted as confirmed allocations.",
                  ]
                    .filter(Boolean)
                    .join(" ")}
            </p>
          </div>

          <h3 style={{ marginTop: "1.1rem" }}>Source files and integrity</h3>
          <table className="report-table">
            <tbody>
              {files.map((file) => (
                <tr key={file.id}>
                  <td>
                    {file.originalFilename}
                    <small className="hash">SHA-256 {file.sha256}</small>
                  </td>
                  <td>{file.kind}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="report-signoff">
            <span>
              Prepared for {ctx.user?.email ?? ctx.user?.privyDid ?? ctx.workspace.name}
              
            </span>
            <span>System rules and human decisions recorded · {summary.needs_review_count} pending</span>
          </div>
        </section>

        <div className="no-print">
          <section className="panel export-card">
            <div className="eyebrow">Export options</div>
            <h2>Take the evidence with you.</h2>
            <p className="small muted" style={{ marginBottom: "0.8rem" }}>
              Current batch state: <BatchStatusPill status={batch.status} />
            </p>
            <div className="export-option">
              <FileText size={20} aria-hidden="true" />
              <div style={{ flex: 1 }}>
                <b>Reconciliation CSV</b>
                <small>Invoice-level decisions, allocations, source rows</small>
                <a
                  className="text-link"
                  href={`/api/batches/${id}/export/invoices`}
                  download
                  style={{ marginTop: "0.2rem" }}
                >
                  <Download size={13} /> Download reconciliation.csv
                </a>
              </div>
            </div>
            <div className="export-option">
              <FileText size={20} aria-hidden="true" />
              <div style={{ flex: 1 }}>
                <b>Unallocated payments CSV</b>
                <small>Every payment with a remaining balance</small>
                <a
                  className="text-link"
                  href={`/api/batches/${id}/export/unallocated`}
                  download
                  style={{ marginTop: "0.2rem" }}
                >
                  <Download size={13} /> Download unallocated-payments.csv
                </a>
              </div>
            </div>
            <div className="export-option">
              <FileText size={20} aria-hidden="true" />
              <div style={{ flex: 1 }}>
                <b>Decision history CSV</b>
                <small>Audit events, reversals, actors, timestamps</small>
                <a
                  className="text-link"
                  href={`/api/batches/${id}/export/decisions`}
                  download
                  style={{ marginTop: "0.2rem" }}
                >
                  <Download size={13} /> Download decision-history.csv
                </a>
              </div>
            </div>
            <div style={{ marginTop: "1rem" }}>
              <PrintButton label="Open printable report (Save as PDF)" />
            </div>
            <div className="separator" />
            <b>Included in every export</b>
            <ul>
              <li>Original source references and row numbers</li>
              <li>Confirmed allocations only</li>
              <li>Unresolved exceptions, explicitly labelled</li>
              <li>Decision timestamps and reversal links</li>
            </ul>
            <p className="small muted">
              Exporting does not move funds or edit your original CSV files. Spreadsheet-formula cells
              are escaped in every export.
            </p>
            <Link href={`/batches/${id}`} className="text-link" style={{ marginTop: "0.8rem" }}>
              <ArrowLeft size={13} /> Back to the workbench
            </Link>
          </section>
          <div className="export-caption">
            <Sparkles size={12} style={{ display: "inline", marginRight: 4 }} aria-hidden="true" /> Keep uncertain matches visible.
            <br />
            Never hide them to make a report look complete.
          </div>
        </div>
      </div>
    </>
  );
}





