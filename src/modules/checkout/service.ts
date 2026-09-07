import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";

import { Money } from "@/domain/money";
import { normalizePhoneToE164 } from "@/domain/phone";
import { db } from "@/lib/db";
import { claimIdempotencyKey, completeIdempotencyKey } from "@/lib/idempotency";
import { recordAuditEvent } from "@/lib/audit-log";
import {
  reserveInventoryForItems,
  releaseReservationsForCheckoutSession,
  consumeReservationsForCheckoutSession,
} from "@/modules/catalog";
import { promotionsService, CouponRejectedError } from "@/modules/promotions";
import { shippingService } from "@/modules/shipping";
import { paymentsService } from "@/modules/payments";
import { CheckoutValidationError } from "@/modules/checkout/types";
import type { AddressSnapshotInput } from "@/modules/checkout/types";

const CHECKOUT_SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour to fill the form — independent of the 15-minute inventory-reservation TTL (commerce-completeness-audit.md §5).

/**
 * Real tax policy is an open business decision (commerce-completeness-audit.md
 * §4) — this always returns zero. That is NOT a tax-rate decision; it is a
 * wired-but-inert seam so turning on a real rate later is a one-function
 * change. Do not delete this indirection to "simplify" — its entire
 * purpose is to exist as the one place a real rate gets plugged in.
 */
function calculateTax(subtotalAfterDiscount: Money): Money {
  void subtotalAfterDiscount; // seam for a real rate — see the comment above.
  return Money.zero();
}

export type OrderSummary = {
  orderId: string;
  orderNumber: string;
  totalAmountMinor: number;
  currency: string;
  paymentStatus: string;
};

