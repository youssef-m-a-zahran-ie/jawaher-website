import { describe, expect, it } from "vitest";

import { Money, type CurrencyCode } from "@/domain/money";

describe("Money", () => {
  it("constructs from integer minor units", () => {
    const price = Money.fromMinor(12450);
    expect(price.amountMinor).toBe(12450);
    expect(price.currency).toBe("EGP");
    expect(price.toDecimalString()).toBe("124.50");
  });

  it("rejects non-integer minor units — money is never a float", () => {
    expect(() => Money.fromMinor(12.5)).toThrow(TypeError);
  });

  it("rejects negative amounts", () => {
    expect(() => Money.fromMinor(-100)).toThrow(RangeError);
  });

  it("parses a decimal string exactly, without float rounding", () => {
    expect(Money.fromDecimalString("124.50").amountMinor).toBe(12450);
    expect(Money.fromDecimalString("124").amountMinor).toBe(12400);
    expect(Money.fromDecimalString("0.05").amountMinor).toBe(5);
  });

  it("rejects a malformed decimal string", () => {
    expect(() => Money.fromDecimalString("124.5.0")).toThrow(TypeError);
    expect(() => Money.fromDecimalString("abc")).toThrow(TypeError);
  });

  it("adds and subtracts within the same currency", () => {
    const a = Money.fromDecimalString("100.00");
    const b = Money.fromDecimalString("24.50");
    expect(a.add(b).toDecimalString()).toBe("124.50");
    expect(a.subtract(b).toDecimalString()).toBe("75.50");
  });

  it("multiplies by an integer quantity (e.g. unit price x cart quantity)", () => {
    const unitPrice = Money.fromDecimalString("49.99");
    expect(unitPrice.multiply(3).toDecimalString()).toBe("149.97");
  });

  it("rejects multiplying by a non-integer or negative quantity", () => {
    const price = Money.fromDecimalString("10.00");
    expect(() => price.multiply(1.5)).toThrow(TypeError);
    expect(() => price.multiply(-1)).toThrow(TypeError);
  });

  it("never combines different currencies", () => {
    // Only EGP exists today (docs/design/design-decisions.md) — this test
    // guards the runtime check for whenever a second currency is added.
    const egp = Money.fromMinor(100, "EGP");
    const other = Money.fromMinor(100, "SAR" as CurrencyCode);
    expect(() => egp.add(other)).toThrow(TypeError);
  });

  it("zero() and isZero() round-trip", () => {
    expect(Money.zero().isZero()).toBe(true);
    expect(Money.fromMinor(1).isZero()).toBe(false);
  });
});
