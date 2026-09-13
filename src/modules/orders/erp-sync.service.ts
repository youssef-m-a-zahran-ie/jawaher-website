import { Money } from "@/domain/money";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { recordAuditEvent } from "@/lib/audit-log";
import { erpOrderAdapter, ErpOrderRejectedError, type PushOrderPayload } from "@/modules/erp-integration";

/**
 * ============================================================================
 * WEBSITE -> ERP ORDER PUSH — Phase 9.6
 * ============================================================================
 * Deliberately a SEPARATE step, called AFTER `checkoutService.confirmAndPlaceOrder()`'s
 * own transaction has already committed — never inside it. A cross-system
 * HTTP call must never happen while a Postgres transaction (and the row
 * locks/idempotency-key claim it holds) is open, the same lesson already
 * applied to the ERP availability pre-check (Phase 9.5).
 *
 * The Website's own commercial commitment (a real `Order` row, COD
 * payment recorded) is already complete and authoritative by the time
 * this runs — per the already-approved lifecycle
 * (docs/architecture/data-ownership.md: "created -> payment_pending ->
 * paid -> pushed_to_erp -> ..."), a brief or extended window where an
 * order is "paid" but not yet "pushed_to_erp" is an accepted, tracked,
 * retryable state — never a silently lost/hidden failure. See
 * docs/integration/order-erp-integration-audit.md §7/§15 for the full
 * failure-mode reasoning.
 *
 * Idempotent: `Order.id` is the correlation key ERP dedupes on
 * (blueprint.md §8). Calling this twice for the same order — a genuine
 * retry, or a caller that doesn't check `erpPushStatus` first — never
 * creates a second ERP order; ERP's own ChannelMapping-based dedup
 * guarantees that independently of anything this function does.
 * ============================================================================
 */

/** Builds the flat, human-readable address string ERP's SalesOrder model has a single field for — mirrors ERP's own `formatShopifyAddress()` shape, applied here to the Website's own already-frozen order-time snapshot fields (never the current, possibly-since-changed Customer/Address records). */
function formatShippingAddress(order: {
  shippingStreet: string;
  shippingBuilding: string | null;
  shippingFloor: string | null;
  shippingApartment: string | null;
  shippingArea: string | null;
  shippingCity: string;
  shippingGovernorate: string;
  shippingLandmark: string | null;
}): string {
  const parts = [
    order.shippingStreet,
    order.shippingBuilding,
    order.shippingFloor ? `الدور ${order.shippingFloor}` : null,
    order.shippingApartment ? `شقة ${order.shippingApartment}` : null,
    order.shippingArea,
    order.shippingCity,
    order.shippingGovernorate,
    order.shippingLandmark,
  ].filter((p): p is string => !!p && p.trim().length > 0);
  return parts.join("، ");
}

export class OrderMissingErpVariantIdError extends Error {
  constructor(public readonly variantIds: string[]) {
    super(`Order references variant(s) never synced from ERP (no erpVariantId): ${variantIds.join(", ")}`);
    this.name = "OrderMissingErpVariantIdError";
  }
}

async function buildPushPayload(orderId: string): Promise<PushOrderPayload> {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { include: { variant: true } }, payments: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  const missing = order.items.filter((item) => !item.variant?.erpVariantId).map((item) => item.skuSnapshot);
  if (missing.length > 0) {
    throw new OrderMissingErpVariantIdError(missing);
  }

  return {
    websiteOrderId: order.id,
    customer: { phoneE164: order.shippingPhoneE164, name: order.shippingRecipientName },
    lines: order.items.map((item) => ({
      erpVariantId: item.variant!.erpVariantId!,
      quantity: item.quantity,
      unitPrice: Money.fromMinor(item.unitPriceAmountMinor).toDecimalString(),
    })),
    contactPhone: order.shippingPhoneE164,
    shippingAddress: formatShippingAddress(order),
    paymentMethod: order.payments[0]?.method,
  };
}

