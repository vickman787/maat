import type Database from "better-sqlite3";
import type { AuthContext } from "./auth";
import { AuthError } from "./auth";
import { getBatchOverview, type BatchOverview, type InvoiceView, type PaymentView } from "./batches";
import { newId, nowIso } from "./db";
import { parseAmountToMinor } from "./money";
import type { ReviewAction, ReviewEvent, Suggestion } from "./types";

export type ReviewPayload = {
  action: ReviewAction;
  suggestionId?: string;
  paymentRowId?: string;
  amount?: string;
  note?: string;
  allocationId?: string;
};

export type ReviewData = {
  overview: BatchOverview;
  invoice: InvoiceView;
  payments: PaymentView[];
  suggestions: Suggestion[];
  history: ReviewEvent[];
};

export function getReviewData(
  db: Database.Database,
  workspaceId: string,
  batchId: string,
  invoiceRowId: string,
): ReviewData | null {
  const overview = getBatchOverview(db, workspaceId, batchId);
  if (!overview) return null;
  const invoice = overview.invoices.find((row) => row.id === invoiceRowId);
  if (!invoice) return null;
  const suggestions = db
    .prepare(
      "SELECT * FROM suggestions WHERE batch_id = ? AND workspace_id = ? AND invoice_row_id = ? ORDER BY created_at DESC",
    )
    .all(batchId, workspaceId, invoiceRowId) as Suggestion[];
  const history = db
    .prepare(
      "SELECT * FROM review_events WHERE batch_id = ? AND workspace_id = ? AND invoice_row_id = ? ORDER BY created_at DESC",
    )
    .all(batchId, workspaceId, invoiceRowId) as ReviewEvent[];
  return {
    overview,
    invoice,
    payments: overview.payments,
    suggestions,
    history,
  };
}

function actor(ctx: AuthContext): { userId: string | null; label: string } {
  return {
    userId: ctx.user?.id ?? null,
    label: ctx.actorLabel,
  };
}

