export type FixtureInvoice = {
  invoice_id: string;
  customer_name: string;
  amount: string;
  currency: string;
  due_date: string;
};

export type FixturePayment = {
  payment_id: string;
  payer_name: string;
  amount: string;
  currency: string;
  reference: string;
  paid_at: string;
};

export const FIXTURE_INVOICES: FixtureInvoice[] = [
  { invoice_id: "INV-001", customer_name: "Acme Works", amount: "1500.00", currency: "USD", due_date: "2026-11-05" },
  { invoice_id: "INV-002", customer_name: "Northstar Co.", amount: "1500.00", currency: "USD", due_date: "2026-11-07" },
  { invoice_id: "INV-003", customer_name: "Harbor & Pine", amount: "1500.00", currency: "USD", due_date: "2026-11-08" },
  { invoice_id: "INV-004", customer_name: "Juniper Labs", amount: "1500.00", currency: "USD", due_date: "2026-11-09" },
  { invoice_id: "INV-005", customer_name: "Willow Studio", amount: "1500.00", currency: "USD", due_date: "2026-11-10" },
  { invoice_id: "INV-006", customer_name: "Copperline", amount: "1500.00", currency: "USD", due_date: "2026-11-11" },
  { invoice_id: "INV-007", customer_name: "Bluebird Design", amount: "1500.00", currency: "USD", due_date: "2026-11-12" },
  { invoice_id: "INV-008", customer_name: "Lumen Works", amount: "1500.00", currency: "USD", due_date: "2026-11-13" },
  { invoice_id: "INV-009", customer_name: "Cedar & Co.", amount: "1500.00", currency: "USD", due_date: "2026-11-14" },
  { invoice_id: "INV-010", customer_name: "Orbit Creative", amount: "1500.00", currency: "USD", due_date: "2026-11-07" },
  { invoice_id: "INV-011", customer_name: "Fieldnotes Ltd.", amount: "1500.00", currency: "USD", due_date: "2026-11-15" },
  { invoice_id: "INV-012", customer_name: "Studio Meridian", amount: "1500.00", currency: "USD", due_date: "2026-11-16" },
];

export const FIXTURE_PAYMENTS: FixturePayment[] = [
  { payment_id: "P001", payer_name: "Acme Works", amount: "1500.00", currency: "USD", reference: "INV-001", paid_at: "2026-11-05" },
  { payment_id: "P002", payer_name: "Northstar Co.", amount: "1500.00", currency: "USD", reference: "INV-002", paid_at: "2026-11-07" },
  { payment_id: "P003", payer_name: "Harbor & Pine", amount: "1500.00", currency: "USD", reference: "INV-003", paid_at: "2026-11-08" },
  { payment_id: "P004", payer_name: "Juniper Labs", amount: "1500.00", currency: "USD", reference: "INV-004", paid_at: "2026-11-09" },
  { payment_id: "P005", payer_name: "Willow Studio", amount: "1500.00", currency: "USD", reference: "INV-005", paid_at: "2026-11-10" },
  { payment_id: "P006", payer_name: "Copperline", amount: "1500.00", currency: "USD", reference: "INV-006", paid_at: "2026-11-11" },
  { payment_id: "P007", payer_name: "Bluebird Design", amount: "1500.00", currency: "USD", reference: "INV-007", paid_at: "2026-11-12" },
  { payment_id: "P008", payer_name: "Lumen Works", amount: "1500.00", currency: "USD", reference: "INV-008", paid_at: "2026-11-13" },
  { payment_id: "P009", payer_name: "Cedar & Co.", amount: "1500.00", currency: "USD", reference: "INV-009", paid_at: "2026-11-14" },
  { payment_id: "P010", payer_name: "Orbit Creative", amount: "1000.00", currency: "USD", reference: "INV-010", paid_at: "2026-11-06" },
  { payment_id: "P011", payer_name: "Studio Meridian", amount: "2000.00", currency: "USD", reference: "", paid_at: "2026-11-16" },
];

export function invoicesCsv(): string {
  const header = "invoice_id,customer_name,amount,currency,due_date";
  const lines = FIXTURE_INVOICES.map((row) =>
    [row.invoice_id, quote(row.customer_name), row.amount, row.currency, row.due_date].join(","),
  );
  return `${[header, ...lines].join("\r\n")}\r\n`;
}

export function paymentsCsv(): string {
  const header = "payment_id,payer_name,amount,currency,reference,paid_at";
  const lines = FIXTURE_PAYMENTS.map((row) =>
    [row.payment_id, quote(row.payer_name), row.amount, row.currency, row.reference, row.paid_at].join(","),
  );
  return `${[header, ...lines].join("\r\n")}\r\n`;
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export const FIXTURE_INVOICE_MAPPING = {
  invoice_id: "invoice_id",
  customer_name: "customer_name",
  amount: "amount",
  currency: "currency",
  due_date: "due_date",
};

export const FIXTURE_PAYMENT_MAPPING = {
  payment_id: "payment_id",
  payer_name: "payer_name",
  amount: "amount",
  currency: "currency",
  reference: "reference",
  paid_at: "paid_at",
};
