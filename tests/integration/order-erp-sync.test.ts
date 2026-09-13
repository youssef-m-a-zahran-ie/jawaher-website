import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

import { isDatabaseAvailable } from "./helpers/db-availability";
import { createTestSessionAndCart, createTestShippingZone, createTestVariant, cleanupTestData } from "./helpers/fixtures";

/**
 * Phase 9.6 — Website -> ERP order push, status pull-back, and
 * cancellation propagation. Combines this repo's two established
 * integration-test conventions: real Prisma + skipIf(!dbAvailable), and
 * a mocked ERP HTTP layer via `@/lib/env` + global fetch.
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

function stubErpFetch(handler: (path: string, method: string, body: unknown) => { status: number; body: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      const { status, body: responseBody } = handler(u.pathname, init?.method ?? "GET", body);
      return new Response(JSON.stringify(responseBody), { status });
    })
  );
}

/** Same helper as erp-inventory-checkout.test.ts's own — a bare 500 with no parseable body, simulating ERP being reachable-but-erroring. */
function stubErpUnavailable() {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
}

async function setUpConfirmedOrder(erpVariantId: string | undefined, quantity = 5, priceEgp = 100) {
  const { category, variant } = await createTestVariant({ quantity, priceEgp, erpVariantId });
  const zone = await createTestShippingZone({ feeEgp: 60 });
  const { cartService } = await import("@/modules/cart");
  const { checkoutService } = await import("@/modules/checkout");
  const { session, cart } = await createTestSessionAndCart();
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
  const order = await checkoutService.confirmAndPlaceOrder(checkoutSession.id, requester, { method: "COD", idempotencyKey: `test-${randomUUID()}` });

  return { category, variant, session, zone, order };
}

