import { describe, expect, it } from "vitest";

import { Money } from "@/domain/money";
import { formatPrice } from "@/lib/format-price";

describe("formatPrice", () => {
  it("formats an EGP amount with the Arabic currency suffix", () => {
    expect(formatPrice(Money.fromDecimalString("124.50"))).toBe("124.50 ج.م.");
  });

  it("always shows two decimal places, even for whole amounts", () => {
    expect(formatPrice(Money.fromDecimalString("100"))).toBe("100.00 ج.م.");
  });

  it("formats zero correctly", () => {
    expect(formatPrice(Money.zero())).toBe("0.00 ج.م.");
  });
});
