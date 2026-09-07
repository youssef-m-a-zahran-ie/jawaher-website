import type { Coupon } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { Money } from "@/domain/money";
import { calculateDiscount } from "@/modules/promotions";

function makeCoupon(overrides: Partial<Coupon>): Coupon {
  return {
    id: "coupon-1",
    code: "TEST",
    type: "PERCENTAGE",
    value: 10,
    minOrderAmountMinor: null,
    usageLimit: null,
    usageCount: 0,
    perCustomerLimit: null,
    startsAt: null,
    endsAt: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("calculateDiscount", () => {
  it("applies a percentage discount, rounded to the nearest piaster", () => {
    const coupon = makeCoupon({ type: "PERCENTAGE", value: 10 });
    const discount = calculateDiscount(coupon, Money.fromDecimalString("99.99"));
    // 9999 piasters * 10% = 999.9 -> rounds to 1000 piasters = 10.00
    expect(discount.toDecimalString()).toBe("10.00");
  });

  it("applies a fixed discount", () => {
    const coupon = makeCoupon({ type: "FIXED", value: 5000 }); // 50.00 EGP
    const discount = calculateDiscount(coupon, Money.fromDecimalString("200.00"));
    expect(discount.toDecimalString()).toBe("50.00");
  });

  it("caps a fixed discount at the subtotal — never a negative order total", () => {
    const coupon = makeCoupon({ type: "FIXED", value: 10000 }); // 100.00 EGP
    const discount = calculateDiscount(coupon, Money.fromDecimalString("30.00"));
    expect(discount.toDecimalString()).toBe("30.00");
  });

  it("a 100% percentage discount never exceeds the subtotal", () => {
    const coupon = makeCoupon({ type: "PERCENTAGE", value: 100 });
    const subtotal = Money.fromDecimalString("75.50");
    const discount = calculateDiscount(coupon, subtotal);
    expect(discount.amountMinor).toBeLessThanOrEqual(subtotal.amountMinor);
    expect(discount.toDecimalString()).toBe("75.50");
  });

  it("a zero subtotal produces a zero discount either way", () => {
    expect(calculateDiscount(makeCoupon({ type: "PERCENTAGE", value: 50 }), Money.zero()).isZero()).toBe(true);
    expect(calculateDiscount(makeCoupon({ type: "FIXED", value: 500 }), Money.zero()).isZero()).toBe(true);
  });
});
