import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

import { isDatabaseAvailable } from "./helpers/db-availability";
import { createTestSessionAndCart, createTestShippingZone, createTestVariant, cleanupTestData } from "./helpers/fixtures";

/**
 * Phase 9.5, corrected in Phase 9.5R — ERP-authoritative inventory at
 * the two points this phase changed: cart quantity handling and
 * checkout confirmation. ERP IS THE ONLY INVENTORY AUTHORITY (audit
 * §1) — these tests specifically prove there is no `min()`/blending
 * with the Website-local `inventoryQuantity` anywhere. Combines this
 * repo's two established integration-test conventions: real Prisma +
 * skipIf(!dbAvailable) (catalog-storefront.test.ts) and a mocked ERP
 * HTTP layer via `@/lib/env` + global fetch (catalog-sync.test.ts).
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

function stubErpAvailability(byErpVariantId: Record<string, number>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const { variantIds } = JSON.parse(String(init?.body)) as { variantIds: string[] };
      const items = variantIds.filter((id) => id in byErpVariantId).map((variantId) => ({ variantId, available: byErpVariantId[variantId] }));
      const notFoundVariantIds = variantIds.filter((id) => !(id in byErpVariantId));
      return new Response(JSON.stringify({ items, notFoundVariantIds, requestId: "rid" }), { status: 200 });
    })
  );
}

function stubErpUnavailable() {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
}

describe.skipIf(!dbAvailable)("ERP-authoritative inventory at cart/checkout (Phase 9.5R)", () => {
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

  it("ERP says 50, Website-local says 0 -> authoritative availability is 50 (ERP wins outright, never min())", async () => {
    mockErpEnv();
    const erpVariantId = `erp-v-${randomUUID()}`;
    const { category, variant } = await createTestVariant({ quantity: 0, erpVariantId });
    categoryIds.push(category.id);
    stubErpAvailability({ [erpVariantId]: 50 });

    const { cartService } = await import("@/modules/cart");
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);

    const result = await cartService.addItem(cart.id, variant.id, 10);
    expect(result.addedQuantity).toBe(10); // fully honored — ERP's 50 is authoritative, local's 0 is irrelevant
    expect(result.clamped).toBe(false);
  });

  it("ERP says 0, Website-local says 100 -> authoritative availability is 0 (ERP wins outright, never min())", async () => {
    mockErpEnv();
    const erpVariantId = `erp-v-${randomUUID()}`;
    const { category, variant } = await createTestVariant({ quantity: 100, erpVariantId });
    categoryIds.push(category.id);
    stubErpAvailability({ [erpVariantId]: 0 });

    const { cartService, CartItemUnavailableError } = await import("@/modules/cart");
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);

    await expect(cartService.addItem(cart.id, variant.id, 10)).rejects.toBeInstanceOf(CartItemUnavailableError);
  });

  it("cart add uses ERP's lower number outright when it is the binding constraint", async () => {
    mockErpEnv();
    const erpVariantId = `erp-v-${randomUUID()}`;
    const { category, variant } = await createTestVariant({ quantity: 100, erpVariantId });
    categoryIds.push(category.id);
    stubErpAvailability({ [erpVariantId]: 3 });

    const { cartService } = await import("@/modules/cart");
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);

    const result = await cartService.addItem(cart.id, variant.id, 10);
    expect(result.addedQuantity).toBe(3);
    expect(result.clamped).toBe(true);
  });

  it("cart add falls back to Website-local availability when the variant has no erpVariantId at all (no ERP claim exists to honor or override)", async () => {
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

  it("cart add preserves the customer's full requested quantity (never clamped against local data) when ERP cannot be reached — availability is 'unknown', not a fabricated 'in stock'", async () => {
    mockErpEnv();
    const erpVariantId = `erp-v-${randomUUID()}`;
    const { category, variant } = await createTestVariant({ quantity: 5, erpVariantId });
    categoryIds.push(category.id);
    stubErpUnavailable();

    const { cartService } = await import("@/modules/cart");
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);

    const result = await cartService.addItem(cart.id, variant.id, 10);
    expect(result.addedQuantity).toBe(10); // NOT clamped to the local "5" — that would be presenting stale data as verified
    expect(result.clamped).toBe(false);

    const { db } = await import("@/lib/db");
    const item = await db.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } } });
    expect(item?.quantity).toBe(10);
  });

  it("checkout confirmation rejects with InsufficientInventoryError when ERP reports less than requested, even though Website-local stock is sufficient", async () => {
    mockErpEnv();
    const erpVariantId = `erp-v-${randomUUID()}`;
    const { category, variant } = await createTestVariant({ quantity: 100, erpVariantId, priceEgp: 100 });
    categoryIds.push(category.id);
    const zone = await createTestShippingZone({ feeEgp: 60 });
    shippingZoneIds.push(zone.id);

    // At add-to-cart time ERP still had plenty...
    stubErpAvailability({ [erpVariantId]: 50 });
    const { cartService } = await import("@/modules/cart");
    const { checkoutService } = await import("@/modules/checkout");
    const { InsufficientInventoryError } = await import("@/modules/catalog");
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);
    await cartService.addItem(cart.id, variant.id, 5);

    const requester = { sessionId: session.id, customerId: null };
    const checkoutSession = await checkoutService.startCheckout(cart.id, null, "+201001234567");
    await checkoutService.setAddress(checkoutSession.id, requester, {
      recipientName: "عميل الاختبار",
      phoneE164: "+201001234567",
      governorate: zone.governorate,
      city: "القاهرة",
      street: "شارع الاختبار",
    });
    await checkoutService.getShippingRates(checkoutSession.id, requester);

    // ...but by the time the customer confirms, ERP stock dropped below the cart quantity.
    stubErpAvailability({ [erpVariantId]: 2 });

    await expect(
      checkoutService.confirmAndPlaceOrder(checkoutSession.id, requester, { method: "COD", idempotencyKey: `test-${randomUUID()}` })
    ).rejects.toBeInstanceOf(InsufficientInventoryError);

    const { db } = await import("@/lib/db");
    const orders = await db.order.findMany({ where: { checkoutSessionId: checkoutSession.id } });
    expect(orders).toHaveLength(0); // no order, no reservation left behind
    const reservations = await db.inventoryReservation.findMany({ where: { checkoutSessionId: checkoutSession.id } });
    expect(reservations.filter((r) => r.status === "ACTIVE")).toHaveLength(0);
  });

  it("checkout confirmation fails closed (CheckoutValidationError: availability_check_unavailable) when ERP cannot be reached, rather than committing on stale data — does NOT eliminate the race, only narrows it", async () => {
    mockErpEnv();
    const erpVariantId = `erp-v-${randomUUID()}`;
    const { category, variant } = await createTestVariant({ quantity: 100, erpVariantId, priceEgp: 100 });
    categoryIds.push(category.id);
    const zone = await createTestShippingZone({ feeEgp: 60 });
    shippingZoneIds.push(zone.id);

    stubErpAvailability({ [erpVariantId]: 50 });
    const { cartService } = await import("@/modules/cart");
    const { checkoutService, CheckoutValidationError } = await import("@/modules/checkout");
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);
    await cartService.addItem(cart.id, variant.id, 2);

    const requester = { sessionId: session.id, customerId: null };
    const checkoutSession = await checkoutService.startCheckout(cart.id, null, "+201001234567");
    await checkoutService.setAddress(checkoutSession.id, requester, {
      recipientName: "عميل الاختبار",
      phoneE164: "+201001234567",
      governorate: zone.governorate,
      city: "القاهرة",
      street: "شارع الاختبار",
    });
    await checkoutService.getShippingRates(checkoutSession.id, requester);

    stubErpUnavailable();

    await expect(
      checkoutService.confirmAndPlaceOrder(checkoutSession.id, requester, { method: "COD", idempotencyKey: `test-${randomUUID()}` })
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
    stubErpAvailability({ [erpVariantId]: 20 });

    const { cartService } = await import("@/modules/cart");
    const { checkoutService } = await import("@/modules/checkout");
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);
    await cartService.addItem(cart.id, variant.id, 2);

    const requester = { sessionId: session.id, customerId: null };
    const checkoutSession = await checkoutService.startCheckout(cart.id, null, "+201001234567");
    await checkoutService.setAddress(checkoutSession.id, requester, {
      recipientName: "عميل الاختبار",
      phoneE164: "+201001234567",
      governorate: zone.governorate,
      city: "القاهرة",
      street: "شارع الاختبار",
    });
    await checkoutService.getShippingRates(checkoutSession.id, requester);

    const order = await checkoutService.confirmAndPlaceOrder(checkoutSession.id, requester, {
      method: "COD",
      idempotencyKey: `test-${randomUUID()}`,
    });
    expect(order.orderNumber).toMatch(/^JAK-\d{6}$/);
  });

  it("PDP (catalogService.getProduct) shows ERP-authoritative availability, overriding a misleadingly-high Website-local count", async () => {
    mockErpEnv();
    const erpVariantId = `erp-v-${randomUUID()}`;
    const { category, product, variant } = await createTestVariant({ quantity: 999, erpVariantId });
    categoryIds.push(category.id);
    stubErpAvailability({ [erpVariantId]: 0 });

    const { catalogService } = await import("@/modules/catalog");
    const { db } = await import("@/lib/db");
    const productRow = await db.product.findUniqueOrThrow({ where: { id: product.id } });

    const result = await catalogService.getProduct(productRow.slug);
    const line = result?.variants.find((v) => v.id === variant.id);
    expect(line?.availability).toBe("out_of_stock"); // ERP's 0, not the local 999
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