/**
 * Idempotent no-op if this order was already pushed successfully — safe
 * to call on every retry/cron sweep without checking `erpPushStatus`
 * yourself first, though callers that already know the status should
 * still skip calling this when it's `SUCCEEDED`, to avoid the wasted
 * round trip.
 */
export async function pushOrderToErp(orderId: string): Promise<void> {
  const existing = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { erpPushStatus: true, erpOrderReference: true } });
  if (existing.erpPushStatus === "SUCCEEDED" && existing.erpOrderReference) {
    return;
  }

  await db.order.update({ where: { id: orderId }, data: { erpPushStatus: "PENDING" } });

  try {
    const payload = await buildPushPayload(orderId);
    const result = await erpOrderAdapter.pushOrder(payload);

    await db.order.update({
      where: { id: orderId },
      data: { erpPushStatus: "SUCCEEDED", erpOrderReference: result.erpOrderReference, pushedToErpAt: new Date() },
    });
    await recordAuditEvent(db, {
      entityType: "Order",
      entityId: orderId,
      action: "erp_push_succeeded",
      actorType: "system",
      metadata: { erpOrderReference: result.erpOrderReference, deduplicated: result.deduplicated, requestId: result.requestId },
    });
    logger.info({ orderId, erpOrderReference: result.erpOrderReference, deduplicated: result.deduplicated }, "order-erp-sync: push succeeded");
  } catch (err) {
    const errorSummary = err instanceof Error ? err.name : "UnknownError";
    const errorMessage = err instanceof ErpOrderRejectedError ? err.erpMessage : err instanceof Error ? err.message : String(err);

    await db.order.update({ where: { id: orderId }, data: { erpPushStatus: "FAILED" } });
    await recordAuditEvent(db, {
      entityType: "Order",
      entityId: orderId,
      action: "erp_push_failed",
      actorType: "system",
      metadata: { errorSummary, errorMessage },
    });
    logger.error({ orderId, err, errorSummary }, "order-erp-sync: push failed — order remains valid Website-side, retryable");
    // Deliberately NOT rethrown to a caller that doesn't want the
    // customer-facing checkout flow to fail because of this — see
    // callers' own comments for why. A caller that needs to know the
    // outcome should re-read `Order.erpPushStatus` after calling this.
  }
}

/**
 * Phase 12 — this function's sibling `pushOrderToErp` above was always
 * documented as "safe to call on every retry/cron sweep" (its own comment,
 * unchanged since Phase 9.6), but nothing in the codebase ever actually
 * called it a second time — a real, previously-open gap: an order whose
 * initial push fails (ERP down, network blip, a transient rejection) stayed
 * `FAILED` forever with no mechanism, automatic or manual, to retry it
 * short of a one-off database edit. Mirrors the exact established pattern
 * `expireStaleReservations`/its internal route already use (an idempotent,
 * bounded sweep function, invoked by an external scheduler hitting a
 * shared-secret-protected internal endpoint — no queue, no new
 * infrastructure).
 *
 * Excludes cancelled orders deliberately: an order the customer (or ERP)
 * already cancelled locally before its first push ever succeeded must
 * never be pushed to ERP now as if it were still an active, fresh order.
 * `limit` bounds one sweep call's work so a large backlog can't make a
 * single scheduled invocation run unboundedly long — call it more
 * frequently instead of raising this, if a backlog ever builds up.
 */
export async function retryFailedErpPushes(limit = 25): Promise<{ attempted: number; succeeded: number; stillFailed: number }> {
  const stuck = await db.order.findMany({
    where: { status: "CONFIRMED", erpPushStatus: { in: ["FAILED", "PENDING"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let succeeded = 0;
  for (const order of stuck) {
    await pushOrderToErp(order.id);
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id }, select: { erpPushStatus: true } });
    if (after.erpPushStatus === "SUCCEEDED") succeeded += 1;
  }

  return { attempted: stuck.length, succeeded, stillFailed: stuck.length - succeeded };
}
