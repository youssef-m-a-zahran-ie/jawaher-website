import type { Coupon } from "@prisma/client";

import { Money } from "@/domain/money";
import { promotionsRepository } from "@/modules/promotions/repository";

export type CouponRejectionReason =
  | "not_found"
  | "inactive"
  | "not_yet_active"
  | "expired"
  | "usage_limit_reached"
  | "per_customer_limit_reached"
  | "minimum_order_not_met";

export class CouponRejectedError extends Error {
  constructor(readonly reason: CouponRejectionReason) {
    super(`Coupon rejected: ${reason}`);
    this.name = "CouponRejectedError";
  }
}

/**
 * Exactly one coupon per order at MVP (ux-decisions.md §A /
 * ux-specification.md §14) — enforced structurally by CheckoutSession
 * having a single `couponCode` field, not a collection, so stacking/
 * priority/exclusion logic has nothing to arbitrate. See
 * commerce-completeness-audit.md §11 for what's deliberately not built.
 */
export const promotionsService = {
  /** Case-specific rejection reasons (ux-specification.md §14) — never a generic "invalid coupon." Re-run at final order creation, not only when first applied. */
  async validateCoupon(
    code: string,
    context: { subtotal: Money; customerId?: string },
  ): Promise<{ coupon: Coupon; discount: Money }> {
    const coupon = await promotionsRepository.findActiveCouponByCode(code);
    if (!coupon) throw new CouponRejectedError("not_found");
    if (!coupon.active) throw new CouponRejectedError("inactive");

    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) throw new CouponRejectedError("not_yet_active");
    if (coupon.endsAt && coupon.endsAt < now) throw new CouponRejectedError("expired");

    if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) {
      throw new CouponRejectedError("usage_limit_reached");
    }

    if (coupon.perCustomerLimit != null && context.customerId) {
      const used = await promotionsRepository.countRedemptionsForCustomer(coupon.id, context.customerId);
      if (used >= coupon.perCustomerLimit) throw new CouponRejectedError("per_customer_limit_reached");
    }

    if (coupon.minOrderAmountMinor != null && context.subtotal.amountMinor < coupon.minOrderAmountMinor) {
      throw new CouponRejectedError("minimum_order_not_met");
    }

    const discount = calculateDiscount(coupon, context.subtotal);
    return { coupon, discount };
  },

  async recordRedemption(couponId: string, orderId: string, customerId?: string, guestPhoneE164?: string) {
    await promotionsRepository.recordRedemption({ couponId, orderId, customerId, guestPhoneE164 });
    await promotionsRepository.incrementUsageCount(couponId);
  },
};

/** Exported for direct unit testing (tests/unit/promotions-discount.test.ts) — pure, no I/O. */
export function calculateDiscount(coupon: Coupon, subtotal: Money): Money {
  if (coupon.type === "FIXED") {
    const fixed = Money.fromMinor(coupon.value);
    return fixed.amountMinor > subtotal.amountMinor ? subtotal : fixed;
  }
  // PERCENTAGE — value is 1-100, rounded to the nearest piaster (commerce-completeness-audit.md §4).
  const amountMinor = Math.round((subtotal.amountMinor * coupon.value) / 100);
  return Money.fromMinor(amountMinor);
}
