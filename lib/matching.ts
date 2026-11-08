import type { SuggestionType } from "./types";

export type MatchInvoice = {
  id: string;
  invoiceId: string;
  customerName: string;
  amountMinor: number;
  dueDate: string | null;
};

export type MatchPayment = {
  id: string;
  paymentId: string;
  payerName: string;
  amountMinor: number;
  reference: string | null;
  paidAt: string | null;
};

export type ExistingAllocation = {
  invoiceRowId: string;
  paymentRowId: string;
  amountMinor: number;
};

export type PlannedAllocation = {
  invoiceRowId: string;
  paymentRowId: string;
  amountMinor: number;
  ruleReason: string;
  signals: Record<string, unknown>;
};

export type PlannedSuggestion = {
  invoiceRowId: string;
  paymentRowId: string | null;
  type: SuggestionType;
  allocationAmountMinor: number | null;
  ruleReason: string;
  signals: Record<string, unknown>;
};

export type MatchPlan = {
  allocations: PlannedAllocation[];
  suggestions: PlannedSuggestion[];
};

function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(ltd|limited|llc|inc|incorporated|co|corp|corporation|plc|gmbh)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameScore(a: string, b: string): number {
  const na = normalizeCompany(a);
  const nb = normalizeCompany(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const at = new Set(na.split(" ").filter(Boolean));
  const bt = new Set(nb.split(" ").filter(Boolean));
  let overlap = 0;
  for (const token of at) if (bt.has(token)) overlap += 1;
  const union = new Set([...at, ...bt]).size;
  return union ? overlap / union : 0;
}

function dayDistance(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return null;
  return Math.abs(da - db) / 86400000;
}

function referenceKey(reference: string): string {
  return reference.toUpperCase().trim().replace(/\s+/g, " ");
}

export function planMatching(
  invoices: MatchInvoice[],
  payments: MatchPayment[],
  existingAllocations: ExistingAllocation[],
  currency: string,
): MatchPlan {
  const allocations: PlannedAllocation[] = [];
  const suggestions: PlannedSuggestion[] = [];

  const invoiceAllocated = new Map<string, number>();
  const paymentAllocated = new Map<string, number>();
  for (const allocation of existingAllocations) {
    invoiceAllocated.set(
      allocation.invoiceRowId,
      (invoiceAllocated.get(allocation.invoiceRowId) ?? 0) + allocation.amountMinor,
    );
    paymentAllocated.set(
      allocation.paymentRowId,
      (paymentAllocated.get(allocation.paymentRowId) ?? 0) + allocation.amountMinor,
    );
  }

  const invoicesById = new Map(invoices.map((invoice) => [invoice.invoiceId.toUpperCase(), invoice]));
  const invoicesByReference = new Map<string, MatchInvoice[]>();
  for (const invoice of invoices) {
    const key = referenceKey(invoice.invoiceId);
    const list = invoicesByReference.get(key) ?? [];
    list.push(invoice);
    invoicesByReference.set(key, list);
  }

  const paymentsByReference = new Map<string, MatchPayment[]>();
  const paymentsByName = new Map<string, MatchPayment[]>();
  const paymentsByAmount = new Map<string, MatchPayment[]>();
  const paymentsByDate = new Map<string, MatchPayment[]>();
  const paymentsByToken = new Map<string, MatchPayment[]>();
  for (const payment of payments) {
    if ((paymentAllocated.get(payment.id) ?? 0) > 0) continue;
    if (payment.reference) {
      const key = referenceKey(payment.reference);
      const list = paymentsByReference.get(key) ?? [];
      list.push(payment);
      paymentsByReference.set(key, list);
    }
    const nameKey = normalizeCompany(payment.payerName);
    for (const token of new Set(nameKey.split(" ").filter(Boolean))) {
      const bucket = paymentsByToken.get(token) ?? [];
      if (bucket.length < 50) bucket.push(payment);
      paymentsByToken.set(token, bucket);
    }
    const nameList = paymentsByName.get(nameKey) ?? [];
    nameList.push(payment);
    paymentsByName.set(nameKey, nameList);
    const amountKey = `${payment.amountMinor}`;
    const amountList = paymentsByAmount.get(amountKey) ?? [];
    amountList.push(payment);
    paymentsByAmount.set(amountKey, amountList);
    if (payment.paidAt) {
      const dateList = paymentsByDate.get(payment.paidAt) ?? [];
      dateList.push(payment);
      paymentsByDate.set(payment.paidAt, dateList);
    }
  }

  const usedPayments = new Set<string>();
  const freshInvoices = invoices.filter((invoice) => (invoiceAllocated.get(invoice.id) ?? 0) === 0);
  const invoiceOutstanding = new Map(
    invoices.map((invoice) => [invoice.id, invoice.amountMinor - (invoiceAllocated.get(invoice.id) ?? 0)]),
  );

  for (const invoice of freshInvoices) {
    const outstanding = invoiceOutstanding.get(invoice.id) ?? invoice.amountMinor;
    if (outstanding <= 0) continue;
    const referenceMatches = invoicesByReference.get(referenceKey(invoice.invoiceId)) ?? [];
    const candidatesByRef = (paymentsByReference.get(referenceKey(invoice.invoiceId)) ?? []).filter(
      (payment) => !usedPayments.has(payment.id),
    );
    const referenceIsUnique = referenceMatches.length === 1;

    if (candidatesByRef.length > 0) {
      if (!referenceIsUnique || candidatesByRef.length > 1) {
        suggestions.push({
          invoiceRowId: invoice.id,
          paymentRowId: null,
          type: "ambiguous",
          allocationAmountMinor: null,
          ruleReason:
            "The invoice reference appears on more than one row. Ma'at does not guess which payment applies; review the candidates manually.",
          signals: {
            reference: invoice.invoiceId,
            duplicate_reference: true,
            candidate_payment_ids: candidatesByRef.slice(0, 3).map((payment) => payment.paymentId),
          },
        });
        continue;
      }
      const payment = candidatesByRef[0]!;
      if (payment.amountMinor === outstanding) {
        allocations.push({
          invoiceRowId: invoice.id,
          paymentRowId: payment.id,
          amountMinor: payment.amountMinor,
          ruleReason:
            "Unique exact invoice reference, matching currency, and identical amount. Auto-allocated by rule.",
          signals: {
            reference: invoice.invoiceId,
            amount_minor: payment.amountMinor,
            currency,
          },
        });
        usedPayments.add(payment.id);
        suggestions.push({
          invoiceRowId: invoice.id,
          paymentRowId: payment.id,
          type: "exact",
          allocationAmountMinor: payment.amountMinor,
          ruleReason: "Unique exact invoice reference, matching currency, and identical amount.",
          signals: {
            reference: invoice.invoiceId,
            amount_minor: payment.amountMinor,
            currency,
            auto_allocated: true,
          },
        });
        continue;
      }
      if (payment.amountMinor < outstanding) {
        suggestions.push({
          invoiceRowId: invoice.id,
          paymentRowId: payment.id,
          type: "partial",
          allocationAmountMinor: payment.amountMinor,
          ruleReason:
            "The invoice reference and currency agree, but the payment is less than the invoice amount. This is a partial-payment candidate and needs human confirmation.",
          signals: {
            reference: invoice.invoiceId,
            invoice_amount_minor: invoice.amountMinor,
            payment_amount_minor: payment.amountMinor,
            difference_minor: outstanding - payment.amountMinor,
            currency,
          },
        });
        continue;
      }
      suggestions.push({
        invoiceRowId: invoice.id,
        paymentRowId: payment.id,
        type: "ambiguous",
        allocationAmountMinor: outstanding,
        ruleReason:
          "The invoice reference matches, but the payment is greater than the invoice amount. Review the overpayment remainder before allocating.",
        signals: {
          reference: invoice.invoiceId,
          invoice_amount_minor: invoice.amountMinor,
          payment_amount_minor: payment.amountMinor,
          overpayment_minor: payment.amountMinor - outstanding,
          currency,
        },
      });
      continue;
    }

    const candidatePool = new Map<string, MatchPayment>();
    const addCandidate = (payment: MatchPayment | undefined) => {
      if (!payment || usedPayments.has(payment.id) || candidatePool.size >= 50) return;
      if ((paymentAllocated.get(payment.id) ?? 0) > 0) return;
      candidatePool.set(payment.id, payment);
    };

    for (const payment of (paymentsByName.get(normalizeCompany(invoice.customerName)) ?? []).slice(0, 50)) addCandidate(payment);
    for (const payment of (paymentsByAmount.get(`${outstanding}`) ?? []).slice(0, 50)) addCandidate(payment);
    if (invoice.dueDate) {
      const due = Date.parse(`${invoice.dueDate}T00:00:00Z`);
      for (let offset = -7; offset <= 7; offset += 1) {
        const date = new Date(due + offset * 86400000).toISOString().slice(0, 10);
        for (const payment of (paymentsByDate.get(date) ?? []).slice(0, 50)) addCandidate(payment);
      }
    }
    for (const token of new Set(normalizeCompany(invoice.customerName).split(" ").filter(Boolean))) {
      for (const payment of paymentsByToken.get(token) ?? []) addCandidate(payment);
    }

    type Scored = { payment: MatchPayment; score: number; signals: Record<string, unknown> };
    const scored: Scored[] = [];
    for (const payment of candidatePool.values()) {
      if (payment.reference) {
        const ref = referenceKey(payment.reference);
        const refInvoice = invoicesById.get(ref);
        if (refInvoice && refInvoice.id !== invoice.id) continue;
      }
      const scoreName = nameScore(invoice.customerName, payment.payerName);
      const amountEqual = payment.amountMinor === outstanding;
      const distance = dayDistance(invoice.dueDate, payment.paidAt);
      if (scoreName < 0.6 && !amountEqual) continue;
      let score = 0;
      if (scoreName >= 0.99) score += 60;
      else if (scoreName >= 0.6) score += 35;
      if (amountEqual) score += 30;
      if (distance !== null && distance <= 3) score += 15;
      else if (distance !== null && distance <= 7) score += 5;
      scored.push({
        payment,
        score,
        signals: {
          name_similarity: Number(scoreName.toFixed(2)),
          amount_equal: amountEqual,
          day_distance: distance,
          payment_amount_minor: payment.amountMinor,
          invoice_amount_minor: invoice.amountMinor,
        },
      });
    }
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (best) {
      const tied = scored.filter((entry) => entry.score === best.score);
      if (tied.length > 1) {
        suggestions.push({
          invoiceRowId: invoice.id,
          paymentRowId: null,
          type: "ambiguous",
          allocationAmountMinor: null,
          ruleReason:
            "Several payments are similar to this invoice. No single candidate is clearly strongest, so Ma'at leaves the choice to you.",
          signals: {
            candidate_payment_ids: tied.slice(0, 3).map((entry) => entry.payment.paymentId),
            candidates: tied.slice(0, 3).map((entry) => entry.signals),
          },
        });
      } else {
        suggestions.push({
          invoiceRowId: invoice.id,
          paymentRowId: best.payment.id,
          type: "ambiguous",
          allocationAmountMinor: Math.min(best.payment.amountMinor, outstanding),
          ruleReason:
            "A similar payer, amount, or date suggests a possible match, but there is no definitive invoice reference. This is never auto-confirmed.",
          signals: {
            ...best.signals,
            reason: "similar_fields",
            currency,
          },
        });
      }
      continue;
    }

    suggestions.push({
      invoiceRowId: invoice.id,
      paymentRowId: null,
      type: "unpaid",
      allocationAmountMinor: null,
      ruleReason: "No matched payment in this batch. This is not proof that the invoice is unpaid outside this batch.",
      signals: { searched_currency: currency },
    });
  }

  return { allocations, suggestions };
}
