import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { cartService } from "@/modules/cart";
import { checkoutService } from "@/modules/checkout";
import { ordersService, OrderAuthorizationError, OrderNotFoundError } from "@/modules/orders";
import { createTestSessionAndCart, createTestShippingZone, createTestVariant, cleanupTestData } from "./helpers/fixtures";
import { isDatabaseAvailable } from "./helpers/db-availability";

const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)("orders — authorization and tracking", () => {
  const categoryIds: string[] = [];
  const sessionIds: string[] = [];
  const shippingZoneIds: string[] = [];

  afterAll(async () => {
    await cleanupTestData({ categoryIds, sessionIds, shippingZoneIds });
    await db.$disconnect();
  });

  async function placeGuestOrder(phone: string) {
    const zone = await createTestShippingZone({ feeEgp: 45 });
    shippingZoneIds.push(zone.id);
    const { category, variant } = await createTestVariant({ quantity: 5 });
    categoryIds.push(category.id);
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);

    await cartService.addItem(cart.id, variant.id, 1);
    const checkoutSession = await checkoutService.startCheckout(cart.id, null, phone);
    await checkoutService.setAddress(checkoutSession.id, {
      recipientName: "عميل الاختبار",
      phoneE164: phone,
      governorate: zone.governorate,
      city: "القاهرة",
      street: "شارع الاختبار",
    });
    await checkoutService.getShippingRates(checkoutSession.id);

    return checkoutService.confirmAndPlaceOrder(checkoutSession.id, { method: "COD", idempotencyKey: `test-${randomUUID()}` });
  }

  it("a guest order (no customerId) is retrievable by an unauthenticated request (customerId: null)", async () => {
    const order = await placeGuestOrder("+201001234567");
    const fetched = await ordersService.getOrderForCustomer(order.orderId, null);
    expect(fetched.id).toBe(order.orderId);
  }, 15_000);

  it("a guest order is NOT retrievable as if it belonged to some other authenticated customer (IDOR check)", async () => {
    const order = await placeGuestOrder("+201001234568");
    const someOtherCustomerId = randomUUID();
    await expect(ordersService.getOrderForCustomer(order.orderId, someOtherCustomerId)).rejects.toThrow(OrderAuthorizationError);
  }, 15_000);

  it("an unknown order id raises OrderNotFoundError, not a raw Prisma error", async () => {
    await expect(ordersService.getOrderForCustomer(randomUUID(), null)).rejects.toThrow(OrderNotFoundError);
  });

  it("public tracking requires BOTH the order number and the matching phone — the number alone is not enough", async () => {
    const order = await placeGuestOrder("+201001234569");
    const orderRow = await db.order.findUniqueOrThrow({ where: { id: order.orderId } });

    const tracked = await ordersService.trackOrder(orderRow.orderNumber, "+201001234569");
    expect(tracked.id).toBe(order.orderId);

    await expect(ordersService.trackOrder(orderRow.orderNumber, "+201099999999")).rejects.toThrow(OrderNotFoundError);
  }, 15_000);
});
