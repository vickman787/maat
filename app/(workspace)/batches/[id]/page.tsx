import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Download,
  Search,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { requireWorkspaceContext } from "@/lib/auth";
import { getBatchOverview, type InvoiceView, type PaymentView } from "@/lib/batches";
import { getDb } from "@/lib/db";
import { formatMoney, formatMoneyShort } from "@/lib/money";
import { JobProgress } from "@/components/JobProgress";
import { Stepper } from "@/components/Stepper";
import { ReviewFlag, StatusPill } from "@/components/StatusPill";

export const dynamic = "force-dynamic";

const FILTERS = ["all", "exact", "partial", "unpaid", "ambiguous", "unallocated"] as const;

export default async function BatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string; q?: string; page?: string }>;
}) {
  const ctx = await requireWorkspaceContext();
  const { id } = await params;
  const query = await searchParams;
  const filter = FILTERS.includes((query.filter ?? "all") as (typeof FILTERS)[number])
    ? (query.filter ?? "all")
    : "all";
  const search = (query.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const db = getDb();
  const overview = getBatchOverview(db, ctx.workspace.id, id);
  if (!overview) notFound();
  const { summary, batch, files, job } = overview;

  const filteredInvoices = overview.invoices.filter((invoice) => {
    if (filter !== "all" && filter !== "unallocated" && invoice.status !== filter) return false;
    if (!search) return true;
    const haystack = [
      invoice.invoiceId,
      invoice.customerName,
      ...invoice.allocations.map((allocation) => allocation.paymentId),
      invoice.suggestion?.payment_row_id
        ? overview.payments.find((payment) => payment.id === invoice.suggestion?.payment_row_id)?.paymentId ?? ""
        : "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const filteredPayments = overview.payments.filter((payment) => {
    if (payment.remainingMinor <= 0) return false;
    if (!search) return true;
    return [payment.paymentId, payment.payerName, payment.reference ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase());
  });

  const pageSize = 10;
  const list = filter === "unallocated" ? filteredPayments : filteredInvoices;
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageItems = list.slice(start, start + pageSize);

  const tabs = [
    { key: "all", label: "All invoices", count: summary.invoice_count },
    { key: "exact", label: "Exact", count: summary.exact_count },
    { key: "partial", label: "Partial", count: summary.partial_count },
    { key: "unpaid", label: "Unpaid", count: summary.unpaid_count },
    { key: "ambiguous", label: "Ambiguous", count: summary.ambiguous_count },
    { key: "unallocated", label: "Unassigned payments", count: summary.unallocated_payment_count },
  ];

  function tabHref(key: string): string {
    return `/batches/${id}?filter=${key}`;
  }

  function pageHref(nextPage: number): string {
    const searchParams = new URLSearchParams();
    searchParams.set("filter", filter);
    if (search) searchParams.set("q", search);
    if (nextPage > 1) searchParams.set("page", String(nextPage));
    return `/batches/${id}?${searchParams.toString()}`;
  }

  const jobState = job
    ? {
        id: job.id,
        status: job.status,
        stage: job.stage,
        progress: job.progress,
        message: job.message,
        error: job.error,
        retry_count: job.retry_count,
        max_retries: job.max_retries,
      }
    : null;

  return (
    <>
      <div className="breadcrumb">
        <Link href="/dashboard">Workspace</Link>
        <span className="sep">/</span>
        <Link href="/batches">Reconciliations</Link>
        <span className="sep">/</span>
        {batch.name}
      </div>
      <div className="page-header">
        <div>
          <h1>{batch.name}</h1>
          <p>Source rows remain unchanged. Review exceptions before exporting.</p>
        </div>
        <div className="page-actions">
          <Link className="button secondary" href={`/batches/${id}/report`}>
            <Download size={14} /> Export report
          </Link>
        </div>
      </div>

      <Stepper current={2} />
      {jobState && <JobProgress batchId={id} initialJob={jobState} />}

      <div className="batch-summary row" style={{ gap: "1.4rem", justifyContent: "flex-start", flexWrap: "wrap" }}>
        <span><b>{summary.invoice_count}</b> invoices</span>
        <span><b>{summary.payment_count}</b> payments</span>
        <span><b>{summary.exact_count}</b> exact matches</span>
        <span className="amber-text"><b>{summary.needs_review_count}</b> pending review</span>
        <span>
          <b>{summary.unallocated_payment_count}</b> unassigned payment rows ·{" "}
          <b>{formatMoneyShort(summary.unallocated_minor, summary.currency)}</b>
        </span>
        <span><b>{formatMoneyShort(summary.outstanding_minor, summary.currency)}</b> outstanding</span>
      </div>

      <div className="legend" aria-label="Status legend">
        <span>Legend:</span>
        <StatusPill status="exact" />
        <StatusPill status="partial" />
        <StatusPill status="unpaid" />
        <StatusPill status="ambiguous" />
        <span><ReviewFlag state="needs_review" /></span>
        <span><ReviewFlag state="unresolved" /></span>
      </div>

      <section className="panel flush">
        <div className="tabs" role="tablist" aria-label="Invoice filters">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={tabHref(tab.key)}
              className={`tab${filter === tab.key ? " selected" : ""}`}
              role="tab"
              aria-selected={filter === tab.key}
            >
              {tab.label} <span className="count">{tab.count}</span>
            </Link>
          ))}
        </div>
        <div className="toolbar">
          <form method="get" action={`/batches/${id}`}>
            <input type="hidden" name="filter" value={filter} />
            <div className="search-box">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                name="q"
                defaultValue={search}
                placeholder={filter === "unallocated" ? "Search payment, payer, or reference" : "Search invoice, customer, or reference"}
                aria-label="Search this batch"
              />
            </div>
            <button type="submit" className="button secondary small-button">Search</button>
            {search && (
              <Link href={tabHref(filter)} className="text-link">Clear</Link>
            )}
          </form>
        </div>

        {list.length === 0 ? (
          <div className="empty-state" style={{ border: 0, borderRadius: 0 }}>
            <Search size={26} aria-hidden="true" />
            <h2>No matching rows.</h2>
            <p>
              {search
                ? "No invoice or payment matches this search in the selected tab."
                : "There are no rows in this tab."}
            </p>
            <Link href={tabHref("all")} className="button secondary">Show all invoices</Link>
          </div>
        ) : filter === "unallocated" ? (
          <>
            <div className="table-wrap table-desktop">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Payment / payer</th>
                    <th>Received</th>
                    <th>Allocated</th>
                    <th>Remaining</th>
                    <th>Reference</th>
                    <th>Possible invoice</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(pageItems as PaymentView[]).map((payment) => {
                    const candidate = overview.invoices.find(
                      (invoice) =>
                        invoice.suggestion?.payment_row_id === payment.id &&
                        (invoice.suggestion.status === "pending" || invoice.suggestion.status === "left_unresolved"),
                    );
                    return (
                      <tr key={payment.id}>
                        <td className="id-cell">
                          <b>{payment.paymentId}</b>
                          <small>{payment.payerName}</small>
                        </td>
                        <td className="amount">{formatMoney(payment.amountMinor, payment.currency)}</td>
                        <td className="amount">{formatMoney(payment.allocatedMinor, payment.currency)}</td>
                        <td className="amount amber-text">{formatMoney(payment.remainingMinor, payment.currency)}</td>
                        <td>{payment.reference ?? <span className="muted">No reference</span>}</td>
                        <td>
                          {candidate ? (
                            <span className="pill purple">{candidate.invoiceId} · suggestion</span>
                          ) : (
                            <span className="muted small">No candidate</span>
                          )}
                        </td>
                        <td>
                          {candidate && (
                            <Link href={`/batches/${id}/review/${candidate.id}`} className="row-link">
                              Review <ArrowRight size={12} />
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mobile-cards">
              {(pageItems as PaymentView[]).map((payment) => {
                const candidate = overview.invoices.find(
                  (invoice) =>
                    invoice.suggestion?.payment_row_id === payment.id &&
                    (invoice.suggestion.status === "pending" || invoice.suggestion.status === "left_unresolved"),
                );
                return (
                  <div className="invoice-card" key={payment.id}>
                    <div className="invoice-card-head">
                      <div>
                        <b>{payment.paymentId}</b>
                        <small className="muted">{payment.payerName}</small>
                      </div>
                      <span className="pill amber">{formatMoney(payment.remainingMinor, payment.currency)} left</span>
                    </div>
                    <div className="invoice-card-facts">
                      <div>
                        <dt>Received</dt>
                        <dd>{formatMoney(payment.amountMinor, payment.currency)}</dd>
                      </div>
                      <div>
                        <dt>Reference</dt>
                        <dd>{payment.reference ?? "None"}</dd>
                      </div>
                    </div>
                    {candidate && (
                      <Link href={`/batches/${id}/review/${candidate.id}`} className="text-link">
                        Review possible {candidate.invoiceId} <ArrowRight size={12} />
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="table-wrap table-desktop">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice / customer</th>
                    <th>Invoiced</th>
                    <th>Assigned payment</th>
                    <th>Outstanding</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(pageItems as InvoiceView[]).map((invoice) => {
                    const allocated = invoice.allocatedMinor;
                    const suggestionPayment = invoice.suggestion?.payment_row_id
                      ? overview.payments.find((payment) => payment.id === invoice.suggestion?.payment_row_id)
                      : undefined;
                    return (
                      <tr key={invoice.id}>
                        <td className="id-cell">
                          <b>{invoice.invoiceId}</b>
                          <small>{invoice.customerName}</small>
                        </td>
                        <td className="amount">{formatMoney(invoice.amountMinor, invoice.currency)}</td>
                        <td className="amount">
                          {allocated > 0 ? (
                            formatMoney(allocated, invoice.currency)
                          ) : invoice.suggestion?.status === "pending" && suggestionPayment ? (
                            <span className="muted small">
                              Suggested {formatMoney(suggestionPayment.amountMinor, invoice.currency)}
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className={`amount${invoice.outstandingMinor > 0 ? " amber-text" : ""}`}>
                          {formatMoney(invoice.outstandingMinor, invoice.currency)}
                        </td>
                        <td>
                          <StatusPill status={invoice.status} />
                          <ReviewFlag state={invoice.reviewState} />
                        </td>
                        <td>
                          <Link href={`/batches/${id}/review/${invoice.id}`} className="row-link">
                            Review <ArrowRight size={12} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mobile-cards">
              {(pageItems as InvoiceView[]).map((invoice) => (
                <div className="invoice-card" key={invoice.id}>
                  <div className="invoice-card-head">
                    <div>
                      <b>{invoice.invoiceId}</b>
                      <small className="muted">{invoice.customerName}</small>
                    </div>
                    <StatusPill status={invoice.status} />
                  </div>
                  <div className="invoice-card-facts">
                    <div>
                      <dt>Invoiced</dt>
                      <dd>{formatMoney(invoice.amountMinor, invoice.currency)}</dd>
                    </div>
                    <div>
                      <dt>Outstanding</dt>
                      <dd className={invoice.outstandingMinor > 0 ? "amber-text" : ""}>
                        {formatMoney(invoice.outstandingMinor, invoice.currency)}
                      </dd>
                    </div>
                  </div>
                  <ReviewFlag state={invoice.reviewState} />
                  <Link href={`/batches/${id}/review/${invoice.id}`} className="text-link">
                    Review evidence <ArrowRight size={12} />
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="table-footer">
          <span>
            Showing {list.length === 0 ? 0 : start + 1}–{Math.min(start + pageSize, list.length)} of {list.length}{" "}
            {filter === "unallocated" ? "unassigned payment rows" : "invoices"}
          </span>
          {totalPages > 1 && (
            <span className="pagination">
              {currentPage > 1 ? (
                <Link href={pageHref(currentPage - 1)} className="text-link">
                  <ArrowLeft size={12} /> Previous
                </Link>
              ) : (
                <span className="muted">Previous</span>
              )}
              <span className="page-current" aria-current="page">{currentPage}</span>
              <span className="muted">of {totalPages}</span>
              {currentPage < totalPages ? (
                <Link href={pageHref(currentPage + 1)} className="text-link">
                  Next <ArrowRight size={12} />
                </Link>
              ) : (
                <span className="muted">Next</span>
              )}
            </span>
          )}
        </div>
      </section>

      <div className="grid-2 equal" style={{ marginTop: "1.2rem" }}>
        <div className="row" style={{ alignItems: "flex-start", gap: "0.6rem" }}>
          <ShieldCheck size={18} style={{ color: "var(--gold-deep)", flexShrink: 0 }} aria-hidden="true" />
          <div>
            <b style={{ fontSize: "0.78rem" }}>Exact matches use source facts.</b>
            <p className="muted small">Invoice reference, amount, and currency are checked together.</p>
          </div>
        </div>
        <div className="row" style={{ alignItems: "flex-start", gap: "0.6rem" }}>
          <Sparkles size={18} style={{ color: "var(--gold-deep)", flexShrink: 0 }} aria-hidden="true" />
          <div>
            <b style={{ fontSize: "0.78rem" }}>Suggestions are yours to review.</b>
            <p className="muted small">AI explanations never confirm a match or change payment records.</p>
          </div>
        </div>
      </div>

      <div className="mini-evidence" style={{ marginTop: "1.2rem" }}>
        {files.map((file) => (
          <span key={file.id}>
            {file.kind === "invoices" ? <Wallet size={12} aria-hidden="true" /> : <ArrowLeftRight size={12} aria-hidden="true" />} {file.originalFilename} · {file.sha256.slice(0, 12)}…
          </span>
        ))}
        <span>USD only · one currency per batch</span>
      </div>
    </>
  );
}



