import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatMoneyShort,
  minorToDecimalString,
  normalizeCurrency,
  normalizeDate,
  parseAmountToMinor,
} from "../lib/money";

describe("money parsing", () => {
  it("parses decimal amounts into exact minor units", () => {
    expect(parseAmountToMinor("1500.00", "USD")).toEqual({ ok: true, minor: 150000 });
    expect(parseAmountToMinor("1,500.5", "USD")).toEqual({ ok: true, minor: 150050 });
    expect(parseAmountToMinor("$1,000", "USD")).toEqual({ ok: true, minor: 100000 });
    expect(parseAmountToMinor("0.01", "USD")).toEqual({ ok: true, minor: 1 });
  });

  it("rejects negatives, refunds, extra precision, zero, and bad text", () => {
    expect(parseAmountToMinor("-1.00").ok).toBe(false);
    expect(parseAmountToMinor("(1500.00)").ok).toBe(false);
    expect(parseAmountToMinor("1500.001").ok).toBe(false);
    expect(parseAmountToMinor("0").ok).toBe(false);
    expect(parseAmountToMinor("abc").ok).toBe(false);
    expect(parseAmountToMinor("").ok).toBe(false);
  });

  it("formats with currency precision and exact decimals", () => {
    expect(formatMoney(150000, "USD")).toBe("$1,500.00");
    expect(formatMoneyShort(150000, "USD")).toBe("$1,500");
    expect(formatMoneyShort(150050, "USD")).toBe("$1,500.50");
    expect(minorToDecimalString(150050, "USD")).toBe("1500.50");
  });

  it("normalizes currency and validates calendar dates", () => {
    expect(normalizeCurrency("usd")).toBe("USD");
    expect(normalizeCurrency("US")).toBeNull();
    expect(normalizeDate("2026-11-08")).toEqual({ ok: true, value: "2026-11-08" });
    expect(normalizeDate("11/8/2026")).toEqual({ ok: true, value: "2026-11-08" });
    expect(normalizeDate("2026-02-30").ok).toBe(false);
    expect(normalizeDate("tomorrow").ok).toBe(false);
    expect(normalizeDate("")).toEqual({ ok: true, value: null });
  });
});
