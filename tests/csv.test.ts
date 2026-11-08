import { describe, expect, it } from "vitest";
import {
  parseCsv,
  suggestInvoiceMapping,
  validateInvoiceRows,
  validateMapping,
  validatePaymentRows,
} from "../lib/csv";

const invoiceCsv = "\uFEFFinvoice_id,customer_name,amount,currency,due_date\r\nINV-1,\"Acme, Inc.\",1500.00,USD,2026-11-05\r\n";

describe("CSV parsing", () => {
  it("handles BOM, CRLF, and quoted commas", () => {
    const parsed = parseCsv(invoiceCsv);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.table.headers).toEqual(["invoice_id", "customer_name", "amount", "currency", "due_date"]);
    expect(parsed.table.rows[0]!.values.customer_name).toBe("Acme, Inc.");
  });

  it("parses quoted embedded newlines", () => {
    const parsed = parseCsv('invoice_id,customer_name,amount,currency\nINV-1,"Acme\nWorks",1500,USD\n');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.table.rows[0]!.values.customer_name).toBe("Acme\nWorks");
  });

  it("rejects duplicate headers, empty files, bad row lengths, and row limits", () => {
    expect(parseCsv("").ok).toBe(false);
    expect(parseCsv("a,a\n1,2\n").ok).toBe(false);
    expect(parseCsv("a,b\n1,2,3\n").ok).toBe(false);
    expect(parseCsv("a,b\n1,2\n3,4\n5,6\n", 2).ok).toBe(false);
  });

  it("suggests mappings and rejects unmapped required fields", () => {
    const parsed = parseCsv("invoice_number,client,total_due,currency\nINV-1,Acme,1500,USD\n");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const mapping = suggestInvoiceMapping(parsed.table.headers);
    expect(mapping.invoice_id).toBe("invoice_number");
    expect(mapping.customer_name).toBe("client");
    expect(mapping.amount).toBe("total_due");
    expect(validateMapping(parsed.table, mapping, "invoices")).toHaveLength(0);
    expect(validateMapping(parsed.table, { invoice_id: "invoice_number" }, "invoices").length).toBeGreaterThan(0);
  });
});

describe("row validation", () => {
  it("rejects duplicate IDs, mixed currency, invalid amounts, and bad dates", () => {
    const parsed = parseCsv(
      [
        "invoice_id,customer_name,amount,currency,due_date",
        "INV-1,Acme,1500.00,USD,2026-11-05",
        "inv-1,Acme Two,1500.00,USD,2026-11-06",
        "INV-2,Beta,-5.00,EUR,2026-02-30",
      ].join("\n"),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const mapping = {
      invoice_id: "invoice_id",
      customer_name: "customer_name",
      amount: "amount",
      currency: "currency",
      due_date: "due_date",
    };
    const result = validateInvoiceRows(parsed.table, mapping, "USD");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const messages = result.errors.map((error) => `${error.row}:${error.column}:${error.message}`).join(" | ");
    expect(messages).toContain("Duplicate invoice ID");
    expect(messages).toContain("does not match this batch");
    expect(messages).toContain("Negative amounts");
    expect(messages).toContain("real calendar date");
  });

  it("validates payments and preserves source values", () => {
    const parsed = parseCsv(
      "payment_id,payer_name,amount,currency,reference,paid_at\nP1,Acme,1000.00,USD,INV-1,2026-11-06\n",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validatePaymentRows(
      parsed.table,
      {
        payment_id: "payment_id",
        payer_name: "payer_name",
        amount: "amount",
        currency: "currency",
        reference: "reference",
        paid_at: "paid_at",
      },
      "USD",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]!.amountMinor).toBe(100000);
    expect(result.rows[0]!.reference).toBe("INV-1");
    expect(result.rows[0]!.raw.payer_name).toBe("Acme");
  });
});
