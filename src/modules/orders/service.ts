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

/** Public interface — module-boundaries.md's Orders row (createOrder lives in Checkout; this covers getOrder/getOrderStatus/trackOrder). */
export const ordersService = {
  /** `requestingCustomerId: null` means a guest session — authorized only if the order itself has no customerId (a guest order), per the same ownership rule. */
  async getOrderForCustomer(orderId: string, requestingCustomerId: string | null) {
    const order = await ordersRepository.findById(orderId);
    if (!order) throw new OrderNotFoundError();
    if (order.customerId !== requestingCustomerId) throw new OrderAuthorizationError();

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
  async cancelOrder(orderId: string, requestingCustomerId: string | null, reason: string) {
    const order = await ordersRepository.findById(orderId);
    if (!order) throw new OrderNotFoundError();
    if (order.customerId !== requestingCustomerId) throw new OrderAuthorizationError();

    if (order.erpPushStatus === "SUCCEEDED") {
      // Throws ErpOrderRejectedError if ERP's own rules block it (e.g.
      // payment already allocated, already out for delivery) — that
      // propagates to the caller unmodified; the Website order is NOT
      // cancelled locally in that case.
      await erpOrderAdapter.cancelOrder(orderId, reason);
    }

    return ordersRepository.cancel(orderId, reason);
  },
};