/** Public interface — module-boundaries.md's Checkout row (startCheckout/setAddress/getShippingRates/applyCoupon/submitPayment). */
export const checkoutService = {
  async startCheckout(cartId: string, customerId: string | null, guestPhoneE164: string | null) {
    const cart = await db.cart.findUnique({ where: { id: cartId }, include: { items: true } });
    if (!cart || cart.items.length === 0) throw new CheckoutValidationError("cart_empty");

    return db.checkoutSession.create({
      data: {
        cartId,
        customerId,
        guestPhoneE164,
        expiresAt: new Date(Date.now() + CHECKOUT_SESSION_TTL_MS),
      },
    });
  },

  /** Re-checks serviceability the moment an address is entered (requirements §9 / UX spec §10) — blocks progression before payment, not after. */
  async setAddress(checkoutSessionId: string, address: AddressSnapshotInput) {
    const phoneE164 = normalizePhoneToE164(address.phoneE164);
    const { serviceable } = await shippingService.checkServiceability(address.governorate);
    if (!serviceable) throw new CheckoutValidationError("unserviceable_address");

    return db.checkoutSession.update({
      where: { id: checkoutSessionId },
      data: { ...address, phoneE164 },
    });
  },

  async getShippingRates(checkoutSessionId: string) {
    const session = await db.checkoutSession.findUniqueOrThrow({ where: { id: checkoutSessionId } });
    if (!session.governorate) throw new CheckoutValidationError("address_missing");

    const rates = await shippingService.getRates(session.governorate);
    if (!rates) throw new CheckoutValidationError("unserviceable_address");

    await db.checkoutSession.update({
      where: { id: checkoutSessionId },
      data: {
        shippingFeeAmountMinor: rates.feeAmountMinor,
        shippingEstimateLabel: rates.estimateLabel,
        shippingMethodLabel: "توصيل قياسي",
      },
    });

    return rates;
  },

  /** Re-validated again at final order placement (ux-specification.md §14: an expiring-mid-session coupon is caught, not silently honored). */
  async applyCoupon(checkoutSessionId: string, code: string) {
    const session = await loadSessionWithCart(checkoutSessionId);
    const subtotal = subtotalFromCartItems(session.cart.items);

    const { discount } = await promotionsService.validateCoupon(code, {
      subtotal,
      customerId: session.customerId ?? undefined,
    });

    await db.checkoutSession.update({
      where: { id: checkoutSessionId },
      data: { couponCode: code, discountAmountMinor: discount.amountMinor },
    });

    return { discount };
  },

  /**
   * The single server-authoritative transaction: re-validates everything,
   * reserves inventory, creates the payment attempt, and — for COD, the
   * only method with a real adapter this phase — creates the Order, all
   * atomically. Idempotency-Key protected (technical-architecture.md §10):
   * a duplicate submission with the same key is a documented no-op that
   * returns the original order.
   *
   * For ONLINE payment: paymentsService.createPayment throws
   * OnlinePaymentNotConfiguredError before any Order row is written (no
   * gateway is integrated this phase — commerce-completeness-audit.md
   * §10) — the transaction rolls back cleanly, including the inventory
   * reservation, rather than leaving an order behind for a method that
   * cannot actually process it.
   */
  async confirmAndPlaceOrder(
    checkoutSessionId: string,
    params: { method: "COD" | "ONLINE"; idempotencyKey: string },
  ): Promise<OrderSummary> {
    return db.$transaction(async (tx) => {
      const claim = await claimIdempotencyKey<OrderSummary>(tx, "checkout.confirmAndPlaceOrder", params.idempotencyKey);
      if (claim.alreadyCompleted) return claim.response;

      const session = await tx.checkoutSession.findUniqueOrThrow({
        where: { id: checkoutSessionId },
        include: { cart: { include: { items: { include: { variant: { include: { product: true } } } } } } },
      });

      if (!session.recipientName || !session.governorate) throw new CheckoutValidationError("address_missing");
      if (session.shippingFeeAmountMinor == null) throw new CheckoutValidationError("shipping_missing");
      if (session.cart.items.length === 0) throw new CheckoutValidationError("cart_empty");

      let discountAmountMinor = 0;
      if (session.couponCode) {
        const subtotal = subtotalFromCartItems(session.cart.items);
        const validation = await promotionsService.validateCoupon(session.couponCode, {
          subtotal,
          customerId: session.customerId ?? undefined,
        });
        discountAmountMinor = validation.discount.amountMinor;
      }

      // Final availability re-check + reservation — one transaction-scoped, all-or-nothing step (technical-architecture.md §16).
      await reserveInventoryForItems(
        tx,
        checkoutSessionId,
        session.cart.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
      );

      const subtotal = subtotalFromCartItems(session.cart.items);
      const discount = Money.fromMinor(discountAmountMinor);
      const shippingFee = Money.fromMinor(session.shippingFeeAmountMinor);
      const subtotalAfterDiscount = subtotal.subtract(discount);
      const tax = calculateTax(subtotalAfterDiscount);
      const total = subtotalAfterDiscount.add(shippingFee).add(tax);

      const orderNumber = await generateUniqueOrderNumber(tx);

      const order = await tx.order.create({
        data: {
          orderNumber,
          checkoutSessionId,
          customerId: session.customerId,
          guestPhoneE164: session.guestPhoneE164,
          idempotencyKey: params.idempotencyKey,
          currency: "EGP",
          subtotalAmountMinor: subtotal.amountMinor,
          discountAmountMinor: discount.amountMinor,
          shippingFeeAmountMinor: shippingFee.amountMinor,
          taxAmountMinor: tax.amountMinor,
          totalAmountMinor: total.amountMinor,
          couponCode: session.couponCode,
          shippingRecipientName: session.recipientName,
          shippingPhoneE164: session.phoneE164!,
          shippingGovernorate: session.governorate,
          shippingCity: session.city!,
          shippingArea: session.area,
          shippingStreet: session.street!,
          shippingBuilding: session.building,
          shippingFloor: session.floor,
          shippingApartment: session.apartment,
          shippingLandmark: session.landmark,
          shippingNotes: session.notes,
          shippingMethodLabel: session.shippingMethodLabel ?? "توصيل قياسي",
          shippingEstimateLabel: session.shippingEstimateLabel,
          items: {
            create: session.cart.items.map((item) => ({
              variantId: item.variantId,
              skuSnapshot: item.variant.sku,
              productNameSnapshot: item.variant.product.name,
              variantLabelSnapshot: item.variant.label,
              categoryNameSnapshot: null,
              unitPriceAmountMinor: item.variant.priceAmountMinor,
              quantity: item.quantity,
              lineTotalAmountMinor: item.variant.priceAmountMinor * item.quantity,
            })),
          },
        },
      });

      // Creating the Payment can throw (e.g. no online adapter configured)
      // — that rolls back the Order and the reservation together, so an
      // unsupported method never leaves a half-placed order behind.
      const payment = await paymentsService.createPayment(tx, {
        orderId: order.id,
        method: params.method,
        amountMinor: total.amountMinor,
        currency: "EGP",
        idempotencyKey: `${params.idempotencyKey}:payment`,
      });

      await consumeReservationsForCheckoutSession(tx, checkoutSessionId);
      await tx.cart.update({ where: { id: session.cartId }, data: { status: "CONVERTED" } });
      await tx.checkoutSession.update({ where: { id: checkoutSessionId }, data: { status: "COMPLETED" } });

      if (session.couponCode) {
        const coupon = await tx.coupon.findUnique({ where: { code: session.couponCode } });
        if (coupon) {
          await tx.couponRedemption.create({
            data: { couponId: coupon.id, orderId: order.id, customerId: session.customerId, guestPhoneE164: session.guestPhoneE164 },
          });
          await tx.coupon.update({ where: { id: coupon.id }, data: { usageCount: { increment: 1 } } });
        }
      }

      await recordAuditEvent(tx, { entityType: "Order", entityId: order.id, action: "created", actorType: "customer", metadata: { method: params.method } });

      const summary: OrderSummary = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalAmountMinor: order.totalAmountMinor,
        currency: order.currency,
        paymentStatus: payment.status,
      };

      await completeIdempotencyKey(tx, params.idempotencyKey, summary);
      return summary;
    });
  },

  /** Called on payment failure/timeout/explicit cancellation — never leaves a stale hold on real availability (Phase 1 New Finding #1). */
  async abandonCheckout(checkoutSessionId: string) {
    await releaseReservationsForCheckoutSession(db, checkoutSessionId);
    await db.checkoutSession.update({ where: { id: checkoutSessionId }, data: { status: "CANCELLED" } });
  },
};

async function loadSessionWithCart(checkoutSessionId: string) {
  return db.checkoutSession.findUniqueOrThrow({
    where: { id: checkoutSessionId },
    include: { cart: { include: { items: { include: { variant: true } } } } },
  });
}

function subtotalFromCartItems(items: { quantity: number; variant: { priceAmountMinor: number } }[]): Money {
  return items.reduce(
    (sum, item) => sum.add(Money.fromMinor(item.variant.priceAmountMinor).multiply(item.quantity)),
    Money.zero(),
  );
}

async function generateUniqueOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `JAK-${String(randomInt(100000, 999999))}`;
    const existing = await tx.order.findUnique({ where: { orderNumber: candidate } });
    if (!existing) return candidate;
  }
  throw new Error("Failed to generate a unique order number after 5 attempts");
}

export { CheckoutValidationError, CouponRejectedError };
