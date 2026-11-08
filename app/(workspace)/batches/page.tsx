import Link from "next/link";
import { ArrowRight, Download, Plus, Upload } from "lucide-react";
import { requireWorkspaceContext } from "@/lib/auth";
import { listBatchSummaries } from "@/lib/batches";
import { getDb } from "@/lib/db";
import { formatMoneyShort } from "@/lib/money";
import { BatchStatusPill } from "@/components/StatusPill";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reconciliations" };

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(value),
  );
}

export default async function BatchesPage() {
  const ctx = await requireWorkspaceContext();
  const summaries = listBatchSummaries(getDb(), ctx.workspace.id);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb">Workspace / Reconciliations</div>
          <h1>Reconciliations</h1>
          <p>Each batch keeps its own currency, source files, matching state, review history, and exports.</p>
        </div>
        {!ctx.workspace.isDemo && (
          <div className="page-actions">
            <Link href="/batches/new" className="button">
              <Plus size={15} /> New reconciliation
            </Link>
          </div>
        )}
      </div>

      {ctx.workspace.isDemo && (
        <div className="notice" style={{ marginBottom: "1rem" }}>
          Demo workspace: personal uploads are disabled. You can inspect the sample batch, confirm or
          undo allocations, and export reports. Reset the demo any time from the banner.
        </div>
      )}

      {summaries.length === 0 ? (
        <div className="empty-state">
          <Upload size={30} aria-hidden="true" />
          <h2>No batches yet.</h2>
          <p>Upload two CSVs to begin. The sample files are on the upload screen if you want to trial the workflow.</p>
          {ctx.workspace.isDemo ? (
            <Link className="button" href="/dashboard">
              Return to dashboard
            </Link>
          ) : (
            <Link href="/batches/new" className="button">
              Upload source files
            </Link>
          )}
        </div>
      ) : (
        <section className="panel flush">
          <div className="table-wrap table-desktop">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Imported</th>
                  <th>Invoiced</th>
                  <th>Outstanding</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((summary) => (
                  <tr key={summary.id}>
                    <td className="id-cell">
                      <b>{summary.name}</b>
                      <small>
                        {summary.invoice_count} invoices · {summary.payment_count} payments · {summary.currency}
                      </small>
                    </td>
                    <td>{formatDate(summary.created_at)}</td>
                    <td className="amount">{formatMoneyShort(summary.invoiced_minor, summary.currency)}</td>
                    <td className="amount">
                      {summary.outstanding_minor > 0 ? (
                        <span className="amber-text">{formatMoneyShort(summary.outstanding_minor, summary.currency)}</span>
                      ) : (
                        formatMoneyShort(0, summary.currency)
                      )}
                    </td>
                    <td>
                      <BatchStatusPill status={summary.status} />
                      {summary.needs_review_count > 0 && (
                        <div className="review-flag">{summary.needs_review_count} need review</div>
                      )}
                    </td>
                    <td>
                      <div className="row" style={{ gap: "0.4rem" }}>
                        <Link href={`/batches/${summary.id}`} className="button secondary small-button">
                          Open
                        </Link>
                        <Link href={`/batches/${summary.id}/report`} className="button secondary small-button">
                          Report
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mobile-cards">
            {summaries.map((summary) => (
              <div className="invoice-card" key={summary.id}>
                <div className="invoice-card-head">
                  <div>
                    <b>{summary.name}</b>
                    <small className="muted">
                      {summary.invoice_count} invoices · {formatDate(summary.created_at)}
                    </small>
                  </div>
                  <BatchStatusPill status={summary.status} />
                </div>
                <div className="invoice-card-facts">
                  <div>
                    <dt>Invoiced</dt>
                    <dd>{formatMoneyShort(summary.invoiced_minor, summary.currency)}</dd>
                  </div>
                  <div>
                    <dt>Outstanding</dt>
                    <dd>{formatMoneyShort(summary.outstanding_minor, summary.currency)}</dd>
                  </div>
                </div>
                <div className="row">
                  <Link href={`/batches/${summary.id}`} className="text-link">
                    Open batch <ArrowRight size={12} />
                  </Link>
                  <Link href={`/batches/${summary.id}/report`} className="text-link">
                    Report <Download size={12} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
