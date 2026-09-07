import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";

/** Creates a throwaway category/product/variant for one test — prefixed so cleanup can find everything by run id. */
export async function createTestVariant(overrides: { priceEgp?: number; quantity?: number } = {}) {
  const runId = randomUUID().slice(0, 8);
  const category = await db.category.create({
    data: { slug: `test-cat-${runId}`, name: `فئة اختبار ${runId}` },
  });
  const product = await db.product.create({
    data: { slug: `test-prod-${runId}`, name: `منتج اختبار ${runId}`, categoryId: category.id },
  });
  const variant = await db.variant.create({
    data: {
      productId: product.id,
      sku: `TEST-SKU-${runId}`,
      label: "اختبار",
      priceAmountMinor: Math.round((overrides.priceEgp ?? 100) * 100),
      inventoryQuantity: overrides.quantity ?? 10,
    },
  });
  return { category, product, variant };
}

export async function createTestSessionAndCart() {
  const session = await db.session.create({
    data: { token: `test-token-${randomUUID()}`, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  const cart = await db.cart.create({ data: { sessionId: session.id } });
  return { session, cart };
}

export async function createTestShippingZone(overrides: { governorate?: string; feeEgp?: number } = {}) {
  const governorate = overrides.governorate ?? `محافظة اختبار ${randomUUID().slice(0, 8)}`;
  return db.shippingZone.create({
    data: { governorate, feeAmountMinor: Math.round((overrides.feeEgp ?? 50) * 100), estimateLabel: "1-2 يوم" },
  });
}

/** Best-effort cleanup — deletes in dependency order. Integration tests should call this in `afterAll`/`afterEach`. */
export async function cleanupTestData(ids: {
  categoryIds?: string[];
  sessionIds?: string[];
  shippingZoneIds?: string[];
}) {
  for (const sessionId of ids.sessionIds ?? []) {
    const carts = await db.cart.findMany({ where: { sessionId } });
    for (const cart of carts) {
      const checkoutSessions = await db.checkoutSession.findMany({ where: { cartId: cart.id } });
      for (const cs of checkoutSessions) {
        const orders = await db.order.findMany({ where: { checkoutSessionId: cs.id } });
        for (const order of orders) {
          await db.orderItem.deleteMany({ where: { orderId: order.id } });
          await db.payment.deleteMany({ where: { orderId: order.id } });
          await db.order.delete({ where: { id: order.id } });
        }
        await db.inventoryReservation.deleteMany({ where: { checkoutSessionId: cs.id } });
        await db.checkoutSession.delete({ where: { id: cs.id } });
      }
      await db.cartItem.deleteMany({ where: { cartId: cart.id } });
      await db.cart.delete({ where: { id: cart.id } });
    }
    await db.session.delete({ where: { id: sessionId } }).catch(() => null);
  }

  for (const categoryId of ids.categoryIds ?? []) {
    const products = await db.product.findMany({ where: { categoryId } });
    for (const product of products) {
      await db.variant.deleteMany({ where: { productId: product.id } });
      await db.product.delete({ where: { id: product.id } });
    }
    await db.category.delete({ where: { id: categoryId } }).catch(() => null);
  }

  for (const zoneId of ids.shippingZoneIds ?? []) {
    await db.shippingZone.delete({ where: { id: zoneId } }).catch(() => null);
  }
}
