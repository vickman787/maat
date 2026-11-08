import { describe, expect, it } from "vitest";
import { parse } from "csv-parse/sync";
import { getBatchOverview } from "../lib/batches";
import { processQueuedJob } from "../lib/jobs";
import {
  decisionsCsv,
  invoiceCsv,
  recordReportSnapshot,
  toCsv,
  unallocatedPaymentsCsv,
} from "../lib/reports";
import { performReview } from "../lib/review";
import { contextFor, createAccount, importFixture, makeDb } from "./helpers";

describe("CSV export safety and integrity", () => {
  it("escapes spreadsheet-formula cells and quotes delimiters", () => {
    const csv = toCsv(["name", "note"], [
      ["=2+2", "hello, world"],
      ["+SUM(A1)", 'a "quoted" value'],
      ["@cmd", "line\nbreak"],
      ["-1", "safe"],
    ]);
    expect(csv).toContain("'=2+2");
    expect(csv).toContain("'+SUM(A1)");
    expect(csv).toContain("'@cmd");
    expect(csv).toContain('"hello, world"');
    expect(csv).toContain('"a ""quoted"" value"');
    expect(csv).toContain('"line\nbreak"');
    expect(csv).toContain("'-1");
  });

  it("exports totals that equal the database after review", async () => {
    const db = makeDb();
    const account = createAccount(db);
    const imported = importFixture(db, account.workspaceId);
    await processQueuedJob(db, imported.jobId);
    const data = getBatchOverview(db, account.workspaceId, imported.batchId)!;
    const invoice10 = data.invoices.find((invoice) => invoice.invoiceId === "INV-010")!;
    const ctx = contextFor(db, account.userId, account.workspaceId);
    performReview(db, ctx, account.workspaceId, imported.batchId, invoice10.id, {
      action: "confirm",
      suggestionId: invoice10.suggestion!.id,
    });

    const after = getBatchOverview(db, account.workspaceId, imported.batchId)!;
    const invoiceRows = parse(invoiceCsv(db, account.workspaceId, imported.batchId)!, {
      columns: true,
      skip_empty_lines: true,
    }) as Array<Record<string, string>>;
    const confirmed = invoiceRows.reduce((sum, row) => sum + Number(row.confirmed_allocated), 0);
    const outstanding = invoiceRows.reduce((sum, row) => sum + Number(row.outstanding), 0);
    expect(confirmed).toBe(14500);
    expect(outstanding).toBe(3500);
    expect(after.summary.confirmed_minor).toBe(1450000);
    expect(after.summary.outstanding_minor).toBe(350000);

    const unallocatedRows = parse(unallocatedPaymentsCsv(db, account.workspaceId, imported.batchId)!, {
      columns: true,
      skip_empty_lines: true,
    }) as Array<Record<string, string>>;
    expect(unallocatedRows).toHaveLength(1);
    expect(unallocatedRows[0]!.payment_id).toBe("P011");
    expect(unallocatedRows[0]!.remaining).toBe("2000.00");

    const decisions = parse(decisionsCsv(db, account.workspaceId, imported.batchId)!, {
      columns: true,
      skip_empty_lines: true,
    }) as Array<Record<string, string>>;
    expect(decisions.some((event) => event.action === "confirm" && event.amount === "1000.00")).toBe(true);
    expect(decisions.filter((event) => event.action === "confirm")).toHaveLength(10);
  });

  it("records a report snapshot with source hashes", async () => {
    const db = makeDb();
    const account = createAccount(db);
    const imported = importFixture(db, account.workspaceId);
    await processQueuedJob(db, imported.jobId);
    const data = getBatchOverview(db, account.workspaceId, imported.batchId)!;
    const id = recordReportSnapshot(db, account.workspaceId, imported.batchId, account.userId, data);
    const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(id) as {
      totals_json: string;
      source_hashes_json: string;
    };
    const totals = JSON.parse(row.totals_json) as { invoiced_minor: number; confirmed_minor: number };
    const hashes = JSON.parse(row.source_hashes_json) as Record<string, string>;
    expect(totals.invoiced_minor).toBe(1800000);
    expect(totals.confirmed_minor).toBe(1350000);
    expect(hashes.invoices).toHaveLength(64);
    expect(hashes.payments).toHaveLength(64);
  });
});

