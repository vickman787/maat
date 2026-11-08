import Link from "next/link";
import { ArrowRight, Download, FileBarChart } from "lucide-react";
import { requireWorkspaceContext } from "@/lib/auth";
import { listBatchSummaries } from "@/lib/batches";
import { getDb } from "@/lib/db";
import { formatMoneyShort } from "@/lib/money";
import { BatchStatusPill } from "@/components/StatusPill";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(value),
  );
}

export default async function ReportsPage() {
  const ctx = await requireWorkspaceContext();
  const summaries = listBatchSummaries(getDb(), ctx.workspace.id);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb">Workspace / Reports</div>
          <h1>Reports</h1>
          <p>Every export reflects the current database totals, including unresolved items.</p>
        </div>
      </div>

      {summaries.length === 0 ? (
        <div className="empty-state">
          <FileBarChart size={30} aria-hidden="true" />
          <h2>No reports yet.</h2>
          <p>Reports become available as soon as a reconciliation batch exists.</p>
          <Link href={"/batches/new"} className="button">
            {"Start a reconciliation"}
          </Link>
        </div>
      ) : (
        <div className="stack">
          {summaries.map((summary) => (
            <section className="panel" key={summary.id}>
              <div className="section-title" style={{ marginBottom: "0.8rem" }}>
                <div>
                  <div className="eyebrow">{summary.currency} · imported {formatDate(summary.created_at)}</div>
                  <h2>{summary.name}</h2>
                </div>
                <BatchStatusPill status={summary.status} />
              </div>
              <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", marginBottom: "0.8rem" }}>
                <div>
                  <div className="eyebrow" style={{ marginBottom: "0.3rem" }}>Invoiced</div>
                  <strong>{formatMoneyShort(summary.invoiced_minor, summary.currency)}</strong>
                </div>
                <div>
                  <div className="eyebrow" style={{ marginBottom: "0.3rem" }}>Confirmed</div>
                  <strong>{formatMoneyShort(summary.confirmed_minor, summary.currency)}</strong>
                </div>
                <div>
                  <div className="eyebrow" style={{ marginBottom: "0.3rem" }}>Outstanding</div>
                  <strong>{formatMoneyShort(summary.outstanding_minor, summary.currency)}</strong>
                </div>
              </div>
              <div className="row">
                <Link href={`/batches/${summary.id}/report`} className="button secondary small-button">
                  Open report <ArrowRight size={13} />
                </Link>
                <a className="text-link" href={`/api/batches/${summary.id}/export/invoices`} download>
                  <Download size={13} /> Reconciliation CSV
                </a>
                <a className="text-link" href={`/api/batches/${summary.id}/export/unallocated`} download>
                  <Download size={13} /> Unallocated CSV
                </a>
                <a className="text-link" href={`/api/batches/${summary.id}/export/decisions`} download>
                  <Download size={13} /> Decision history
                </a>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