export function performReview(
  db: Database.Database,
  ctx: AuthContext,
  workspaceId: string,
  batchId: string,
  invoiceRowId: string,
  payload: ReviewPayload,
): { message: string; allocationId?: string } {
  if (!ctx.workspace || ctx.workspace.id !== workspaceId) {
    throw new AuthError(403, "You do not have access to this workspace.");
  }
  const note = payload.note ? payload.note.trim().slice(0, 1000) : null;
  const who = actor(ctx);

  return db
    .transaction(() => {
      const batch = db
        .prepare("SELECT id, currency FROM batches WHERE id = ? AND workspace_id = ?")
        .get(batchId, workspaceId) as { id: string; currency: string } | undefined;
      if (!batch) throw new AuthError(404, "Batch not found.");

      const invoice = db
        .prepare("SELECT * FROM invoice_rows WHERE id = ? AND batch_id = ? AND workspace_id = ?")
        .get(invoiceRowId, batchId, workspaceId) as
        | { id: string; amount_minor: number }
        | undefined;
      if (!invoice) throw new AuthError(404, "Invoice not found in this batch.");

      const activeInvoiceTotal = (
        db
          .prepare(
            "SELECT COALESCE(SUM(amount_minor),0) AS total FROM allocations WHERE invoice_row_id = ? AND workspace_id = ? AND reversed_at IS NULL",
          )
          .get(invoiceRowId, workspaceId) as { total: number }
      ).total;
      const invoiceOutstanding = invoice.amount_minor - activeInvoiceTotal;

      const eventId = newId();
      const createdAt = nowIso();

      if (payload.action === "undo") {
        if (!payload.allocationId) throw new AuthError(400, "Choose an allocation to undo.");
        const allocation = db
          .prepare(
            `SELECT * FROM allocations
             WHERE id = ? AND batch_id = ? AND workspace_id = ? AND reversed_at IS NULL`,
          )
          .get(payload.allocationId, batchId, workspaceId) as
          | {
              id: string;
              invoice_row_id: string;
              payment_row_id: string;
              amount_minor: number;
              review_event_id: string | null;
            }
          | undefined;
        if (!allocation) throw new AuthError(409, "This allocation is already reversed or does not exist.");
        if (allocation.invoice_row_id !== invoiceRowId) {
          throw new AuthError(400, "The allocation does not belong to this invoice.");
        }
        db.prepare("UPDATE allocations SET reversed_at = ?, reversed_by_user_id = ? WHERE id = ?").run(
          createdAt,
          who.userId,
          allocation.id,
        );
        db.prepare(
          `UPDATE suggestions SET status = 'pending', updated_at = ?
           WHERE invoice_row_id = ? AND payment_row_id = ? AND status IN ('accepted','auto_allocated')`,
        ).run(createdAt, invoiceRowId, allocation.payment_row_id);
        db.prepare(
          `INSERT INTO review_events
           (id, batch_id, workspace_id, invoice_row_id, payment_row_id, allocation_id, action, amount_minor, note, actor_user_id, actor_label, created_at, reverses_event_id, metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, 'undo', ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          eventId,
          batchId,
          workspaceId,
          invoiceRowId,
          allocation.payment_row_id,
          allocation.id,
          allocation.amount_minor,
          note,
          who.userId,
          who.label,
          createdAt,
          allocation.review_event_id,
          JSON.stringify({ reversed_allocation_id: allocation.id }),
        );
        return { message: "Allocation undone. A reversal event was added to the audit history." };
      }

      const suggestion = payload.suggestionId
        ? (db
            .prepare(
              "SELECT * FROM suggestions WHERE id = ? AND batch_id = ? AND workspace_id = ? AND invoice_row_id = ?",
            )
            .get(payload.suggestionId, batchId, workspaceId, invoiceRowId) as Suggestion | undefined)
        : undefined;

      if (payload.action === "reject") {
        if (!suggestion) throw new AuthError(400, "Suggestion not found.");
        if (suggestion.status !== "pending") {
          throw new AuthError(409, "This suggestion has already been reviewed.");
        }
        db.prepare("UPDATE suggestions SET status = 'rejected', updated_at = ? WHERE id = ?").run(
          createdAt,
          suggestion.id,
        );
        db.prepare(
          `INSERT INTO review_events
           (id, batch_id, workspace_id, invoice_row_id, payment_row_id, allocation_id, action, amount_minor, note, actor_user_id, actor_label, created_at, reverses_event_id, metadata_json)
           VALUES (?, ?, ?, ?, ?, NULL, 'reject', NULL, ?, ?, ?, ?, NULL, ?)`,
        ).run(
          eventId,
          batchId,
          workspaceId,
          invoiceRowId,
          suggestion.payment_row_id,
          note,
          who.userId,
          who.label,
          createdAt,
          JSON.stringify({ suggestion_id: suggestion.id }),
        );
        return { message: "Suggestion rejected. No money was allocated." };
      }

      if (payload.action === "leave_unresolved") {
        if (suggestion && suggestion.status === "pending") {
          db.prepare("UPDATE suggestions SET status = 'left_unresolved', updated_at = ? WHERE id = ?").run(
            createdAt,
            suggestion.id,
          );
        }
        db.prepare(
          `INSERT INTO review_events
           (id, batch_id, workspace_id, invoice_row_id, payment_row_id, allocation_id, action, amount_minor, note, actor_user_id, actor_label, created_at, reverses_event_id, metadata_json)
           VALUES (?, ?, ?, ?, ?, NULL, 'leave_unresolved', NULL, ?, ?, ?, ?, NULL, ?)`,
        ).run(
          eventId,
          batchId,
          workspaceId,
          invoiceRowId,
          suggestion?.payment_row_id ?? null,
          note,
          who.userId,
          who.label,
          createdAt,
          JSON.stringify({ suggestion_id: suggestion?.id ?? null }),
        );
        return { message: "Invoice left unresolved. It remains visible in the report." };
      }

      if (payload.action === "confirm" || payload.action === "manual_allocate") {
        if (invoiceOutstanding <= 0) {
          throw new AuthError(409, "This invoice is already fully allocated.");
        }
        let paymentRowId: string;
        let ruleReason: string;
        let linkedSuggestion: Suggestion | undefined;
        if (payload.action === "confirm") {
          linkedSuggestion = suggestion;
          if (!linkedSuggestion) throw new AuthError(400, "Choose a suggestion to confirm.");
          if (linkedSuggestion.status !== "pending") {
            throw new AuthError(409, "This suggestion has already been reviewed.");
          }
          if (!linkedSuggestion.payment_row_id) {
            throw new AuthError(400, "This suggestion has no single candidate. Choose a payment manually.");
          }
          paymentRowId = linkedSuggestion.payment_row_id;
          ruleReason = linkedSuggestion.rule_reason;
        } else {
          if (!payload.paymentRowId) throw new AuthError(400, "Choose a payment to allocate.");
          paymentRowId = payload.paymentRowId;
          ruleReason = "Reviewer manually selected this payment after inspecting the source rows.";
          linkedSuggestion = suggestion;
        }

        const payment = db
          .prepare("SELECT * FROM payment_rows WHERE id = ? AND batch_id = ? AND workspace_id = ?")
          .get(paymentRowId, batchId, workspaceId) as
          | { id: string; amount_minor: number; payment_id: string }
          | undefined;
        if (!payment) throw new AuthError(404, "Payment not found in this batch.");
        const activePaymentTotal = (
          db
            .prepare(
              "SELECT COALESCE(SUM(amount_minor),0) AS total FROM allocations WHERE payment_row_id = ? AND workspace_id = ? AND reversed_at IS NULL",
            )
            .get(paymentRowId, workspaceId) as { total: number }
        ).total;
        const paymentRemaining = payment.amount_minor - activePaymentTotal;
        if (paymentRemaining <= 0) {
          throw new AuthError(409, "This payment has no remaining balance and cannot be allocated again.");
        }

        let amountMinor: number;
        if (payload.amount !== undefined && payload.amount !== "") {
          if (payload.action === "confirm") {
            throw new AuthError(400, "Confirming a suggestion uses its recorded amount.");
          }
          const parsed = parseAmountToMinor(payload.amount, batch.currency);
          if (!parsed.ok) throw new AuthError(400, parsed.error);
          amountMinor = parsed.minor;
        } else if (payload.action === "confirm" && linkedSuggestion?.allocation_amount_minor) {
          amountMinor = linkedSuggestion.allocation_amount_minor;
        } else {
          amountMinor = Math.min(paymentRemaining, invoiceOutstanding);
        }

        if (amountMinor <= 0) throw new AuthError(400, "Allocation amount must be greater than zero.");
        if (amountMinor > paymentRemaining) {
          throw new AuthError(400, "Allocation exceeds this payment's remaining balance.");
        }
        if (amountMinor > invoiceOutstanding) {
          throw new AuthError(400, "Allocation exceeds this invoice's outstanding balance.");
        }

        const existing = db
          .prepare(
            "SELECT id FROM allocations WHERE payment_row_id = ? AND workspace_id = ? AND reversed_at IS NULL",
          )
          .get(paymentRowId, workspaceId) as { id: string } | undefined;
        if (existing) throw new AuthError(409, "This payment is already allocated to an invoice.");

        const allocationId = newId();
        db.prepare(
          `INSERT INTO allocations
           (id, batch_id, workspace_id, invoice_row_id, payment_row_id, amount_minor, source, rule_reason, created_by_user_id, created_at, review_event_id)
           VALUES (?, ?, ?, ?, ?, ?, 'review', ?, ?, ?, ?)`,
        ).run(
          allocationId,
          batchId,
          workspaceId,
          invoiceRowId,
          paymentRowId,
          amountMinor,
          ruleReason,
          who.userId,
          createdAt,
          eventId,
        );

        if (linkedSuggestion && linkedSuggestion.payment_row_id === paymentRowId) {
          db.prepare("UPDATE suggestions SET status = 'accepted', updated_at = ? WHERE id = ?").run(
            createdAt,
            linkedSuggestion.id,
          );
        }
        db.prepare(
          `UPDATE suggestions SET status = 'superseded', updated_at = ?
           WHERE invoice_row_id = ? AND id != ? AND status = 'pending'`,
        ).run(createdAt, invoiceRowId, linkedSuggestion?.id ?? "");

        db.prepare(
          `INSERT INTO review_events
           (id, batch_id, workspace_id, invoice_row_id, payment_row_id, allocation_id, action, amount_minor, note, actor_user_id, actor_label, created_at, reverses_event_id, metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        ).run(
          eventId,
          batchId,
          workspaceId,
          invoiceRowId,
          paymentRowId,
          allocationId,
          payload.action,
          amountMinor,
          note,
          who.userId,
          who.label,
          createdAt,
          JSON.stringify({
            suggestion_id: linkedSuggestion?.id ?? null,
            payment_id: payment.payment_id,
          }),
        );
        return {
          message:
            payload.action === "confirm"
              ? "Allocation confirmed and added to the audit history."
              : "Payment allocated and added to the audit history.",
          allocationId,
        };
      }

      throw new AuthError(400, "Unknown review action.");
    })
    .immediate();
}
