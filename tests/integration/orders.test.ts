import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { cartService } from "@/modules/cart";
import { checkoutService } from "@/modules/checkout";
import {
  ordersService,
  OrderAlreadyCancelledError,
  OrderAuthorizationError,
  OrderNotFoundError,
} from "@/modules/orders";
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
    const requester = { sessionId: session.id, customerId: null as string | null };
    const checkoutSession = await checkoutService.startCheckout(cart.id, null, phone);
    await checkoutService.setAddress(checkoutSession.id, requester, {
      recipientName: "عميل الاختبار",
      phoneE164: phone,
      governorate: zone.governorate,
      city: "القاهرة",
      street: "شارع الاختبار",
    });
    await checkoutService.getShippingRates(checkoutSession.id, requester);

    const order = await checkoutService.confirmAndPlaceOrder(checkoutSession.id, requester, {
      method: "COD",
      idempotencyKey: `test-${randomUUID()}`,
    });
    return { order, requester };
  }

  it("a guest order is retrievable by the exact session that placed it", async () => {
    const { order, requester } = await placeGuestOrder("+201001234567");
    const fetched = await ordersService.getOrderForCustomer(order.orderId, requester);
    expect(fetched.id).toBe(order.orderId);
  }, 15_000);

  it("a guest order is NOT retrievable from a different guest session that never placed it (Phase 9.7 IDOR fix — previously any null-customerId requester was silently authorized for ANY guest order)", async () => {
    const { order } = await placeGuestOrder("+201001234568");
    const otherGuest = { sessionId: randomUUID(), customerId: null };
    await expect(ordersService.getOrderForCustomer(order.orderId, otherGuest)).rejects.toThrow(OrderAuthorizationError);
  }, 15_000);

  it("a guest order is NOT retrievable as if it belonged to some authenticated customer", async () => {
    const { order } = await placeGuestOrder("+201001234570");
    const someOtherCustomer = { sessionId: randomUUID(), customerId: randomUUID() };
    await expect(ordersService.getOrderForCustomer(order.orderId, someOtherCustomer)).rejects.toThrow(OrderAuthorizationError);
  }, 15_000);

  it("an unknown order id raises OrderNotFoundError, not a raw Prisma error", async () => {
    await expect(
      ordersService.getOrderForCustomer(randomUUID(), { sessionId: randomUUID(), customerId: null }),
    ).rejects.toThrow(OrderNotFoundError);
  });

  it("public tracking requires BOTH the order number and the matching phone — the number alone is not enough", async () => {
    const { order } = await placeGuestOrder("+201001234569");
    const orderRow = await db.order.findUniqueOrThrow({ where: { id: order.orderId } });

    const tracked = await ordersService.trackOrder(orderRow.orderNumber, "+201001234569");
    expect(tracked.id).toBe(order.orderId);

    await expect(ordersService.trackOrder(orderRow.orderNumber, "+201099999999")).rejects.toThrow(OrderNotFoundError);
  }, 15_000);

  it("the session that placed a guest order can cancel it; a different session cannot (Phase 9.7 — cancelOrder had the same IDOR gap as getOrderForCustomer)", async () => {
    const { order, requester } = await placeGuestOrder("+201001234571");
    const otherGuest = { sessionId: randomUUID(), customerId: null };

    await expect(ordersService.cancelOrder(order.orderId, otherGuest, "test")).rejects.toThrow(OrderAuthorizationError);

    const cancelled = await ordersService.cancelOrder(order.orderId, requester, "غيّر العميل رأيه");
    expect(cancelled.status).toBe("CANCELLED");
  }, 15_000);

  it("cancelling an already-cancelled order raises OrderAlreadyCancelledError rather than re-cancelling silently", async () => {
    const { order, requester } = await placeGuestOrder("+201001234572");
    await ordersService.cancelOrder(order.orderId, requester, "أول إلغاء");
    await expect(ordersService.cancelOrder(order.orderId, requester, "ثاني إلغاء")).rejects.toThrow(OrderAlreadyCancelledError);
  }, 15_000);

  it("cancelTrackedOrder (the /track guest-facing path) cancels by order number + phone, no session needed", async () => {
    const { order } = await placeGuestOrder("+201001234573");
    const orderRow = await db.order.findUniqueOrThrow({ where: { id: order.orderId } });

    await expect(ordersService.cancelTrackedOrder(orderRow.orderNumber, "+201099999999", "wrong phone")).rejects.toThrow(
      OrderNotFoundError,
    );

    const cancelled = await ordersService.cancelTrackedOrder(orderRow.orderNumber, "+201001234573", "طلب العميل");
    expect(cancelled.status).toBe("CANCELLED");
  }, 15_000);
});
