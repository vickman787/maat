import type Database from "better-sqlite3";
import { explainException, type AiExceptionBundle } from "./ai";
import { getBatchOverview } from "./batches";
import { newId, nowIso } from "./db";
import { planMatching, type MatchInvoice, type MatchPayment } from "./matching";
import type { Job, Suggestion } from "./types";

function setJob(
  db: Database.Database,
  jobId: string,
  patch: Partial<Pick<Job, "status" | "stage" | "progress" | "message" | "error" | "started_at" | "finished_at">>,
): void {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }
  fields.push("updated_at = ?");
  values.push(nowIso());
  db.prepare(`UPDATE jobs SET ${fields.join(", ")} WHERE id = ?`).run(...values, jobId);
}

function updateBatchStatus(db: Database.Database, batchId: string, status: string): void {
  db.prepare("UPDATE batches SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), batchId);
}

export function claimJob(db: Database.Database, jobId?: string): Job | null {
  return db
    .transaction(() => {
      const candidate = jobId
        ? (db.prepare("SELECT id FROM jobs WHERE id = ? AND status = 'queued'").get(jobId) as
            | { id: string }
            | undefined)
        : (db.prepare("SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1").get() as
            | { id: string }
            | undefined);
      if (!candidate) return null;
      const now = nowIso();
      const job = db
        .prepare(
          `UPDATE jobs
           SET status = 'validating', stage = 'validating', progress = 5, started_at = ?, updated_at = ?,
               message = 'Checking source files and normalized rows.'
           WHERE id = ? AND status = 'queued'
           RETURNING *`,
        )
        .get(now, now, candidate.id) as Job | undefined;
      if (job) updateBatchStatus(db, job.batch_id, "processing");
      return job ?? null;
    })
    .immediate();
}

function sourceRow(
  db: Database.Database,
  table: "invoice_rows" | "payment_rows",
  id: string,
): {
  id: string;
  amount_minor: number;
  currency: string;
  source_row_number: number;
  original_filename: string;
} | null {
  return (
    (db
      .prepare(
        `SELECT r.id, r.amount_minor, r.currency, r.source_row_number, f.original_filename
         FROM ${table} r JOIN source_files f ON f.id = r.source_file_id
         WHERE r.id = ?`,
      )
      .get(id) as
      | {
          id: string;
          amount_minor: number;
          currency: string;
          source_row_number: number;
          original_filename: string;
        }
      | undefined) ?? null
  );
}

async function explainSuggestions(
  db: Database.Database,
  job: Job,
  overview: NonNullable<ReturnType<typeof getBatchOverview>>,
): Promise<{ succeeded: number; unavailable: number; failed: number }> {
  const pending = db
    .prepare(
      `SELECT * FROM suggestions
       WHERE batch_id = ? AND workspace_id = ? AND status = 'pending'
         AND type IN ('partial','ambiguous','unpaid')
       ORDER BY created_at`,
    )
    .all(job.batch_id, job.workspace_id) as Suggestion[];
  let succeeded = 0;
  let unavailable = 0;
  let failed = 0;
  let index = 0;
  for (const suggestion of pending) {
    index += 1;
    const invoice = overview.invoices.find((row) => row.id === suggestion.invoice_row_id);
    if (!invoice) continue;
    const invoiceSource = sourceRow(db, "invoice_rows", invoice.id);
    const candidate = suggestion.payment_row_id
      ? sourceRow(db, "payment_rows", suggestion.payment_row_id)
      : null;
    const payment = overview.payments.find((row) => row.id === suggestion.payment_row_id);
    if (!invoiceSource) continue;
    const signals = suggestion.signals_json ? (JSON.parse(suggestion.signals_json) as Record<string, unknown>) : {};
    const bundle: AiExceptionBundle = {
      invoice: {
        row_id: invoiceSource.id,
        invoice_id: invoice.invoiceId,
        customer_name: invoice.customerName,
        amount_minor: invoice.amountMinor,
        currency: invoice.currency,
        due_date: invoice.dueDate,
        source_file: invoiceSource.original_filename,
        source_row: invoiceSource.source_row_number,
      },
      candidates: (suggestion.payment_row_id
        ? overview.payments.filter((row) => row.id === suggestion.payment_row_id)
        : overview.payments.filter((row) => Array.isArray(signals.candidate_payment_ids) && signals.candidate_payment_ids.includes(row.paymentId)))
        .slice(0, 3).map((row) => ({
          row_id: row.id, payment_id: row.paymentId, payer_name: row.payerName,
          amount_minor: row.amountMinor, currency: row.currency, reference: row.reference,
          paid_at: row.paidAt, source_file: row.sourceFile, source_row: row.sourceRow,
          signals,
        })),
      deterministic: {
        suggestion_type: suggestion.type,
        rule_reason: suggestion.rule_reason,
        difference_minor:
          candidate && payment ? invoice.amountMinor - payment.amountMinor : null,
      },
    };
    try {
      const result = await explainException(db, bundle);
      if (result.status === "success") {
        succeeded += 1;
        db.prepare(
          `UPDATE suggestions SET ai_status = 'success', ai_explanation = ?, ai_evidence_json = ?,
             ai_action = ?, ai_limitations = ?, ai_provider = ?, ai_model = ?, ai_prompt_version = ?,
             ai_error = NULL, updated_at = ? WHERE id = ?`,
        ).run(
          result.explanation ?? null,
          JSON.stringify(result.evidenceRowIds ?? []),
          result.suggestedAction ?? null,
          result.limitations ?? null,
          result.provider,
          result.model,
          result.promptVersion,
          nowIso(),
          suggestion.id,
        );
      } else {
        if (result.status === "unavailable") unavailable += 1;
        else failed += 1;
        db.prepare(
          `UPDATE suggestions SET ai_status = ?, ai_provider = ?, ai_model = ?, ai_prompt_version = ?,
             ai_error = ?, updated_at = ? WHERE id = ?`,
        ).run(
          result.status,
          result.provider,
          result.model,
          result.promptVersion,
          result.error ?? null,
          nowIso(),
          suggestion.id,
        );
      }
    } catch (error) {
      failed += 1;
      db.prepare(
        "UPDATE suggestions SET ai_status = 'failed', ai_error = ?, updated_at = ? WHERE id = ?",
      ).run(error instanceof Error ? error.message.slice(0, 300) : "AI explanation failed.", nowIso(), suggestion.id);
    }
    setJob(db, job.id, {
      status: "explaining",
      stage: "explaining",
      progress: Math.min(95, 70 + Math.round((index / Math.max(1, pending.length)) * 25)),
      message: `Prepared ${index} of ${pending.length} exception explanation bundles.`,
    });
  }
  return { succeeded, unavailable, failed };
}

export async function processClaimedJob(db: Database.Database, job: Job): Promise<void> {
  try {
    const overview = getBatchOverview(db, job.workspace_id, job.batch_id);
    if (!overview) throw new Error("Batch not found for this job.");
    if (overview.files.length < 2 || overview.invoices.length === 0 || overview.payments.length === 0) {
      throw new Error("Source files or normalized rows are missing. Delete the batch and upload again.");
    }
    setJob(db, job.id, {
      status: "validating",
      stage: "validating",
      progress: 15,
      message: `${overview.invoices.length} invoices and ${overview.payments.length} payments validated.`,
    });

    setJob(db, job.id, {
      status: "matching",
      stage: "matching",
      progress: 35,
      message: "Running deterministic reference, amount, and currency checks.",
    });

    const invoicesWithHistory = new Set(
      (
        db
          .prepare("SELECT DISTINCT invoice_row_id FROM review_events WHERE batch_id = ? AND workspace_id = ?")
          .all(job.batch_id, job.workspace_id) as Array<{ invoice_row_id: string }>
      ).map((row) => row.invoice_row_id),
    );

    const allocationRows = db
      .prepare(
        `SELECT invoice_row_id, payment_row_id, amount_minor FROM allocations
         WHERE batch_id = ? AND workspace_id = ? AND reversed_at IS NULL`,
      )
      .all(job.batch_id, job.workspace_id) as Array<{
      invoice_row_id: string;
      payment_row_id: string;
      amount_minor: number;
    }>;

    const matchInvoices: MatchInvoice[] = overview.invoices
      .filter((invoice) => !invoicesWithHistory.has(invoice.id))
      .map((invoice) => ({
        id: invoice.id,
        invoiceId: invoice.invoiceId,
        customerName: invoice.customerName,
        amountMinor: invoice.amountMinor,
        dueDate: invoice.dueDate,
      }));
    const matchPayments: MatchPayment[] = overview.payments.map((payment) => ({
      id: payment.id,
      paymentId: payment.paymentId,
      payerName: payment.payerName,
      amountMinor: payment.amountMinor,
      reference: payment.reference,
      paidAt: payment.paidAt,
    }));
    const plan = planMatching(
      matchInvoices,
      matchPayments,
      allocationRows.map((row) => ({
        invoiceRowId: row.invoice_row_id,
        paymentRowId: row.payment_row_id,
        amountMinor: row.amount_minor,
      })),
      overview.batch.currency,
    );

    db.transaction(() => {
      db.prepare("DELETE FROM suggestions WHERE batch_id = ? AND workspace_id = ? AND status = 'pending'").run(
        job.batch_id,
        job.workspace_id,
      );
      const now = nowIso();
      for (const allocation of plan.allocations) {
        const existing = db
          .prepare(
            "SELECT id FROM allocations WHERE payment_row_id = ? AND workspace_id = ? AND reversed_at IS NULL",
          )
          .get(allocation.paymentRowId, job.workspace_id) as { id: string } | undefined;
        if (existing) continue;
        const balance = db.prepare(`SELECT i.amount_minor - COALESCE((SELECT SUM(a.amount_minor) FROM allocations a WHERE a.invoice_row_id = i.id AND a.reversed_at IS NULL), 0) AS remaining FROM invoice_rows i WHERE i.id = ? AND i.workspace_id = ?`).get(allocation.invoiceRowId, job.workspace_id) as { remaining: number } | undefined;
        if (!balance || balance.remaining !== allocation.amountMinor) continue;
        const allocationId = newId();
        const eventId = newId();
        db.prepare(
          `INSERT INTO allocations
           (id, batch_id, workspace_id, invoice_row_id, payment_row_id, amount_minor, source, rule_reason, created_by_user_id, created_at, review_event_id)
           VALUES (?, ?, ?, ?, ?, ?, 'automatic', ?, NULL, ?, ?)`,
        ).run(
          allocationId,
          job.batch_id,
          job.workspace_id,
          allocation.invoiceRowId,
          allocation.paymentRowId,
          allocation.amountMinor,
          allocation.ruleReason,
          now,
          eventId,
        );
        db.prepare(
          `INSERT INTO review_events
           (id, batch_id, workspace_id, invoice_row_id, payment_row_id, allocation_id, action, amount_minor, note, actor_user_id, actor_label, created_at, reverses_event_id, metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, 'confirm', ?, ?, NULL, 'Ma''at system rule', ?, NULL, ?)`,
        ).run(
          eventId,
          job.batch_id,
          job.workspace_id,
          allocation.invoiceRowId,
          allocation.paymentRowId,
          allocationId,
          allocation.amountMinor,
          allocation.ruleReason,
          now,
          JSON.stringify({ automatic: true, signals: allocation.signals }),
        );
      }
      for (const suggestion of plan.suggestions) {
        const existing = db
          .prepare(
            `SELECT id FROM suggestions
             WHERE batch_id = ? AND workspace_id = ? AND invoice_row_id = ? AND type = ?
               AND ((payment_row_id IS NULL AND ? IS NULL) OR payment_row_id = ?)
             LIMIT 1`,
          )
          .get(
            job.batch_id,
            job.workspace_id,
            suggestion.invoiceRowId,
            suggestion.type,
            suggestion.paymentRowId,
            suggestion.paymentRowId,
          ) as { id: string } | undefined;
        if (existing) {
          db.prepare(
            `UPDATE suggestions SET status = ?, allocation_amount_minor = ?, rule_reason = ?, signals_json = ?,
               updated_at = ? WHERE id = ?`,
          ).run(
            suggestion.type === "exact" ? "auto_allocated" : "pending",
            suggestion.allocationAmountMinor,
            suggestion.ruleReason,
            JSON.stringify(suggestion.signals),
            now,
            existing.id,
          );
        } else {
          db.prepare(
            `INSERT INTO suggestions
             (id, batch_id, workspace_id, invoice_row_id, payment_row_id, type, status, allocation_amount_minor,
              rule_reason, signals_json, ai_status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_requested', ?, ?)`,
          ).run(
            newId(),
            job.batch_id,
            job.workspace_id,
            suggestion.invoiceRowId,
            suggestion.paymentRowId,
            suggestion.type,
            suggestion.type === "exact" ? "auto_allocated" : "pending",
            suggestion.allocationAmountMinor,
            suggestion.ruleReason,
            JSON.stringify(suggestion.signals),
            now,
            now,
          );
        }
      }
    }).immediate();

    const afterMatch = getBatchOverview(db, job.workspace_id, job.batch_id);
    setJob(db, job.id, {
      status: "explaining",
      stage: "explaining",
      progress: 70,
      message: `${plan.allocations.length} exact allocations recorded; ${plan.suggestions.filter((row) => row.type !== "exact").length} exceptions identified.`,
    });

    const ai = afterMatch
      ? await explainSuggestions(db, job, afterMatch)
      : { succeeded: 0, unavailable: 0, failed: 0 };

    const finalOverview = getBatchOverview(db, job.workspace_id, job.batch_id);
    const aiNote =
      ai.succeeded > 0
        ? `AI explanations: ${ai.succeeded} succeeded`
        : ai.unavailable > 0
          ? "AI explanation unavailable; showing rule-based evidence."
          : ai.failed > 0
            ? "AI explanation failed; showing rule-based evidence."
            : "No AI explanations were required.";
    const summary = finalOverview?.summary;
    const message = summary
      ? `${summary.exact_count} exact matches, ${summary.partial_count} partial, ${summary.ambiguous_count} ambiguous, ${summary.unpaid_count} unpaid. ${aiNote}`
      : aiNote;
    setJob(db, job.id, {
      status: "completed",
      stage: "completed",
      progress: 100,
      message,
      finished_at: nowIso(),
    });
    updateBatchStatus(db, job.batch_id, "completed");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.replace(/SQLITE_[A-Z_]+|constraint failed/gi, "").slice(0, 500).trim() ||
          "Reconciliation failed."
        : "Reconciliation failed.";
    setJob(db, job.id, {
      status: "failed",
      stage: "failed",
      progress: 100,
      message: "Reconciliation failed. Deterministic results already committed were preserved.",
      error: message,
      finished_at: nowIso(),
    });
    updateBatchStatus(db, job.batch_id, "failed");
  }
}

export async function processQueuedJob(db: Database.Database, jobId?: string): Promise<boolean> {
  const job = claimJob(db, jobId);
  if (!job) return false;
  await processClaimedJob(db, job);
  return true;
}

export function recoverInterruptedJobs(db: Database.Database, onStartup = false): number {
  const cutoff = new Date(Date.now() - (onStartup ? 0 : 5 * 60 * 1000)).toISOString();
  const rows = db
    .prepare(
      `SELECT * FROM jobs
       WHERE status IN ('validating','matching','explaining') AND started_at IS NOT NULL AND (? = 1 OR started_at < ?)`,
    )
    .all(onStartup ? 1 : 0, cutoff) as Job[];
  for (const job of rows) {
    if (job.retry_count < job.max_retries) {
      db.prepare(
        `UPDATE jobs SET status = 'queued', stage = 'queued', progress = 0, retry_count = retry_count + 1,
         started_at = NULL, finished_at = NULL, error = NULL, updated_at = ?,
         message = 'Recovered after a worker restart; retrying safely.' WHERE id = ?`,
      ).run(nowIso(), job.id);
      updateBatchStatus(db, job.batch_id, "queued");
    } else {
      db.prepare(
        `UPDATE jobs SET status = 'failed', stage = 'failed', progress = 100, finished_at = ?, updated_at = ?,
         error = 'Worker restart exceeded the automatic retry limit.' WHERE id = ?`,
      ).run(nowIso(), nowIso(), job.id);
      updateBatchStatus(db, job.batch_id, "failed");
    }
  }
  return rows.length;
}

export function retryFailedJob(db: Database.Database, workspaceId: string, batchId: string): Job {
  return db
    .transaction(() => {
      const batch = db
        .prepare("SELECT id FROM batches WHERE id = ? AND workspace_id = ?")
        .get(batchId, workspaceId) as { id: string } | undefined;
      if (!batch) throw new Error("Batch not found.");
      const job = db
        .prepare("SELECT * FROM jobs WHERE batch_id = ? AND workspace_id = ? ORDER BY created_at DESC LIMIT 1")
        .get(batchId, workspaceId) as Job | undefined;
      if (!job) throw new Error("No job exists for this batch.");
      if (job.status !== "failed") throw new Error("Only a failed job can be retried.");
      if (job.retry_count >= job.max_retries) {
        throw new Error("The retry limit for this job has been reached.");
      }
      const now = nowIso();
      db.prepare(
        `UPDATE jobs SET status = 'queued', stage = 'queued', progress = 0, retry_count = retry_count + 1,
         error = NULL, message = 'Retry queued by reviewer.', started_at = NULL, finished_at = NULL,
         updated_at = ? WHERE id = ?`,
      ).run(now, job.id);
      updateBatchStatus(db, batchId, "queued");
      return { ...job, status: "queued" as const, retry_count: job.retry_count + 1 };
    })
    .immediate();
}

export function rerunMatching(db: Database.Database, workspaceId: string, batchId: string): Job {
  return db
    .transaction(() => {
      const batch = db
        .prepare("SELECT id, status FROM batches WHERE id = ? AND workspace_id = ?")
        .get(batchId, workspaceId) as { id: string; status: string } | undefined;
      if (!batch) throw new Error("Batch not found.");
      const running = db
        .prepare(
          "SELECT id FROM jobs WHERE batch_id = ? AND workspace_id = ? AND status IN ('queued','validating','matching','explaining')",
        )
        .get(batchId, workspaceId);
      if (running) throw new Error("A job is already running for this batch.");
      const now = nowIso();
      const jobId = newId();
      db.prepare(
        `INSERT INTO jobs (id, batch_id, workspace_id, status, stage, progress, message, created_at, updated_at, idempotency_key)
         VALUES (?, ?, ?, 'queued', 'queued', 0, ?, ?, ?, ?)`,
      ).run(jobId, batchId, workspaceId, "Rerun requested by reviewer.", now, now, `rerun-${jobId}`);
      updateBatchStatus(db, batchId, "queued");
      return db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as Job;
    })
    .immediate();
}