describe.skipIf(!dbAvailable)("Website -> ERP order push (Phase 9.6)", () => {
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

  it("pushes a confirmed order to ERP and records erpOrderReference/erpPushStatus=SUCCEEDED", async () => {
    mockErpEnv();
    const erpVariantId = `erp-v-${randomUUID()}`;
    stubErpFetch(() => ({ status: 200, body: { erpOrderReference: "erp-order-1", primaryStatus: "pending_validation", deduplicated: false, requestId: "rid" } }));

    const { category, session, order } = await setUpConfirmedOrder(erpVariantId);
    categoryIds.push(category.id);
    sessionIds.push(session.id);

    const { pushOrderToErp } = await import("@/modules/orders");
    await pushOrderToErp(order.orderId);

    const { db } = await import("@/lib/db");
    const row = await db.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(row.erpPushStatus).toBe("SUCCEEDED");
    expect(row.erpOrderReference).toBe("erp-order-1");
    expect(row.pushedToErpAt).not.toBeNull();
  });

  it("sends the order as an immutable snapshot: real erpVariantId, quantity, and a decimal-string price — never the current catalog price", async () => {
    mockErpEnv();
    const erpVariantId = `erp-v-${randomUUID()}`;
    let capturedBody: unknown;
    stubErpFetch((_path, _method, body) => {
      capturedBody = body;
      return { status: 200, body: { erpOrderReference: "erp-order-1", primaryStatus: "pending_validation", deduplicated: false } };
    });

    const { category, session, order } = await setUpConfirmedOrder(erpVariantId, 5, 100);
    categoryIds.push(category.id);
    sessionIds.push(session.id);

    const { pushOrderToErp } = await import("@/modules/orders");
    await pushOrderToErp(order.orderId);

    expect(capturedBody).toMatchObject({
      websiteOrderId: order.orderId,
      lines: [{ erpVariantId, quantity: 2, unitPrice: "100.00" }],
    });
  });

  it("IDEMPOTENCY: calling pushOrderToErp again after a SUCCEEDED push is a no-op (does not call ERP again)", async () => {
    mockErpEnv();
    const erpVariantId = `erp-v-${randomUUID()}`;
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ erpOrderReference: "erp-order-1", primaryStatus: "pending_validation", deduplicated: false }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const { category, session, order } = await setUpConfirmedOrder(erpVariantId);
    categoryIds.push(category.id);
    sessionIds.push(session.id);

    const { pushOrderToErp } = await import("@/modules/orders");
    await pushOrderToErp(order.orderId);
    const callCountAfterFirst = fetchSpy.mock.calls.length;
    await pushOrderToErp(order.orderId);

    expect(fetchSpy.mock.calls.length).toBe(callCountAfterFirst); // no second call
  });

  it("marks erpPushStatus=FAILED (and does not throw) when ERP rejects the order", async () => {
    mockErpEnv();
    const erpVariantId = `erp-v-${randomUUID()}`;
    stubErpFetch(() => ({ status: 422, body: { error: { code: "business_rule_violation", message: "No active warehouse exists for this company." } } }));

    const { category, session, order } = await setUpConfirmedOrder(erpVariantId);
    categoryIds.push(category.id);
    sessionIds.push(session.id);

    const { pushOrderToErp } = await import("@/modules/orders");
    await expect(pushOrderToErp(order.orderId)).resolves.toBeUndefined(); // never throws

    const { db } = await import("@/lib/db");
    const row = await db.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(row.erpPushStatus).toBe("FAILED");
    expect(row.erpOrderReference).toBeNull();

    const auditRows = await db.auditLog.findMany({ where: { entityType: "Order", entityId: order.orderId, action: "erp_push_failed" } });
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
  });

  it("marks erpPushStatus=FAILED when ERP is unavailable — the Website order itself remains CONFIRMED and unaffected", async () => {
    mockErpEnv();
    const erpVariantId = `erp-v-${randomUUID()}`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));

    const { category, session, order } = await setUpConfirmedOrder(erpVariantId);
    categoryIds.push(category.id);
    sessionIds.push(session.id);

    const { pushOrderToErp } = await import("@/modules/orders");
    await pushOrderToErp(order.orderId);

    const { db } = await import("@/lib/db");
    const row = await db.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(row.erpPushStatus).toBe("FAILED");
    expect(row.status).toBe("CONFIRMED"); // the customer's order is untouched — a real, valid, already-committed order
  });

  it("marks erpPushStatus=FAILED when the ordered variant was never synced from ERP (no erpVariantId)", async () => {
    mockErpEnv();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { category, session, order } = await setUpConfirmedOrder(undefined); // no erpVariantId
    categoryIds.push(category.id);
    sessionIds.push(session.id);

    const { pushOrderToErp } = await import("@/modules/orders");
    await pushOrderToErp(order.orderId);

    expect(fetchSpy).not.toHaveBeenCalled(); // never even attempted the call with incomplete data

    const { db } = await import("@/lib/db");
    const row = await db.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(row.erpPushStatus).toBe("FAILED");
  });

  it("STATUS PULL-BACK: customerFacingStatus reflects ERP's real fulfillment stage once pushed", async () => {
    mockErpEnv();
    const erpVariantId = `erp-v-${randomUUID()}`;
    stubErpFetch((path) => {
      if (path.endsWith("/orders")) return { status: 200, body: { erpOrderReference: "erp-order-1", primaryStatus: "pending_validation", deduplicated: false } };
      return { status: 200, body: { primaryStatus: "out_for_delivery", subStatus: null, paymentStatus: "unpaid", cancelledAt: null } };
    });

    const { category, session, order } = await setUpConfirmedOrder(erpVariantId);
    categoryIds.push(category.id);
    sessionIds.push(session.id);

    const { pushOrderToErp } = await import("@/modules/orders");
    await pushOrderToErp(order.orderId);

    const { ordersService } = await import("@/modules/orders");
    const view = await ordersService.getOrderForCustomer(order.orderId, { sessionId: session.id, customerId: null });
    expect(view.customerFacingStatus).toBe("out_for_delivery");
  });

  it("STATUS PULL-BACK: falls back to 'confirmed' (Website-local) when ERP cannot be reached, never throwing to the customer", async () => {
    mockErpEnv();
    const erpVariantId = `erp-v-${randomUUID()}`;
    stubErpFetch((path) => {
      if (path.endsWith("/orders")) return { status: 200, body: { erpOrderReference: "erp-order-1", primaryStatus: "pending_validation", deduplicated: false } };
      return { status: 500, body: {} };
    });

    const { category, session, order } = await setUpConfirmedOrder(erpVariantId);
    categoryIds.push(category.id);
    sessionIds.push(session.id);

    const { pushOrderToErp } = await import("@/modules/orders");
    await pushOrderToErp(order.orderId);

    const { ordersService } = await import("@/modules/orders");
    const view = await ordersService.getOrderForCustomer(order.orderId, { sessionId: session.id, customerId: null });
    expect(view.customerFacingStatus).toBe("confirmed");
  });

  it("CANCELLATION: propagates to ERP and succeeds when ERP allows it", async () => {
    mockErpEnv();
    const erpVariantId = `erp-v-${randomUUID()}`;
    stubErpFetch((path) => {
      if (path.endsWith("/orders")) return { status: 200, body: { erpOrderReference: "erp-order-1", primaryStatus: "pending_validation", deduplicated: false } };
      if (path.endsWith("/cancel")) return { status: 200, body: { primaryStatus: "cancelled", subStatus: null, paymentStatus: "unpaid", cancelledAt: "2026-01-01T00:00:00.000Z" } };
      return { status: 404, body: {} };
    });

    const { category, session, order } = await setUpConfirmedOrder(erpVariantId);
    categoryIds.push(category.id);
    sessionIds.push(session.id);

    const { pushOrderToErp } = await import("@/modules/orders");
    await pushOrderToErp(order.orderId);

    const { ordersService } = await import("@/modules/orders");
    const cancelled = await ordersService.cancelOrder(order.orderId, { sessionId: session.id, customerId: null }, "customer_requested");
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("CANCELLATION: blocked (ErpOrderRejectedError) and the Website order is NOT cancelled locally when ERP rejects it", async () => {
    mockErpEnv();
    const erpVariantId = `erp-v-${randomUUID()}`;
    stubErpFetch((path) => {
      if (path.endsWith("/orders")) return { status: 200, body: { erpOrderReference: "erp-order-1", primaryStatus: "pending_validation", deduplicated: false } };
      if (path.endsWith("/cancel")) return { status: 422, body: { error: { code: "business_rule_violation", message: "Cannot cancel — payment has already been allocated." } } };
      return { status: 404, body: {} };
    });

    const { category, session, order } = await setUpConfirmedOrder(erpVariantId);
    categoryIds.push(category.id);
    sessionIds.push(session.id);

    const { pushOrderToErp } = await import("@/modules/orders");
    await pushOrderToErp(order.orderId);

    const { ordersService } = await import("@/modules/orders");
    const { ErpOrderRejectedError } = await import("@/modules/erp-integration");
    await expect(
      ordersService.cancelOrder(order.orderId, { sessionId: session.id, customerId: null }, "customer_requested"),
    ).rejects.toBeInstanceOf(ErpOrderRejectedError);

    const { db } = await import("@/lib/db");
    const row = await db.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(row.status).toBe("CONFIRMED"); // NOT cancelled locally
  });

  it("CANCELLATION: an order never pushed to ERP cancels locally without attempting any ERP call", async () => {
    mockErpEnv();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { category, session, order } = await setUpConfirmedOrder(undefined); // no erpVariantId -> push will fail/never succeed
    categoryIds.push(category.id);
    sessionIds.push(session.id);

    const { ordersService } = await import("@/modules/orders");
    const cancelled = await ordersService.cancelOrder(order.orderId, { sessionId: session.id, customerId: null }, "customer_requested");
    expect(cancelled.status).toBe("CANCELLED");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  /**
   * Phase 12 — `retryFailedErpPushes` is the previously-missing sweep:
   * `pushOrderToErp` was always documented as safe to call from one, but
   * nothing ever did. These pin the two behaviors that matter most: a
   * transiently-failed push actually recovers once ERP is reachable
   * again, and a locally-cancelled order is never resurrected and pushed
   * as if it were still active.
   */
  it("RETRY SWEEP: a FAILED push recovers once ERP becomes reachable, and is excluded once SUCCEEDED", async () => {
    mockErpEnv();
    const erpVariantId = `erp-v-${randomUUID()}`;
    stubErpUnavailable();

    const { category, session, order } = await setUpConfirmedOrder(erpVariantId);
    categoryIds.push(category.id);
    sessionIds.push(session.id);

    const { pushOrderToErp, retryFailedErpPushes } = await import("@/modules/orders");
    await pushOrderToErp(order.orderId);
    const { db } = await import("@/lib/db");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.orderId } })).erpPushStatus).toBe("FAILED");

    stubErpFetch((path) => {
      if (path.endsWith("/orders")) return { status: 200, body: { erpOrderReference: "erp-order-recovered", primaryStatus: "pending_validation", deduplicated: false } };
      return { status: 404, body: {} };
    });

    const firstSweep = await retryFailedErpPushes();
    expect(firstSweep).toEqual({ attempted: 1, succeeded: 1, stillFailed: 0 });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.orderId } })).erpPushStatus).toBe("SUCCEEDED");

    const secondSweep = await retryFailedErpPushes();
    expect(secondSweep).toEqual({ attempted: 0, succeeded: 0, stillFailed: 0 }); // already SUCCEEDED — not picked up again
  });

  it("RETRY SWEEP: never pushes an order the customer already cancelled locally", async () => {
    mockErpEnv();
    stubErpUnavailable();

    const { category, session, order } = await setUpConfirmedOrder(`erp-v-${randomUUID()}`);
    categoryIds.push(category.id);
    sessionIds.push(session.id);

    const { pushOrderToErp, retryFailedErpPushes, ordersService } = await import("@/modules/orders");
    await pushOrderToErp(order.orderId); // fails, erpPushStatus stays FAILED
    await ordersService.cancelOrder(order.orderId, { sessionId: session.id, customerId: null }, "customer_requested");

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const sweep = await retryFailedErpPushes();
    expect(sweep).toEqual({ attempted: 0, succeeded: 0, stillFailed: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("order-erp-sync — sandbox database availability", () => {
  it("documents whether the above suite actually ran", () => {
    if (!dbAvailable) {
      console.warn("order-erp-sync.test.ts: SKIPPED — no local Postgres reachable in this sandbox.");
    }
    expect(true).toBe(true);
  });
});
