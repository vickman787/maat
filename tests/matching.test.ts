import { describe, expect, it } from "vitest";
import { planMatching, type MatchInvoice, type MatchPayment } from "../lib/matching";
import { FIXTURE_INVOICES, FIXTURE_PAYMENTS } from "./fixtures/canonical";

function invoices(): MatchInvoice[] {
  return FIXTURE_INVOICES.map((row, index) => ({
    id: `i-${index}`,
    invoiceId: row.invoice_id,
    customerName: row.customer_name,
    amountMinor: 150000,
    dueDate: row.due_date,
  }));
}

function payments(): MatchPayment[] {
  return FIXTURE_PAYMENTS.map((row, index) => ({
    id: `p-${index}`,
    paymentId: row.payment_id,
    payerName: row.payer_name,
    amountMinor: Math.round(Number(row.amount) * 100),
    reference: row.reference || null,
    paidAt: row.paid_at,
  }));
}

describe("canonical matching plan", () => {
  it("auto-allocates only the nine unambiguous exact matches", () => {
    const plan = planMatching(invoices(), payments(), [], "USD");
    expect(plan.allocations).toHaveLength(9);
    expect(plan.allocations.every((allocation) => allocation.amountMinor === 150000)).toBe(true);
    expect(plan.allocations.map((allocation) => allocation.invoiceRowId).sort()).toEqual(
      ["i-0", "i-1", "i-2", "i-3", "i-4", "i-5", "i-6", "i-7", "i-8"],
    );
  });

  it("creates partial, ambiguous, and unpaid exceptions for the other three invoices", () => {
    const plan = planMatching(invoices(), payments(), [], "USD");
    const invoice10 = plan.suggestions.find((row) => row.invoiceRowId === "i-9");
    expect(invoice10).toMatchObject({
      type: "partial",
      paymentRowId: "p-9",
      allocationAmountMinor: 100000,
    });
    const invoice11 = plan.suggestions.find((row) => row.invoiceRowId === "i-10");
    expect(invoice11).toMatchObject({ type: "unpaid", paymentRowId: null });
    const invoice12 = plan.suggestions.find((row) => row.invoiceRowId === "i-11");
    expect(invoice12).toMatchObject({
      type: "ambiguous",
      paymentRowId: "p-10",
      allocationAmountMinor: 150000,
    });
    expect(plan.suggestions.filter((row) => row.type === "exact")).toHaveLength(9);
  });

  it("never auto-confirms an equal amount without a reference", () => {
    const plan = planMatching(
      [
        {
          id: "i-0",
          invoiceId: "INV-100",
          customerName: "A Different Customer",
          amountMinor: 150000,
          dueDate: "2026-11-20",
        },
      ],
      [
        {
          id: "p-0",
          paymentId: "P100",
          payerName: "Unrelated Payer",
          amountMinor: 150000,
          reference: null,
          paidAt: "2026-09-01",
        },
      ],
      [],
      "USD",
    );
    expect(plan.allocations).toHaveLength(0);
    expect(plan.suggestions[0]).toMatchObject({ type: "ambiguous", paymentRowId: "p-0" });
  });

  it("flags duplicate references instead of guessing", () => {
    const plan = planMatching(
      [
        {
          id: "i-0",
          invoiceId: "INV-1",
          customerName: "Acme",
          amountMinor: 150000,
          dueDate: "2026-11-05",
        },
      ],
      [
        { id: "p-0", paymentId: "P1", payerName: "Acme", amountMinor: 150000, reference: "INV-1", paidAt: "2026-11-05" },
        { id: "p-1", paymentId: "P2", payerName: "Acme", amountMinor: 150000, reference: "INV-1", paidAt: "2026-11-05" },
      ],
      [],
      "USD",
    );
    expect(plan.allocations).toHaveLength(0);
    expect(plan.suggestions[0]).toMatchObject({ type: "ambiguous", paymentRowId: null });
  });

  it("uses existing allocations to keep payment balances independent", () => {
    const plan = planMatching(
      invoices(),
      payments(),
      [{ invoiceRowId: "i-0", paymentRowId: "p-0", amountMinor: 150000 }],
      "USD",
    );
    expect(plan.allocations).toHaveLength(8);
    expect(plan.allocations.some((row) => row.invoiceRowId === "i-0")).toBe(false);
    expect(plan.suggestions.some((row) => row.invoiceRowId === "i-0")).toBe(false);
  });
});
