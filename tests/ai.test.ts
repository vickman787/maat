import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import { explainException, type AiExceptionBundle } from "../lib/ai";
import { getBatchOverview } from "../lib/batches";
import { processQueuedJob } from "../lib/jobs";
import { createAccount, importFixture, makeDb } from "./helpers";

const bundle: AiExceptionBundle = {
  invoice: {
    row_id: "invoice-row-1",
    invoice_id: "INV-010",
    customer_name: "Orbit Creative",
    amount_minor: 150000,
    currency: "USD",
    due_date: "2026-11-07",
    source_file: "invoices-nov.csv",
    source_row: 10,
  },
  candidates: [
    {
      row_id: "payment-row-1",
      payment_id: "P010",
      payer_name: "Orbit Creative",
      amount_minor: 100000,
      currency: "USD",
      reference: "INV-010",
      paid_at: "2026-11-06",
      source_file: "payments-nov.csv",
      source_row: 10,
      signals: { reference: "INV-010" },
    },
  ],
  deterministic: {
    suggestion_type: "partial",
    rule_reason: "Reference and currency agree but the payment is short.",
    difference_minor: 50000,
  },
};

type Mode = "valid" | "unknown-evidence" | "failure";
let server: http.Server | null = null;
let requests = 0;
let lastRequest = "";

async function startMock(mode: Mode): Promise<number> {
  requests = 0;
  server = http.createServer((req, res) => {
    requests += 1;
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      lastRequest = body;
      if (mode === "failure") {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "provider down" }));
        return;
      }
      let evidence = ["invoice-row-1"];
      try {
        const parsed = JSON.parse(body) as { messages?: Array<{ content?: string }> };
        const user = JSON.parse(parsed.messages?.[1]?.content ?? "{}") as {
          exception?: AiExceptionBundle;
        };
        evidence = [user.exception?.invoice.row_id ?? "invoice-row-1"];
      } catch {
        // Fall back to the known row.
      }
      if (mode === "unknown-evidence") evidence = ["not-a-real-row"];
      const content = JSON.stringify({
        explanation:
          "The reference and currency agree, but the payment covers only part of the invoice. A human should confirm the partial allocation.",
        evidence_row_ids: evidence,
        suggested_action: "confirm_partial",
        limitations: "The source rows do not explain the difference.",
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Mock server failed to start");
  return address.port;
}

function configure(port: number) {
  process.env.AI_BASE_URL = `http://127.0.0.1:${port}/v1`;
  process.env.AI_API_KEY = "test-key";
  process.env.AI_MODEL = "test-model";
}

afterEach(async () => {
  requests = 0;
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }
  process.env.AI_BASE_URL = "";
  process.env.AI_API_KEY = "";
  process.env.AI_MODEL = "";
});

describe("AI exception explanations", () => {
  it("accepts a valid provider response with evidence rows and provider metadata", async () => {
    const port = await startMock("valid");
    configure(port);
    const db = makeDb();
    const result = await explainException(db, bundle);
    expect(result.status).toBe("success");
    expect(result.evidenceRowIds).toEqual(["invoice-row-1"]);
    expect(result.suggestedAction).toBe("confirm_partial");
    expect(result.provider).toBe("127.0.0.1");
    expect(result.model).toBe("test-model");
    expect(result.promptVersion).toBe("maat-exception-v2");
    expect(lastRequest).toContain("$1,500.00");
    expect(lastRequest).toContain("$1,000.00");
    expect(lastRequest).toContain("$500.00");
    expect(lastRequest).not.toContain("amount_minor");
    expect(lastRequest).not.toContain("difference_minor");
    expect(requests).toBe(1);
  });

  it("caches identical inputs by provider/model/prompt version", async () => {
    const port = await startMock("valid");
    configure(port);
    const db = makeDb();
    await explainException(db, bundle);
    const second = await explainException(db, bundle);
    expect(second.cached).toBe(true);
    expect(requests).toBe(1);
  });

  it("rejects evidence IDs that were not supplied", async () => {
    const port = await startMock("unknown-evidence");
    configure(port);
    const db = makeDb();
    const result = await explainException(db, bundle);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("outside the supplied rows");
    expect(requests).toBe(2);
  });

  it("returns a labelled failure when the provider is down", async () => {
    const port = await startMock("failure");
    configure(port);
    const db = makeDb();
    const result = await explainException(db, bundle);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("HTTP 500");
    expect(result.provider).toBe("127.0.0.1");
  });

  it("keeps deterministic results when configured AI succeeds during a job", async () => {
    const port = await startMock("valid");
    configure(port);
    const db = makeDb();
    const account = createAccount(db);
    const imported = importFixture(db, account.workspaceId);
    await processQueuedJob(db, imported.jobId);
    const data = getBatchOverview(db, account.workspaceId, imported.batchId)!;
    expect(data.job?.status).toBe("completed");
    expect(data.job?.message).toContain("AI explanations: 3 succeeded");
    expect(data.summary.confirmed_minor).toBe(1350000);
    const aiStatuses = db.prepare("SELECT ai_status, ai_provider, ai_model FROM suggestions WHERE ai_status = 'success'").all() as Array<{
      ai_status: string;
      ai_provider: string;
      ai_model: string;
    }>;
    expect(aiStatuses).toHaveLength(3);
    expect(aiStatuses[0]).toMatchObject({ ai_provider: "127.0.0.1", ai_model: "test-model" });
  });

  it("keeps deterministic results and labels the fallback when AI fails during a job", async () => {
    const port = await startMock("failure");
    configure(port);
    const db = makeDb();
    const account = createAccount(db);
    const imported = importFixture(db, account.workspaceId);
    await processQueuedJob(db, imported.jobId);
    const data = getBatchOverview(db, account.workspaceId, imported.batchId)!;
    expect(data.job?.status).toBe("completed");
    expect(data.job?.message).toContain("AI explanation failed; showing rule-based evidence");
    expect(data.summary.confirmed_minor).toBe(1350000);
    expect(data.summary.needs_review_count).toBe(3);
    const failed = db.prepare("SELECT COUNT(*) AS n FROM suggestions WHERE ai_status = 'failed'").get() as { n: number };
    expect(failed.n).toBe(3);
  });
  it("returns unavailable without calling a provider when unconfigured", async () => {
    const db = makeDb();
    const result = await explainException(db, bundle);
    expect(result.status).toBe("unavailable");
    expect(requests).toBe(0);
  });
});


