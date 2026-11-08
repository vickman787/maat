"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, LoaderCircle, Undo2 } from "lucide-react";
import { formatMoney, minorToDecimalString } from "@/lib/money";

type SuggestionInfo = {
  id: string;
  type: string;
  status: string;
  paymentRowId: string | null;
  allocationAmountMinor: number | null;
  ruleReason: string;
};

type PaymentOption = {
  id: string;
  paymentId: string;
  payerName: string;
  currency: string;
  remainingMinor: number;
  reference: string | null;
  paidAt: string | null;
};

type AllocationInfo = {
  id: string;
  paymentId: string;
  amountMinor: number;
  source: string;
  createdAt: string;
};

export function ReviewForm({
  batchId,
  invoiceRowId,
  invoiceId,
  currency,
  outstandingMinor,
  suggestion,
  payments,
  allocations,
}: {
  batchId: string;
  invoiceRowId: string;
  invoiceId: string;
  currency: string;
  outstandingMinor: number;
  suggestion: SuggestionInfo | null;
  payments: PaymentOption[];
  allocations: AllocationInfo[];
}) {
  const router = useRouter();
  const hasPendingSuggestion = suggestion?.status === "pending";
  const suggestedPayment = hasPendingSuggestion && suggestion?.paymentRowId
    ? payments.find((payment) => payment.id === suggestion.paymentRowId)
    : undefined;
  const eligible = useMemo(
    () => payments.filter((payment) => payment.remainingMinor > 0),
    [payments],
  );
  const [action, setAction] = useState<"confirm" | "manual" | "reject" | "unresolved">(
    hasPendingSuggestion && suggestion?.paymentRowId
      ? "confirm"
      : eligible.length > 0
        ? "manual"
        : "unresolved",
  );
  const [paymentRowId, setPaymentRowId] = useState(
    suggestedPayment?.id ?? eligible[0]?.id ?? "",
  );
  const [amount, setAmount] = useState(() => {
    const payment = suggestedPayment ?? eligible[0];
    if (suggestion?.type === "partial" && suggestion.allocationAmountMinor) {
      return minorToDecimalString(suggestion.allocationAmountMinor, currency);
    }
    if (payment) return minorToDecimalString(Math.min(payment.remainingMinor, outstandingMinor), currency);
    return "";
  });
  const [note, setNote] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [undoTarget, setUndoTarget] = useState<string | null>(null);

  const confirmAmount = suggestedPayment
    ? Math.min(
        suggestion?.allocationAmountMinor ?? suggestedPayment.remainingMinor,
        suggestedPayment.remainingMinor,
        outstandingMinor,
      )
    : 0;

  function selectPayment(id: string) {
    setPaymentRowId(id);
    const payment = eligible.find((row) => row.id === id);
    if (payment) {
      setAmount(minorToDecimalString(Math.min(payment.remainingMinor, outstandingMinor), currency));
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!reviewed) {
      setError("Confirm that you reviewed both source rows.");
      return;
    }
    if (action === "manual" && !paymentRowId) {
      setError("Choose a payment to allocate.");
      return;
    }
    if (action === "manual" && !amount) {
      setError("Enter an allocation amount.");
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        action:
          action === "confirm"
            ? "confirm"
            : action === "reject"
              ? "reject"
              : action === "unresolved"
                ? "leave_unresolved"
                : "manual_allocate",
        invoiceRowId,
        note: note.trim() || undefined,
      };
      if (suggestion) payload.suggestionId = suggestion.id;
      if (action === "manual") {
        payload.paymentRowId = paymentRowId;
        payload.amount = amount;
      }
      const response = await fetch(`/api/batches/${batchId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        setError(body.error ?? "The decision could not be saved.");
        setBusy(false);
        return;
      }
      setMessage(body.message ?? "Decision saved.");
      setReviewed(false);
      setBusy(false);
      router.refresh();
    } catch {
      setError("The decision could not be saved. Check your connection and retry.");
      setBusy(false);
    }
  }

  async function undo(allocationId: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/batches/${batchId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "undo", invoiceRowId, allocationId }),
      });
      const body = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        setError(body.error ?? "The allocation could not be undone.");
        setBusy(false);
        return;
      }
      setUndoTarget(null);
      setMessage(body.message ?? "Allocation undone.");
      setBusy(false);
      router.refresh();
    } catch {
      setError("The allocation could not be undone. Check your connection and retry.");
      setBusy(false);
    }
  }

  return (
    <section className="panel decision-panel">
      <div className="eyebrow">Your review</div>
      <h2>A clear decision.<br />A traceable record.</h2>
      <p className="muted">
        Ma&apos;at saves your decision separately from the imported source data. This is an accounting
        classification—not a transfer or collection.
      </p>

      {message && (
        <div className="form-note" role="status" style={{ marginBottom: "0.9rem" }}>
          <Check size={15} /> {message}
        </div>
      )}
      {error && (
        <div className="form-error" role="alert" style={{ marginBottom: "0.9rem" }}>
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {allocations.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <div className="field-label">Recorded allocations</div>
          <ul className="allocation-list">
            {allocations.map((allocation) => (
              <li key={allocation.id}>
                <span>
                  <b>{allocation.paymentId}</b> · {formatMoney(allocation.amountMinor, currency)}{" "}
                  <small className="muted" style={{ display: "inline" }}>
                    {allocation.source === "automatic" ? "system rule" : "human review"}
                  </small>
                </span>
                {undoTarget === allocation.id ? (
                  <span className="row" style={{ gap: "0.4rem" }}>
                    <button
                      type="button"
                      className="button danger small-button"
                      onClick={() => undo(allocation.id)}
                      disabled={busy}
                    >
                      Confirm undo
                    </button>
                    <button
                      type="button"
                      className="button secondary small-button"
                      onClick={() => setUndoTarget(null)}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="button secondary small-button"
                    onClick={() => setUndoTarget(allocation.id)}
                    disabled={busy}
                  >
                    <Undo2 size={13} /> Undo
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="field-hint">
            Undo adds a reversal event. It never erases the original decision or allocation.
          </p>
        </div>
      )}

      <form onSubmit={submit} noValidate>
        <div className="field-label" style={{ marginTop: 0 }}>Decision</div>

        {hasPendingSuggestion && suggestion?.paymentRowId && (
          <label className={`radio${action === "confirm" ? " selected" : ""}`}>
            <input
              type="radio"
              name="decision"
              value="confirm"
              checked={action === "confirm"}
              onChange={() => setAction("confirm")}
            />
            <span>
              <b>{suggestion.type === "partial" ? "Confirm partial match" : "Confirm suggested allocation"}</b>
              <small>
                Assign {formatMoney(confirmAmount, currency)} to {invoiceId}.{" "}
                {outstandingMinor - confirmAmount > 0
                  ? `${formatMoney(outstandingMinor - confirmAmount, currency)} stays outstanding.`
                  : "This settles the invoice."}
              </small>
            </span>
          </label>
        )}

        {eligible.length > 0 && (
          <label className={`radio${action === "manual" ? " selected" : ""}`}>
            <input
              type="radio"
              name="decision"
              value="manual"
              checked={action === "manual"}
              onChange={() => setAction("manual")}
            />
            <span style={{ flex: 1 }}>
              <b>{hasPendingSuggestion ? "Choose another eligible payment" : "Allocate a payment"}</b>
              <small>Only payments with a remaining balance are available.</small>
              {action === "manual" && (
                <span className="stack" style={{ marginTop: "0.6rem", gap: "0.5rem" }}>
                  <select
                    className="select"
                    value={paymentRowId}
                    onChange={(event) => selectPayment(event.target.value)}
                    aria-label="Eligible payment"
                  >
                    <option value="">Select a payment…</option>
                    {eligible.map((payment) => (
                      <option key={payment.id} value={payment.id}>
                        {payment.paymentId} · {payment.payerName} ·{" "}
                        {formatMoney(payment.remainingMinor, payment.currency)} available
                      </option>
                    ))}
                  </select>
                  <span className="row">
                    <label htmlFor="allocation-amount" className="field-label" style={{ margin: 0 }}>
                      Allocation amount ({currency})
                    </label>
                    <input
                      id="allocation-amount"
                      className="input"
                      inputMode="decimal"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      style={{ maxWidth: 170 }}
                    />
                  </span>
                  <span className="field-hint">
                    Capped by the invoice outstanding ({formatMoney(outstandingMinor, currency)}) and
                    the payment balance.
                  </span>
                </span>
              )}
            </span>
          </label>
        )}

        {hasPendingSuggestion && (
          <label className={`radio${action === "reject" ? " selected" : ""}`}>
            <input
              type="radio"
              name="decision"
              value="reject"
              checked={action === "reject"}
              onChange={() => setAction("reject")}
            />
            <span>
              <b>Reject suggestion</b>
              <small>Keep the payment unassigned and record why.</small>
            </span>
          </label>
        )}

        <label className={`radio${action === "unresolved" ? " selected" : ""}`}>
          <input
            type="radio"
            name="decision"
            value="unresolved"
            checked={action === "unresolved"}
            onChange={() => setAction("unresolved")}
          />
          <span>
            <b>Leave unresolved</b>
            <small>The item stays visible in the workbench and report.</small>
          </span>
        </label>

        <div className="field" style={{ marginTop: "1rem" }}>
          <label htmlFor="review-note">
            Review note <span className="muted">(optional)</span>
          </label>
          <textarea
            id="review-note"
            className="textarea"
            value={note}
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add context for your team…"
          />
        </div>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(event) => setReviewed(event.target.checked)}
          />
          <span>I reviewed both source rows and understand this records a classification, not a payment.</span>
        </label>

        <button type="submit" className="button wide" disabled={busy}>
          {busy ? <LoaderCircle size={15} className="spin" /> : null}
          {busy
            ? "Saving decision…"
            : action === "confirm"
              ? "Save confirmed allocation →"
              : action === "manual"
                ? "Allocate selected payment →"
                : action === "reject"
                  ? "Reject suggestion →"
                  : "Leave unresolved →"}
        </button>
        <p className="small muted" style={{ marginTop: "0.6rem" }}>
          Amounts are validated against both the invoice and the payment balance on the server.
        </p>
      </form>
    </section>
  );
}


