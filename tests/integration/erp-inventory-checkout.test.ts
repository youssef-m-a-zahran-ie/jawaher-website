import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

import { isDatabaseAvailable } from "./helpers/db-availability";
import { createTestSessionAndCart, createTestShippingZone, createTestVariant, cleanupTestData } from "./helpers/fixtures";

/**
 * Phase 9.5 — ERP-authoritative inventory at the two points this phase
 * actually changed: cart quantity clamping and checkout confirmation.
 * Combines this repo's two established integration-test conventions:
 * real Prisma + skipIf(!dbAvailable) (catalog-storefront.test.ts) and a
 * mocked ERP HTTP layer via `@/lib/env` + global fetch (catalog-sync.test.ts).
 */
const dbAvailable = await isDatabaseAvailable();

function mockErpEnv() {
  vi.resetModules();
  vi.doMock("@/lib/env", () => ({
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.DATABASE_URL,
      ERP_BASE_URL: "http://localhost:9999",
      ERP_API_KEY: "test-api-key",
      ERP_CONNECTION_ID: "test-connection-id",
      ERP_REQUEST_TIMEOUT_MS: undefined,
    },
  }));
}

function stubErpAvailability(bySku: Record<string, number>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const { skus } = JSON.parse(String(init?.body)) as { skus: string[] };
      const items = skus.filter((sku) => sku in bySku).map((sku) => ({ sku, available: bySku[sku] }));
      const notFoundSkus = skus.filter((sku) => !(sku in bySku));
      return new Response(JSON.stringify({ items, notFoundSkus, requestId: "rid" }), { status: 200 });
    })
  );
}

function stubErpUnavailable() {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
}

