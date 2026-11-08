const CURRENCY_DECIMALS: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  JPY: 0,
};

export type ParsedAmount =
  | { ok: true; minor: number }
  | { ok: false; error: string };

export function currencyDecimals(currency: string): number {
  return CURRENCY_DECIMALS[currency.toUpperCase()] ?? 2;
}

export function normalizeCurrency(value: unknown): string | null {
  const raw = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(raw) ? raw : null;
}

export function parseAmountToMinor(value: unknown, currency = "USD"): ParsedAmount {
  const original = String(value ?? "").trim();
  if (!original) return { ok: false, error: "Amount is required." };
  if (/^\(.*\)$/.test(original)) {
    return { ok: false, error: "Negative amounts and refunds are not supported in this batch." };
  }
  const decimals = currencyDecimals(currency);
  const cleaned = original.replace(/^\$/, "").replace(/,/g, "").trim();
  if (cleaned.startsWith("-") || cleaned.startsWith("+")) {
    return { ok: false, error: "Negative amounts and refunds are not supported in this batch." };
  }
  const pattern = decimals === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`);
  if (!pattern.test(cleaned)) {
    return {
      ok: false,
      error:
        decimals === 0
          ? "Amount must be a whole number for this currency."
          : `Amount must be a positive number with at most ${decimals} decimal places.`,
    };
  }
  const [whole, fraction = ""] = cleaned.split(".");
  const paddedFraction = fraction.padEnd(decimals, "0");
  let minorBig: bigint;
  try {
    minorBig = BigInt(whole) * BigInt(10 ** decimals) + BigInt(paddedFraction || "0");
  } catch {
    return { ok: false, error: "Amount could not be read." };
  }
  if (minorBig <= 0n) return { ok: false, error: "Amount must be greater than zero." };
  if (minorBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { ok: false, error: "Amount is too large." };
  }
  return { ok: true, minor: Number(minorBig) };
}

export function formatMoney(minor: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: currencyDecimals(currency),
    maximumFractionDigits: currencyDecimals(currency),
  }).format(minor / 10 ** currencyDecimals(currency));
}

export function formatMoneyShort(minor: number, currency = "USD"): string {
  const decimals = currencyDecimals(currency);
  const divisor = 10 ** decimals;
  const hasFraction = minor % divisor !== 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: hasFraction ? decimals : 0,
    maximumFractionDigits: decimals,
  }).format(minor / divisor);
}

export function minorToDecimalString(minor: number, currency = "USD"): string {
  const decimals = currencyDecimals(currency);
  const divisor = 10 ** decimals;
  const whole = Math.trunc(minor / divisor);
  const fraction = Math.abs(minor % divisor);
  if (decimals === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(decimals, "0")}`;
}

export function normalizeDate(value: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, value: null };
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  let year: number;
  let month: number;
  let day: number;
  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (usMatch) {
    month = Number(usMatch[1]);
    day = Number(usMatch[2]);
    year = Number(usMatch[3]);
  } else {
    return { ok: false, error: "Date must use YYYY-MM-DD." };
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { ok: false, error: "Date is not a real calendar date." };
  }
  return { ok: true, value: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
}

export function normalizeText(value: unknown, maxLength = 300): string {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

export function normalizeReference(value: unknown): string | null {
  const text = normalizeText(value, 120).toUpperCase().replace(/\s+/g, " ");
  return text ? text : null;
}
