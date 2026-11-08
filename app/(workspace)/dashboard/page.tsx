import Link from "next/link";
import {
  ArrowRight,
  ArrowLeftRight,
  CheckCircle2,
  FileSearch,
  FileText,
  Plus,
  Sparkles,
  Upload,
  LoaderCircle,
} from "lucide-react";
import { requireWorkspaceContext } from "@/lib/auth";
import { getBatchOverview, listBatchSummaries } from "@/lib/batches";
import { getDb } from "@/lib/db";
import { formatMoney, formatMoneyShort } from "@/lib/money";
import { BatchStatusPill, StatusPill } from "@/components/StatusPill";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(value),
  );
}

export default async function DashboardPage() {
  const ctx = await requireWorkspaceContext();
  const db = getDb();
  const summaries = listBatchSummaries(db, ctx.workspace.id);
  const latest = summaries[0] ?? null;
  const overview = latest ? getBatchOverview(db, ctx.workspace.id, latest.id) : null;

  if (!latest || !overview) {
    return (
      <>
        <div className="page-header">
          <div>
            <div className="breadcrumb">Workspace / Overview</div>
            <h1>Everything in balance.</h1>
            <p>A clear view of your invoices, payments, and the exceptions that need you.</p>
          </div>
                      <div className="page-actions">
              <Link href="/batches/new" className="button">
                <Plus size={15} /> New reconciliation
              </Link>
            </div>
        </div>
        <div className="empty-state">
          <Sparkles size={30} aria-hidden="true" />
          <h2>No reconciliations yet.</h2>
          <p>
            Upload your invoices CSV and payments CSV to begin. Your dashboard will show only the files you import.
          </p>
            <Link href="/batches/new" className="button">
              <Upload size={15} /> Upload source files
            </Link>
        </div>
      </>
    );
  }

  const progress =
    latest.invoice_count > 0
      ? Math.round(((latest.invoice_count - latest.needs_review_count) / latest.invoice_count) * 100)
      : 0;
  const nextInvoice =
    overview.invoices.find(
      (invoice) =>
        invoice.reviewState === "needs_review" &&
        (invoice.suggestion?.type === "partial" || invoice.suggestion?.type === "ambiguous"),
    ) ??
    overview.invoices.find((invoice) => invoice.reviewState === "needs_review") ??
    overview.invoices.find((invoice) => invoice.outstandingMinor > 0);
  const nextPayment = nextInvoice?.suggestion?.payment_row_id
    ? overview.payments.find((payment) => payment.id === nextInvoice.suggestion?.payment_row_id)
    : undefined;

  let nextTitle = "Export the reviewed batch.";
  let nextCopy = "All clear cases are matched and the remaining items are recorded. Download the evidence with the unresolved rows included.";
  if (nextInvoice?.suggestion?.type === "partial") {
    nextTitle = `Resolve the ${formatMoneyShort(nextInvoice.amountMinor - (nextPayment?.amountMinor ?? 0), latest.currency)} difference.`;
    nextCopy = `${nextInvoice.customerName} paid ${formatMoney(nextPayment?.amountMinor ?? 0, latest.currency)} against a ${formatMoney(nextInvoice.amountMinor, latest.currency)} invoice. Inspect both source rows before confirming a partial match.`;
  } else if (nextInvoice?.suggestion?.type === "ambiguous") {
    nextTitle = "Review the possible match.";
    nextCopy = `A ${formatMoney(nextPayment?.amountMinor ?? nextInvoice.amountMinor, latest.currency)} payment is similar to ${nextInvoice.invoiceId}, but there is no definitive reference. It is never auto-confirmed.`;
  } else if (nextInvoice?.status === "unpaid") {
    nextTitle = `Check ${nextInvoice.invoiceId}'s open balance.`;
    nextCopy = `No matched payment appears in this batch for ${nextInvoice.customerName}. That is not proof the invoice is unpaid outside this batch.`;
  } else if (latest.outstanding_minor > 0) {
    nextTitle = "Review the remaining outstanding balances.";
    nextCopy = "Some invoices still carry an open balance. Confirm, reject, or leave each item unresolved with a note.";
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb">Workspace / Overview</div>
          <h1>Everything in balance.</h1>
          <p>A clear view of your invoices, payments, and the exceptions that need you.</p>
        </div>
                  <div className="page-actions">
            <Link href="/batches/new" className="button">
              <Plus size={15} /> New reconciliation
            </Link>
          </div>
      </div>

      {(latest.status === "queued" || latest.status === "processing") && (
        <div className="job-card" aria-live="polite">
          <div className="row">
            <LoaderCircle size={16} className="spin" style={{ color: "var(--gold-deep)" }} />
            <h2 style={{ flex: 1 }}>Matching is running for this batch.</h2>
            <Link href={`/batches/${latest.id}`} className="text-link">Open live progress →</Link>
          </div>
          <p className="job-stage">
            Totals below may be incomplete until the worker finishes. No suggestions change financial
            totals; confirmed allocations are applied in a transaction.
          </p>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="eyebrow">Invoiced</div>
          <div className="stat-number">{formatMoneyShort(latest.invoiced_minor, latest.currency)}</div>
          <div className="muted">
            {latest.invoice_count} invoices · {latest.currency} · {latest.name}
          </div>
        </div>
        <div className="stat-card">
          <div className="eyebrow">Imported payments</div>
          <div className="stat-number">{formatMoneyShort(latest.imported_minor, latest.currency)}</div>
          <div className="muted">{latest.payment_count} source payment rows · {latest.currency}</div>
        </div>
        <div className="stat-card">
          <div className="eyebrow">Exact matches</div>
          <div className="stat-number">
            {latest.exact_count} / {latest.invoice_count}
          </div>
          <div className="muted">Confirmed reference + amount</div>
        </div>
        <div className="stat-card">
          <div className="eyebrow">Invoices to review</div>
          <div className="stat-number">{latest.needs_review_count}</div>
          <div className="muted">Pending suggestions in this batch</div>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel batch-card">
          <div className="section-title">
            <div>
              <div className="eyebrow">Your current batch</div>
              <h2>{latest.name}</h2>
            </div>
            {latest.needs_review_count > 0 ? (
              <span className="pill amber">Review needed</span>
            ) : (
              <BatchStatusPill status={latest.status} />
            )}
          </div>
          <div className="progress-track" aria-hidden="true">
            <span style={{ width: `${Math.max(3, progress)}%` }} />
          </div>
          <div className="progress-label">
            <b>
              {overview.invoices.filter((invoice) => invoice.outstandingMinor === 0).length} invoices fully matched
            </b>
            <span>{latest.needs_review_count} need review</span>
          </div>
          <p className="muted" style={{ fontSize: "0.8rem" }}>
            {latest.unallocated_payment_count > 0
              ? `${latest.unallocated_payment_count} payment rows totaling ${formatMoney(latest.unallocated_minor, latest.currency)} remain unallocated.`
              : "Every imported payment has been fully allocated."}{" "}
            {latest.outstanding_minor > 0
              ? `${formatMoney(latest.outstanding_minor, latest.currency)} of invoice value is still outstanding.`
              : ""}
          </p>
          <div className="batch-actions">
            <Link href={`/batches/${latest.id}`} className="button">
              Review exceptions <ArrowRight size={14} />
            </Link>
            <Link href={`/batches/${latest.id}?filter=exact`} className="text-link">
              Open all matches
            </Link>
          </div>
          <div className="mini-evidence">
            {overview.files.map((file) => (
              <span key={file.id}>
                {file.kind === "invoices" ? <FileText size={12} aria-hidden="true" /> : <ArrowLeftRight size={12} aria-hidden="true" />} {file.originalFilename}
              </span>
            ))}
            <span>Imported {formatDate(latest.created_at)}</span>
          </div>
        </section>

        <section className="panel review-card">
          <div className="eyebrow">Next best step</div>
          <h2>{nextTitle}</h2>
          <p>{nextCopy}</p>
          {nextInvoice ? (
            <Link className="review-link" href={`/batches/${latest.id}/review/${nextInvoice.id}`}>
              Review {nextInvoice.invoiceId} <ArrowRight size={14} />
            </Link>
          ) : (
            <Link className="review-link" href={`/batches/${latest.id}/report`}>
              Open the report <ArrowRight size={14} />
            </Link>
          )}
          <span className="small muted">Evidence first. Every decision stays traceable.</span>
        </section>
      </div>

      <section className="panel">
        <div className="section-title">
          <h2>Recent reconciliations</h2>
          <Link href="/batches" className="text-link">
            View all batches <ArrowRight size={13} />
          </Link>
        </div>
        <div className="table-wrap table-desktop">
          <table className="data-table">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Imported</th>
                <th>Invoices</th>
                <th>Status</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {summaries.slice(0, 5).map((summary) => (
                <tr key={summary.id}>
                  <td className="id-cell">
                    <b>{summary.name}</b>
                    <small>
                      {summary.currency} · {summary.payment_count} payments
                    </small>
                  </td>
                  <td>{formatDate(summary.created_at)}</td>
                  <td>{summary.invoice_count}</td>
                  <td>
                    {summary.needs_review_count > 0 ? (
                      <span className="pill amber">{summary.needs_review_count} need review</span>
                    ) : (
                      <span className="pill">
                        <CheckCircle2 size={10} /> Reviewed
                      </span>
                    )}
                  </td>
                  <td>
                    <Link href={`/batches/${summary.id}`} className="row-link">
                      Open <ArrowRight size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mobile-cards">
          {summaries.slice(0, 5).map((summary) => (
            <Link key={summary.id} href={`/batches/${summary.id}`} className="invoice-card">
              <div className="invoice-card-head">
                <b>{summary.name}</b>
                <StatusPill status={summary.ambiguous_count > 0 ? "ambiguous" : summary.partial_count > 0 ? "partial" : summary.unpaid_count > 0 ? "unpaid" : "exact"} />
              </div>
              <small className="muted">
                {summary.invoice_count} invoices · imported {formatDate(summary.created_at)}
              </small>
              <span className="text-link">
                Open batch <ArrowRight size={12} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="row" style={{ marginTop: "1.2rem", color: "var(--muted)", fontSize: "0.72rem" }}>
        <FileSearch size={15} aria-hidden="true" />
        <span>Reconcile records, without moving money.</span>
        <span className="spacer" />
        <span>You control every uncertain match.</span>
      </div>
    </>
  );
}




