import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { cartService } from "@/modules/cart";
import { checkoutService, CheckoutValidationError } from "@/modules/checkout";
import { InsufficientInventoryError } from "@/modules/catalog";
import { createTestSessionAndCart, createTestShippingZone, createTestVariant, cleanupTestData } from "./helpers/fixtures";
import { isDatabaseAvailable } from "./helpers/db-availability";

const dbAvailable = await isDatabaseAvailable();

async function setUpReadyCheckout(governorate: string, quantity = 5, priceEgp = 100) {
  const { category, variant } = await createTestVariant({ quantity, priceEgp });
  const { session, cart } = await createTestSessionAndCart();
  await cartService.addItem(cart.id, variant.id, 2);

  const checkoutSession = await checkoutService.startCheckout(cart.id, null, "+201001234567");
  await checkoutService.setAddress(checkoutSession.id, {
    recipientName: "عميل الاختبار",
    phoneE164: "+201001234567",
    governorate,
    city: "القاهرة",
    street: "شارع الاختبار",
  });
  await checkoutService.getShippingRates(checkoutSession.id);

  return { category, variant, session, cart, checkoutSession };
}

describe.skipIf(!dbAvailable)("checkout", () => {
  const categoryIds: string[] = [];
  const sessionIds: string[] = [];
  const shippingZoneIds: string[] = [];

  afterAll(async () => {
    await cleanupTestData({ categoryIds, sessionIds, shippingZoneIds });
    await db.$disconnect();
  });

  it("places a COD order end to end: reserves inventory, creates the order, consumes the reservation, converts the cart", async () => {
    const zone = await createTestShippingZone({ feeEgp: 60 });
    shippingZoneIds.push(zone.id);
    const { category, variant, session, checkoutSession } = await setUpReadyCheckout(zone.governorate, 5, 100);
    categoryIds.push(category.id);
    sessionIds.push(session.id);

    const order = await checkoutService.confirmAndPlaceOrder(checkoutSession.id, {
      method: "COD",
      idempotencyKey: `test-${randomUUID()}`,
    });

    expect(order.orderNumber).toMatch(/^JAK-\d{6}$/);
    expect(order.paymentStatus).toBe("AWAITING_COD_COLLECTION");
    // subtotal 200.00 + shipping 60.00 + tax 0 - discount 0 = 260.00
    expect(order.totalAmountMinor).toBe(26000);

    const orderRow = await db.order.findUniqueOrThrow({ where: { id: order.orderId }, include: { items: true } });
    expect(orderRow.status).toBe("CONFIRMED");
    expect(orderRow.items).toHaveLength(1);
    expect(orderRow.items[0].skuSnapshot).toBe(variant.sku);
    expect(orderRow.items[0].quantity).toBe(2);

    const reservations = await db.inventoryReservation.findMany({ where: { checkoutSessionId: checkoutSession.id } });
    expect(reservations.every((r) => r.status === "CONSUMED")).toBe(true);

    const cartRow = await db.cart.findUniqueOrThrow({ where: { id: (await db.checkoutSession.findUniqueOrThrow({ where: { id: checkoutSession.id } })).cartId } });
    expect(cartRow.status).toBe("CONVERTED");
  }, 15_000);

  it("a duplicate submission with the same Idempotency-Key returns the original order, never a second one", async () => {
    const zone = await createTestShippingZone({ feeEgp: 40 });
    shippingZoneIds.push(zone.id);
    const { category, session, checkoutSession } = await setUpReadyCheckout(zone.governorate);
    categoryIds.push(category.id);
    sessionIds.push(session.id);

    const idempotencyKey = `test-dup-${randomUUID()}`;
    const first = await checkoutService.confirmAndPlaceOrder(checkoutSession.id, { method: "COD", idempotencyKey });
    const second = await checkoutService.confirmAndPlaceOrder(checkoutSession.id, { method: "COD", idempotencyKey });

    expect(second.orderId).toBe(first.orderId);
    expect(second.orderNumber).toBe(first.orderNumber);

    const orderCount = await db.order.count({ where: { checkoutSessionId: checkoutSession.id } });
    expect(orderCount).toBe(1);
  }, 15_000);

  it("an item that goes out of stock between cart-view and order-creation blocks the whole order, not silently completing it short", async () => {
    const zone = await createTestShippingZone({ feeEgp: 40 });
    shippingZoneIds.push(zone.id);
    const { category, variant, session, checkoutSession } = await setUpReadyCheckout(zone.governorate, 2);
    categoryIds.push(category.id);
    sessionIds.push(session.id);

    // Someone else buys the remaining stock between cart-view and order placement.
    await db.variant.update({ where: { id: variant.id }, data: { inventoryQuantity: 0 } });

    await expect(
      checkoutService.confirmAndPlaceOrder(checkoutSession.id, { method: "COD", idempotencyKey: `test-oos-${randomUUID()}` }),
    ).rejects.toThrow(InsufficientInventoryError);

    const orderCount = await db.order.count({ where: { checkoutSessionId: checkoutSession.id } });
    expect(orderCount).toBe(0); // the transaction rolled back — no partial order.
  });

  it("rejects final placement when no address was set", async () => {
    const { category, variant } = await createTestVariant({ quantity: 5 });
    categoryIds.push(category.id);
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);
    await cartService.addItem(cart.id, variant.id, 1);
    const checkoutSession = await checkoutService.startCheckout(cart.id, null, "+201001234567");

    await expect(
      checkoutService.confirmAndPlaceOrder(checkoutSession.id, { method: "COD", idempotencyKey: `test-${randomUUID()}` }),
    ).rejects.toThrow(CheckoutValidationError);
  });

  it("rejects starting checkout with an empty cart", async () => {
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);
    await expect(checkoutService.startCheckout(cart.id, null, "+201001234567")).rejects.toThrow(CheckoutValidationError);
  });
});
