import { ordersRepository } from "@/modules/orders/repository";
import { logger } from "@/lib/logger";
import { erpOrderAdapter } from "@/modules/erp-integration";

export class OrderNotFoundError extends Error {
  constructor() {
    super("Order not found");
    this.name = "OrderNotFoundError";
  }
}

export class OrderAuthorizationError extends Error {
  constructor() {
    super("Not authorized to view this order");
    this.name = "OrderAuthorizationError";
  }
}

export class OrderAlreadyCancelledError extends Error {
  constructor() {
    super("Order is already cancelled");
    this.name = "OrderAlreadyCancelledError";
  }
}

/**
 * ERP's real `primaryStatus` values (verified directly against
 * sales-order.service.ts this phase — see
 * docs/integration/order-erp-integration-audit.md §7) collapsed onto a
 * small, stable customer-facing set — never the raw ERP code. `qc`/
 * `failed_delivery` are dead values (no service function ever
 * transitions into them) but are defensively mapped rather than left to
 * throw, in case that ever changes.
 */
/** Exported for direct unit testing of the mapping table (Phase 9.6) — not part of the module's public service surface (`ordersService` is). */
export function mapErpStatusToFulfillmentStage(erpPrimaryStatus: string): string {
  switch (erpPrimaryStatus) {
    case "pending_validation":
    case "confirmed":
    case "picking":
    case "packing":
    case "ready_for_delivery":
      return "being_prepared";
    case "out_for_delivery":
      return "out_for_delivery";
    case "delivered":
      return "delivered";
    case "returned":
      return "returned";
    case "cancelled":
    case "rejected":
      return "cancelled";
    default:
      return "being_prepared";
  }
}

/**
 * Three INDEPENDENT dimensions, never conflated into one overloaded
 * field (Phase 9.6 §13): the Website's own `Order.status`
 * (CONFIRMED/CANCELLED), `Payment.status` (refund tracking), and ERP's
 * real fulfillment stage (pulled live — see `getErpFulfillmentStage`).
 * A payment-state change can never accidentally read as "shipped", and a
 * warehouse transition can never accidentally read as "paid" — each
 * check below looks at exactly one dimension's own field.
 */
/** Exported for direct unit testing (Phase 9.6) — not part of the module's public service surface. */
export function deriveCustomerFacingStatus(
  order: { status: string },
  latestPaymentStatus: string | undefined,
  erpFulfillmentStage: string | null,
): string {
  if (order.status === "CANCELLED") return "cancelled";
  if (latestPaymentStatus === "REFUND_COMPLETED") return "refunded";
  if (latestPaymentStatus === "REFUND_INITIATED") return "refund_in_progress";
  if (erpFulfillmentStage === "cancelled") return "cancelled"; // ERP-side cancellation the Website hasn't locally reconciled yet — still an honest signal, not hidden
  if (erpFulfillmentStage) return erpFulfillmentStage;
  return "confirmed"; // unchanged default — no ERP status available yet (not pushed, or ERP unreachable)
}

/**
 * Live, on-demand ERP status pull-back (Phase 9.6) — mirrors the PDP's
 * own live ERP inventory overlay pattern (Phase 9.5R): a single-order
 * view is a bounded, safe place for one live call; a LIST of orders
 * (`listForCustomer`) deliberately does NOT do this per-row (see that
 * function's own comment) to avoid an N-calls-per-page-view risk.
 * Never surfaces an ERP failure to the customer — the Website's own
 * `Order.status`/payment state remain fully valid and displayed either
 * way; this only adds a richer fulfillment-stage signal when available.
 */
async function getErpFulfillmentStage(order: { id: string; erpPushStatus: string }): Promise<string | null> {
  if (order.erpPushStatus === "NOT_PUSHED") return null; // definitely no ERP order yet — skip the guaranteed-404 round trip
  try {
    const status = await erpOrderAdapter.getOrderStatus(order.id);
    return status ? mapErpStatusToFulfillmentStage(status.primaryStatus) : null;
  } catch (err) {
    logger.warn({ orderId: order.id, err }, "order-erp-sync: status pull-back failed — showing Website-local status only");
    return null;
  }
}

/**
 * Phase 9.7 security fix — `order.customerId !== requestingCustomerId` alone
 * is correct for a logged-in customer, but for a GUEST order `order.customerId`
 * is always `null`, and an unauthenticated requester's `customerId` is also
 * always `null` — so that comparison was `null !== null` (false), meaning
 * it silently authorized EVERY guest requester for EVERY guest order,
 * regardless of who actually placed it. A real, already-shipped IDOR: any
 * visitor who learned an order's internal UUID (not guessable, but nothing
 * else was checked) could read another customer's full name/phone/address
 * via `GET /api/v1/orders/[id]`. For a guest order, ownership is now the
 * same originating-session check used for CheckoutSession (Phase 9.7,
 * `assertCheckoutSessionOwnership` in checkout/service.ts) and for Cart
 * elsewhere — never distinguishing "doesn't exist" from "not yours" to the
 * caller, same as that fix.
 */
