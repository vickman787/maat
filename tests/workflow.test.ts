import { describe, expect, it } from "vitest";
import { getBatchOverview } from "../lib/batches";
import { openDatabase } from "../lib/db";
import { claimJob, processQueuedJob, recoverInterruptedJobs, retryFailedJob } from "../lib/jobs";
import { performReview } from "../lib/review";
import { contextFor, createAccount, importFixture, makeDb } from "./helpers";

async function setup() {
  const db = makeDb();
  const account = createAccount(db);
  const imported = importFixture(db, account.workspaceId);
  await processQueuedJob(db, imported.jobId);
  return { db, account, imported };
}

function overview(db: ReturnType<typeof openDatabase>, workspaceId: string, batchId: string) {
  const result = getBatchOverview(db, workspaceId, batchId);
  if (!result) throw new Error("Batch missing");
  return result;
}

describe("reconciliation workflow and totals", () => {
  it("matches the canonical fixture before review", async () => {
    const { db, account, imported } = await setup();
    const data = overview(db, account.workspaceId, imported.batchId);
    expect(data.summary).toMatchObject({
      invoice_count: 12,
      payment_count: 11,
      invoiced_minor: 1800000,
      imported_minor: 1650000,
      confirmed_minor: 1350000,
      outstanding_minor: 450000,
      exact_count: 9,
      partial_count: 1,
      unpaid_count: 1,
      ambiguous_count: 1,
      needs_review_count: 3,
      unallocated_payment_count: 2,
      unallocated_minor: 300000,
    });
    const invoice10 = data.invoices.find((invoice) => invoice.invoiceId === "INV-010")!;
    expect(invoice10.suggestion?.type).toBe("partial");
    expect(invoice10.suggestion?.ai_status).toBe("unavailable");
    const invoice11 = data.invoices.find((invoice) => invoice.invoiceId === "INV-011")!;
    expect(invoice11.suggestion?.type).toBe("unpaid");
    const invoice12 = data.invoices.find((invoice) => invoice.invoiceId === "INV-012")!;
    expect(invoice12.suggestion?.type).toBe("ambiguous");
    expect(data.job?.status).toBe("completed");
    expect(data.job?.message).toContain("AI explanation unavailable");
  });

  it("confirms the $1,000 partial, recomputes totals, and prevents duplicate allocation", async () => {
    const { db, account, imported } = await setup();
    const before = overview(db, account.workspaceId, imported.batchId);
    const invoice10 = before.invoices.find((invoice) => invoice.invoiceId === "INV-010")!;
    const suggestion = invoice10.suggestion!;
    const ctx = contextFor(db, account.userId, account.workspaceId);

    const result = performReview(db, ctx, account.workspaceId, imported.batchId, invoice10.id, {
      action: "confirm",
      suggestionId: suggestion.id,
      note: "Confirmed partial payment against INV-010.",
    });
    expect(result.allocationId).toBeTruthy();

    const after = overview(db, account.workspaceId, imported.batchId);
    expect(after.summary).toMatchObject({
      confirmed_minor: 1450000,
      outstanding_minor: 350000,
      unallocated_payment_count: 1,
      unallocated_minor: 200000,
    });
    const payment10 = after.payments.find((payment) => payment.paymentId === "P010")!;
    expect(payment10.remainingMinor).toBe(0);
    const updated = after.invoices.find((invoice) => invoice.invoiceId === "INV-010")!;
    expect(updated.allocatedMinor).toBe(100000);
    expect(updated.outstandingMinor).toBe(50000);
    expect(updated.reviewState).toBe("confirmed");

    expect(() =>
      performReview(db, ctx, account.workspaceId, imported.batchId, invoice10.id, {
        action: "confirm",
        suggestionId: suggestion.id,
      }),
    ).toThrow(/already been reviewed|already allocated/i);

    const events = db
      .prepare("SELECT action, amount_minor FROM review_events WHERE invoice_row_id = ? ORDER BY created_at")
      .all(invoice10.id) as Array<{ action: string; amount_minor: number | null }>;
    expect(events.some((event) => event.action === "confirm" && event.amount_minor === 100000)).toBe(true);
  });

  it("undoes an allocation through a reversal event without erasing history", async () => {
    const { db, account, imported } = await setup();
    const ctx = contextFor(db, account.userId, account.workspaceId);
    const data = overview(db, account.workspaceId, imported.batchId);
    const invoice10 = data.invoices.find((invoice) => invoice.invoiceId === "INV-010")!;
    const suggestion = invoice10.suggestion!;
    const confirmation = performReview(db, ctx, account.workspaceId, imported.batchId, invoice10.id, {
      action: "confirm",
      suggestionId: suggestion.id,
    });
    performReview(db, ctx, account.workspaceId, imported.batchId, invoice10.id, {
      action: "undo",
      allocationId: confirmation.allocationId!,
      note: "Reversing the partial confirmation after review.",
    });
    const afterUndo = overview(db, account.workspaceId, imported.batchId);
    expect(afterUndo.summary.confirmed_minor).toBe(1350000);
    expect(afterUndo.summary.unallocated_payment_count).toBe(2);
    const events = db
      .prepare("SELECT action, reverses_event_id FROM review_events WHERE invoice_row_id = ? ORDER BY created_at")
      .all(invoice10.id) as Array<{ action: string; reverses_event_id: string | null }>;
    expect(events.map((event) => event.action)).toContain("undo");
    expect(events.filter((event) => event.action === "confirm")).toHaveLength(1);
    expect(events.find((event) => event.action === "undo")?.reverses_event_id).toBeTruthy();
  });

  it("supports manual allocation capped by invoice and payment balances", async () => {
    const { db, account, imported } = await setup();
    const ctx = contextFor(db, account.userId, account.workspaceId);
    const data = overview(db, account.workspaceId, imported.batchId);
    const invoice11 = data.invoices.find((invoice) => invoice.invoiceId === "INV-011")!;
    const payment11 = data.payments.find((payment) => payment.paymentId === "P011")!;
    performReview(db, ctx, account.workspaceId, imported.batchId, invoice11.id, {
      action: "manual_allocate",
      paymentRowId: payment11.id,
      amount: "1500.00",
    });
    const after = overview(db, account.workspaceId, imported.batchId);
    expect(after.summary.confirmed_minor).toBe(1500000);
    expect(after.payments.find((payment) => payment.paymentId === "P011")?.remainingMinor).toBe(50000);
    expect(after.invoices.find((invoice) => invoice.invoiceId === "INV-011")?.outstandingMinor).toBe(0);
  });

  it("rejects allocation beyond an invoice or payment balance", async () => {
    const { db, account, imported } = await setup();
    const ctx = contextFor(db, account.userId, account.workspaceId);
    const data = overview(db, account.workspaceId, imported.batchId);
    const invoice11 = data.invoices.find((invoice) => invoice.invoiceId === "INV-011")!;
    const payment11 = data.payments.find((payment) => payment.paymentId === "P011")!;
    expect(() =>
      performReview(db, ctx, account.workspaceId, imported.batchId, invoice11.id, {
        action: "manual_allocate",
        paymentRowId: payment11.id,
        amount: "2000.00",
      }),
    ).toThrow(/exceeds this invoice/i);
  });

  it("isolates batches and review actions by workspace", async () => {
    const { db, account, imported } = await setup();
    const other = createAccount(db, "Other Studio");
    await processQueuedJob(db);
    expect(getBatchOverview(db, other.workspaceId, imported.batchId)).toBeNull();
    const data = overview(db, account.workspaceId, imported.batchId);
    const invoice = data.invoices[0]!;
    const otherCtx = contextFor(db, other.userId, other.workspaceId);
    expect(() =>
      performReview(db, otherCtx, other.workspaceId, imported.batchId, invoice.id, {
        action: "leave_unresolved",
      }),
    ).toThrow(/not found/i);
    const sameWorkspaceWrongId = contextFor(db, account.userId, account.workspaceId);
    expect(() =>
      performReview(db, sameWorkspaceWrongId, other.workspaceId, imported.batchId, invoice.id, {
        action: "leave_unresolved",
      }),
    ).toThrow(/do not have access/i);
  });

  it("is idempotent when a queued job is processed twice", async () => {
    const { db, imported } = await setup();
    const allocationsBefore = db.prepare("SELECT COUNT(*) AS n FROM allocations").get() as { n: number };
    expect(await processQueuedJob(db, imported.jobId)).toBe(false);
    const allocationsAfter = db.prepare("SELECT COUNT(*) AS n FROM allocations").get() as { n: number };
    expect(allocationsAfter.n).toBe(allocationsBefore.n);
    expect(allocationsAfter.n).toBe(9);
  });

  it("recovers an interrupted job and retries without double-allocating", async () => {
    const db = makeDb();
    const account = createAccount(db);
    const imported = importFixture(db, account.workspaceId);
    const claimed = claimJob(db, imported.jobId)!;
    expect(claimed.status).toBe("validating");
    db.prepare("UPDATE jobs SET started_at = ? WHERE id = ?").run("2020-01-01T00:00:00.000Z", imported.jobId);
    expect(recoverInterruptedJobs(db)).toBe(1);
    const recovered = db.prepare("SELECT status, retry_count FROM jobs WHERE id = ?").get(imported.jobId) as {
      status: string;
      retry_count: number;
    };
    expect(recovered.status).toBe("queued");
    expect(recovered.retry_count).toBe(1);
    expect(await processQueuedJob(db, imported.jobId)).toBe(true);
    const data = getBatchOverview(db, account.workspaceId, imported.batchId)!;
    expect(data.summary.confirmed_minor).toBe(1350000);
    expect(data.summary.exact_count).toBe(9);
    expect(db.prepare("SELECT COUNT(*) AS n FROM allocations").get()).toEqual({ n: 9 });
  });

  it("refuses to retry a job that did not fail", async () => {
    const { db, account, imported } = await setup();
    expect(() => retryFailedJob(db, account.workspaceId, imported.batchId)).toThrow(/only a failed job/i);
  });
  it("persists across reopening the same database file", async () => {
    const path = await import("node:path");
    const os = await import("node:os");
    const file = path.join(os.tmpdir(), `maat-persist-${Date.now()}.db`);
    const firstDb = openDatabase(file);
    const account = createAccount(firstDb);
    const imported = importFixture(firstDb, account.workspaceId);
    await processQueuedJob(firstDb, imported.jobId);
    const before = overview(firstDb, account.workspaceId, imported.batchId).summary;
    firstDb.close();
    const reopened = openDatabase(file);
    const after = overview(reopened, account.workspaceId, imported.batchId).summary;
    expect(after).toEqual(before);
    reopened.close();
  });
});