describe.skipIf(!dbAvailable)("ERP-authoritative inventory at cart/checkout (Phase 9.5)", () => {
  const categoryIds: string[] = [];
  const sessionIds: string[] = [];
  const shippingZoneIds: string[] = [];

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    await cleanupTestData({ categoryIds, sessionIds, shippingZoneIds });
    await db.$disconnect();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("@/lib/env");
  });

  it("cart add clamps to ERP's lower availability even though the Website-local count is higher", async () => {
    mockErpEnv();
    const erpVariantId = `erp-v-${randomUUID()}`;
    const { category, variant } = await createTestVariant({ quantity: 100, erpVariantId });
    categoryIds.push(category.id);
    stubErpAvailability({ [variant.sku]: 3 });

    const { cartService } = await import("@/modules/cart");
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);

    const result = await cartService.addItem(cart.id, variant.id, 10);
    expect(result.addedQuantity).toBe(3);
    expect(result.clamped).toBe(true);
  });

  it("cart add falls back to Website-local availability (unchanged pre-9.5 behavior) when the variant has no erpVariantId", async () => {
    mockErpEnv();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { category, variant } = await createTestVariant({ quantity: 5 }); // no erpVariantId

    const { cartService } = await import("@/modules/cart");
    const { session, cart } = await createTestSessionAndCart();
    categoryIds.push(category.id);
    sessionIds.push(session.id);

    const result = await cartService.addItem(cart.id, variant.id, 10);
    expect(result.addedQuantity).toBe(5);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("cart add falls back to Website-local availability (not a hard failure) when ERP is unavailable", async () => {
    mockErpEnv();
    const erpVariantId = `erp-v-${randomUUID()}`;
    const { category, variant } = await createTestVariant({ quantity: 5, erpVariantId });
    categoryIds.push(category.id);
    stubErpUnavailable();

    const { cartService } = await import("@/modules/cart");
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);

    const result = await cartService.addItem(cart.id, variant.id, 10);
    expect(result.addedQuantity).toBe(5); // degraded to the Website-local number, not blocked, not "unlimited"
  });

  it("checkout confirmation rejects with InsufficientInventoryError when ERP reports less than requested, even though Website-local stock is sufficient", async () => {
    mockErpEnv();
    const erpVariantId = `erp-v-${randomUUID()}`;
    const { category, variant } = await createTestVariant({ quantity: 100, erpVariantId, priceEgp: 100 });
    categoryIds.push(category.id);
    const zone = await createTestShippingZone({ feeEgp: 60 });
    shippingZoneIds.push(zone.id);

    // At add-to-cart time ERP still had plenty...
    stubErpAvailability({ [variant.sku]: 50 });
    const { cartService } = await import("@/modules/cart");
    const { checkoutService, CheckoutValidationError: _unused } = await import("@/modules/checkout");
    void _unused;
    const { InsufficientInventoryError } = await import("@/modules/catalog");
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);
    await cartService.addItem(cart.id, variant.id, 5);

    const checkoutSession = await checkoutService.startCheckout(cart.id, null, "+201001234567");
    await checkoutService.setAddress(checkoutSession.id, {
      recipientName: "عميل الاختبار",
      phoneE164: "+201001234567",
      governorate: zone.governorate,
      city: "القاهرة",
      street: "شارع الاختبار",
    });
    await checkoutService.getShippingRates(checkoutSession.id);

    // ...but by the time the customer confirms, ERP stock dropped below the cart quantity.
    stubErpAvailability({ [variant.sku]: 2 });

    await expect(
      checkoutService.confirmAndPlaceOrder(checkoutSession.id, { method: "COD", idempotencyKey: `test-${randomUUID()}` })
    ).rejects.toBeInstanceOf(InsufficientInventoryError);

    const { db } = await import("@/lib/db");
    const orders = await db.order.findMany({ where: { checkoutSessionId: checkoutSession.id } });
    expect(orders).toHaveLength(0); // no order, no reservation left behind
    const reservations = await db.inventoryReservation.findMany({ where: { checkoutSessionId: checkoutSession.id } });
    expect(reservations.filter((r) => r.status === "ACTIVE")).toHaveLength(0);
  });

  it("checkout confirmation fails closed (CheckoutValidationError: availability_check_unavailable) when ERP cannot be reached, rather than committing on stale data", async () => {
    mockErpEnv();
    const erpVariantId = `erp-v-${randomUUID()}`;
    const { category, variant } = await createTestVariant({ quantity: 100, erpVariantId, priceEgp: 100 });
    categoryIds.push(category.id);
    const zone = await createTestShippingZone({ feeEgp: 60 });
    shippingZoneIds.push(zone.id);

    stubErpAvailability({ [variant.sku]: 50 });
    const { cartService } = await import("@/modules/cart");
    const { checkoutService, CheckoutValidationError } = await import("@/modules/checkout");
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);
    await cartService.addItem(cart.id, variant.id, 2);

    const checkoutSession = await checkoutService.startCheckout(cart.id, null, "+201001234567");
    await checkoutService.setAddress(checkoutSession.id, {
      recipientName: "عميل الاختبار",
      phoneE164: "+201001234567",
      governorate: zone.governorate,
      city: "القاهرة",
      street: "شارع الاختبار",
    });
    await checkoutService.getShippingRates(checkoutSession.id);

    stubErpUnavailable();

    await expect(
      checkoutService.confirmAndPlaceOrder(checkoutSession.id, { method: "COD", idempotencyKey: `test-${randomUUID()}` })
    ).rejects.toBeInstanceOf(CheckoutValidationError);

    const { db } = await import("@/lib/db");
    const orders = await db.order.findMany({ where: { checkoutSessionId: checkoutSession.id } });
    expect(orders).toHaveLength(0);
  });

  it("checkout confirmation succeeds normally when ERP confirms sufficient stock (no regression)", async () => {
    mockErpEnv();
    const erpVariantId = `erp-v-${randomUUID()}`;
    const { category, variant } = await createTestVariant({ quantity: 20, erpVariantId, priceEgp: 100 });
    categoryIds.push(category.id);
    const zone = await createTestShippingZone({ feeEgp: 60 });
    shippingZoneIds.push(zone.id);
    stubErpAvailability({ [variant.sku]: 20 });

    const { cartService } = await import("@/modules/cart");
    const { checkoutService } = await import("@/modules/checkout");
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);
    await cartService.addItem(cart.id, variant.id, 2);

    const checkoutSession = await checkoutService.startCheckout(cart.id, null, "+201001234567");
    await checkoutService.setAddress(checkoutSession.id, {
      recipientName: "عميل الاختبار",
      phoneE164: "+201001234567",
      governorate: zone.governorate,
      city: "القاهرة",
      street: "شارع الاختبار",
    });
    await checkoutService.getShippingRates(checkoutSession.id);

    const order = await checkoutService.confirmAndPlaceOrder(checkoutSession.id, {
      method: "COD",
      idempotencyKey: `test-${randomUUID()}`,
    });
    expect(order.orderNumber).toMatch(/^JAK-\d{6}$/);
  });
});

describe("ERP inventory checkout — sandbox database availability", () => {
  it("documents whether the above suite actually ran", () => {
    if (!dbAvailable) {
      console.warn("erp-inventory-checkout.test.ts: SKIPPED — no local Postgres reachable in this sandbox.");
    }
    expect(true).toBe(true);
  });
});
