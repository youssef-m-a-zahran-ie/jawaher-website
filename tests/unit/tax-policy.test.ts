import { describe, expect, it } from "vitest";

import { Money } from "@/domain/money";
import { ZeroTaxPolicy } from "@/modules/checkout";

describe("ZeroTaxPolicy", () => {
  it("names itself as temporary, not as a confirmed policy", () => {
    expect(new ZeroTaxPolicy().name).toBe("zero-tax-temporary");
  });

  it("always returns zero regardless of subtotal", () => {
    const policy = new ZeroTaxPolicy();
    expect(policy.calculate({ subtotalAfterDiscount: Money.fromDecimalString("500.00") }).isZero()).toBe(true);
    expect(policy.calculate({ subtotalAfterDiscount: Money.zero() }).isZero()).toBe(true);
  });

  it("returns zero regardless of governorate — no region-based rate exists yet", () => {
    const policy = new ZeroTaxPolicy();
    const result = policy.calculate({ subtotalAfterDiscount: Money.fromDecimalString("250.00"), governorate: "القاهرة" });
    expect(result.isZero()).toBe(true);
  });
});
