import { describe, expect, it } from "vitest";
import { getBatchOverview } from "../lib/batches";
import { cleanupExpiredDemos, createDemoWorkspace, resetDemoWorkspace } from "../lib/demo";
import { processQueuedJob } from "../lib/jobs";
import { ImportValidationError, importBatch } from "../lib/importer";
import { consumeRateLimit } from "../lib/rate-limit";
import { FIXTURE_INVOICE_MAPPING, FIXTURE_PAYMENT_MAPPING } from "../lib/fixture";
import { getDb } from "../lib/db";
import { makeDb } from "./helpers";

function rawImport(db: ReturnType<typeof makeDb>, workspaceId: string, invoiceText: string, paymentText: string) {
  return importBatch(db, workspaceId, {
    name: "Validation test",
    currency: "USD",
    invoices: { filename: "i.csv", mimeType: "text/csv", bytes: Buffer.from(invoiceText) },
    payments: { filename: "p.csv", mimeType: "text/csv", bytes: Buffer.from(paymentText) },
    invoiceMapping: FIXTURE_INVOICE_MAPPING,
    paymentMapping: FIXTURE_PAYMENT_MAPPING,
  });
}

describe("import validation", () => {
  it("rejects mixed currencies without creating a batch", () => {
    const db = makeDb();
    const ws = createDemoWorkspace(db, "ip").workspaceId;
    expect(() =>
      rawImport(
        db,
        ws,
        "invoice_id,customer_name,amount,currency,due_date\nINV-1,Acme,1500.00,EUR,2026-11-05\n",
        "payment_id,payer_name,amount,currency,reference,paid_at\nP1,Acme,1500.00,USD,INV-1,2026-11-05\n",
      ),
    ).toThrow(ImportValidationError);
    const count = db.prepare("SELECT COUNT(*) AS n FROM batches WHERE workspace_id = ?").get(ws) as { n: number };
    expect(count.n).toBe(1);
  });

  it("rejects duplicate invoice IDs with exact row and column", () => {
    const db = makeDb();
    const ws = createDemoWorkspace(db, "ip").workspaceId;
    try {
      rawImport(
        db,
        ws,
        "invoice_id,customer_name,amount,currency,due_date\nINV-1,Acme,1500.00,USD,2026-11-05\nINV-1,Acme,1500.00,USD,2026-11-06\n",
        "payment_id,payer_name,amount,currency,reference,paid_at\nP1,Acme,1500.00,USD,INV-1,2026-11-05\n",
      );
      throw new Error("Expected validation failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ImportValidationError);
      const validation = error as ImportValidationError;
      expect(validation.errors.invoices[0]?.row).toBe(2);
      expect(validation.errors.invoices[0]?.column).toBe("invoice_id");
      expect(validation.errors.invoices[0]?.message).toContain("Duplicate invoice ID");
    }
  });

  it("rejects empty files and unsafe file names are never used as paths", () => {
    const db = makeDb();
    const ws = createDemoWorkspace(db, "ip").workspaceId;
    expect(() => rawImport(db, ws, "", "payment_id,payer_name,amount,currency\nP1,Acme,1.00,USD\n")).toThrow(
      ImportValidationError,
    );
    const file = db.prepare("SELECT original_filename, storage_key FROM source_files WHERE workspace_id = ? LIMIT 1").get(ws) as {
      original_filename: string;
      storage_key: string;
    };
    expect(file.original_filename).not.toContain("..");
    expect(file.storage_key).not.toContain("..");
  });
});

describe("demo workspace isolation", () => {
  it("seeds an isolated workspace with the canonical batch", async () => {
    const db = makeDb();
    const demo = createDemoWorkspace(db, "ip-hash");
    await processQueuedJob(db, demo.jobId);
    const overview = getBatchOverview(db, demo.workspaceId, demo.batchId)!;
    expect(overview.summary.invoice_count).toBe(12);
    expect(overview.summary.confirmed_minor).toBe(1350000);
    expect(overview.summary.unallocated_payment_count).toBe(2);
    const workspace = db.prepare("SELECT is_demo FROM workspaces WHERE id = ?").get(demo.workspaceId) as { is_demo: number };
    expect(workspace.is_demo).toBe(1);
  });

  it("reset creates a new workspace and removes the old one", async () => {
    const db = makeDb();
    const first = createDemoWorkspace(db, "ip-hash");
    await processQueuedJob(db, first.jobId);
    const second = resetDemoWorkspace(db, first.workspaceId, "ip-hash");
    expect(second.workspaceId).not.toBe(first.workspaceId);
    expect(getBatchOverview(db, first.workspaceId, first.batchId)).toBeNull();
    await processQueuedJob(db, second.jobId);
    expect(getBatchOverview(db, second.workspaceId, second.batchId)?.summary.invoice_count).toBe(12);
  });

  it("cleans up expired abandoned demo workspaces", () => {
    const db = makeDb();
    const demo = createDemoWorkspace(db, "ip-hash");
    db.prepare("UPDATE workspaces SET created_at = ? WHERE id = ?").run("2020-01-01T00:00:00.000Z", demo.workspaceId);
    expect(cleanupExpiredDemos(db)).toBe(1);
    expect(getBatchOverview(db, demo.workspaceId, demo.batchId)).toBeNull();
  });

  it("rate-limits repeated demo creation per key", () => {
    const db = getDb();
    db.prepare("DELETE FROM rate_limits").run();
    for (let index = 0; index < 3; index += 1) {
      expect(consumeRateLimit("demo:test", 3).allowed).toBe(true);
    }
    expect(consumeRateLimit("demo:test", 3).allowed).toBe(false);
  });
});