async function assertOrderOwnership(
  order: { customerId: string | null },
  orderId: string,
  requester: { sessionId: string; customerId: string | null },
): Promise<void> {
  if (order.customerId !== null) {
    if (order.customerId !== requester.customerId) throw new OrderAuthorizationError();
    return;
  }
  const owningSessionId = await ordersRepository.findOwningSessionId(orderId);
  if (owningSessionId !== requester.sessionId) throw new OrderAuthorizationError();
}

/** Public interface — module-boundaries.md's Orders row (createOrder lives in Checkout; this covers getOrder/getOrderStatus/trackOrder). */
export const ordersService = {
  async getOrderForCustomer(orderId: string, requester: { sessionId: string; customerId: string | null }) {
    const order = await ordersRepository.findById(orderId);
    if (!order) throw new OrderNotFoundError();
    await assertOrderOwnership(order, orderId, requester);

    const erpFulfillmentStage = await getErpFulfillmentStage(order);
    return { ...order, customerFacingStatus: deriveCustomerFacingStatus(order, order.payments[0]?.status, erpFulfillmentStage) };
  },

  /** The public tracking endpoint — order number + phone required together (commerce-completeness-audit.md §19). */
  async trackOrder(orderNumber: string, phoneE164: string) {
    const order = await ordersRepository.findByNumberAndPhone(orderNumber, phoneE164);
    if (!order) throw new OrderNotFoundError();

    const erpFulfillmentStage = await getErpFulfillmentStage(order);
    return { ...order, customerFacingStatus: deriveCustomerFacingStatus(order, order.payments[0]?.status, erpFulfillmentStage) };
  },

  /** List view — deliberately Website-local-only (no live ERP call per row); see getErpFulfillmentStage's own comment on why. */
  async listForCustomer(customerId: string) {
    const orders = await ordersRepository.listForCustomer(customerId);
    return orders.map((order) => ({
      ...order,
      customerFacingStatus: deriveCustomerFacingStatus(order, order.payments[0]?.status, null),
    }));
  },

  /**
   * Cancellation now propagates to ERP FIRST when the order was already
   * pushed (Phase 9.6) — never silently marks the Website order
   * cancelled while ERP still has it active. If ERP blocks the
   * cancellation (payment already allocated, or already dispatched —
   * `ErpOrderRejectedError`), that is surfaced as a real error rather
   * than a false local success. If the order was never pushed
   * (`NOT_PUSHED`/`FAILED`), or ERP has no record of it at all, only the
   * Website-local cancellation applies — nothing to reconcile.
   */
  async cancelOrder(orderId: string, requester: { sessionId: string; customerId: string | null }, reason: string) {
    const order = await ordersRepository.findById(orderId);
    if (!order) throw new OrderNotFoundError();
    await assertOrderOwnership(order, orderId, requester);

    if (order.status === "CANCELLED") throw new OrderAlreadyCancelledError();

    if (order.erpPushStatus === "SUCCEEDED") {
      // Throws ErpOrderRejectedError if ERP's own rules block it (e.g.
      // payment already allocated, already out for delivery) — that
      // propagates to the caller unmodified; the Website order is NOT
      // cancelled locally in that case.
      await erpOrderAdapter.cancelOrder(orderId, reason);
    }

    return ordersRepository.cancel(orderId, reason);
  },

  /**
   * Phase 9.7 — the guest-facing cancellation path, reachable from /track.
   * Deliberately mirrors `trackOrder`'s own authorization model (order
   * number + phone together, never session/customerId) rather than
   * `cancelOrder`'s — a guest tracking/cancelling from a different device
   * than the one that placed the order is the exact case `trackOrder`
   * already exists to support; requiring session ownership here would
   * silently break that. Same anti-enumeration/rate-limit posture as
   * `trackOrder` is enforced by its caller (the API route), not here.
   */
  async cancelTrackedOrder(orderNumber: string, phoneE164: string, reason: string) {
    const order = await ordersRepository.findByNumberAndPhone(orderNumber, phoneE164);
    if (!order) throw new OrderNotFoundError();
    if (order.status === "CANCELLED") throw new OrderAlreadyCancelledError();

    if (order.erpPushStatus === "SUCCEEDED") {
      await erpOrderAdapter.cancelOrder(order.id, reason);
    }

    return ordersRepository.cancel(order.id, reason);
  },
};
