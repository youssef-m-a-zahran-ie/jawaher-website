import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { erpInventoryAdapter } from "@/modules/erp-integration";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * "unknown" (Phase 9.5R) — ERP is the sole inventory authority (see
 * docs/integration/inventory-integration-audit.md §1); this state exists
 * so a caller that could not get an authoritative ERP answer has an
 * honest way to say so, instead of being forced to pick between a false
 * "in_stock" (using stale local data as if verified) or a false
 * "out_of_stock" (which could hide a genuinely purchasable item during a
 * transient ERP hiccup). Never returned by `deriveAvailability()` itself
 * — only ever set directly by a caller that knows verification failed.
 */
export type AvailabilityState = "in_stock" | "low_stock" | "out_of_stock" | "unknown";

/**
 * Below this many available units, the storefront shows "ينفد قريبًا"
 * instead of "متوفر" (Phase 2/3's Badge convention). A tunable constant,
 * not a business decision requiring approval — see
 * docs/planning/commerce-completeness-audit.md §5.
 */
export const LOW_STOCK_THRESHOLD = 5;

/**
 * Phase 1 New Finding #1's fix. The ONLY place this duration is defined —
 * every reservation's `expiresAt` is computed from this single constant,
 * nowhere else in the codebase hardcodes a TTL value (verified: grep for
 * "RESERVATION_TTL"/"15 \* 60" turns up only this file). Centrally
 * configurable via `INVENTORY_RESERVATION_TTL_MINUTES` (src/lib/env.ts) —
 * changing the duration is an environment-variable change, never a code or
 * schema change. Defaults to 15 minutes, the smallest technically-safe
 * value the original finding suggested — this remains an OPEN BUSINESS
 * DECISION (docs/planning/commerce-completeness-audit.md §5), not a
 * confirmed policy; the default is a placeholder, not an answer.
 */
export const RESERVATION_TTL_MS = (env.INVENTORY_RESERVATION_TTL_MINUTES ?? 15) * 60 * 1000;

export function deriveAvailability(availableQuantity: number): AvailabilityState {
  if (availableQuantity <= 0) return "out_of_stock";
  if (availableQuantity <= LOW_STOCK_THRESHOLD) return "low_stock";
  return "in_stock";
}

export class InsufficientInventoryError extends Error {
  constructor(readonly variantIds: string[]) {
    super(`Insufficient inventory for variant(s): ${variantIds.join(", ")}`);
    this.name = "InsufficientInventoryError";
  }
}

/**
 * The raw projected quantity minus every currently-ACTIVE reservation for
 * that variant — never the raw column alone. This is the one function
 * every other "is this available" check in the codebase should call
 * (commerce-completeness-audit.md §5).
 */
export async function getAvailableQuantity(client: Db, variantId: string): Promise<number> {
  const variant = await client.variant.findUniqueOrThrow({ where: { id: variantId } });
  const reserved = await client.inventoryReservation.aggregate({
    where: { variantId, status: "ACTIVE" },
    _sum: { quantity: true },
  });
  return variant.inventoryQuantity - (reserved._sum.quantity ?? 0);
}

/**
 * Phase 12 — the batched sibling of `getAvailableQuantity`, for rendering
 * a LISTING of many variants (Shop/Category/Search) rather than one
 * purchase-decision read. A real N+1 was found and fixed here: every
 * catalog listing page previously called `getAvailableQuantity` once per
 * variant, and that function itself re-fetches the variant row from the
 * database even when the caller (a listing query that already selected
 * every scalar column, `inventoryQuantity` included) already has it in
 * hand — for a page of N products with V variants each, that was
 * `N*V*2` avoidable round trips on every request (these listing routes
 * are all `force-dynamic`, so this ran fresh every time, not just at
 * build). This does exactly one `groupBy` query for however many variants
 * are being displayed, regardless of how many there are, and the caller
 * supplies the `inventoryQuantity` it already loaded instead of asking
 * this function to re-fetch it.
 *
 * Deliberately a SEPARATE function rather than changing
 * `getAvailableQuantity`'s own signature: that function's callers
 * (checkout, `getVariantForPurchase`) are purchase-decision reads that
 * must fetch the current row themselves, not reuse a value the caller
 * loaded earlier in the request — those two consistency requirements are
 * genuinely different and must not be conflated into one function.
 */
export async function getAvailableQuantitiesForVariants(
  client: Db,
  variants: { id: string; inventoryQuantity: number }[],
): Promise<Map<string, number>> {
  if (variants.length === 0) return new Map();

  const reservations = await client.inventoryReservation.groupBy({
    by: ["variantId"],
    where: { variantId: { in: variants.map((v) => v.id) }, status: "ACTIVE" },
    _sum: { quantity: true },
  });
  const reservedByVariantId = new Map(reservations.map((r) => [r.variantId, r._sum.quantity ?? 0]));

  return new Map(variants.map((v) => [v.id, v.inventoryQuantity - (reservedByVariantId.get(v.id) ?? 0)]));
}

/**
 * Reserves each requested item or reserves none of them — never a partial
 * reservation. Must be called with a transaction client so the row lock
 * and the availability check are atomic with the insert; the caller (the
 * Checkout service) owns the transaction boundary because reservation
 * creation is one step inside a larger checkout-confirmation transaction.
 *
 * Row-level locking (`FOR UPDATE`) is why this is concurrency-safe: a
 * naive "SELECT quantity, check in application code, then INSERT" lets
 * two simultaneous requests both read the same pre-reservation count and
 * both succeed for the last unit. Locking the variant row first forces
 * the second concurrent transaction to wait until the first commits (or
 * rolls back), then re-read the now-current reserved total. Verified by
 * tests/integration/inventory-concurrency.test.ts.
 */
export async function reserveInventoryForItems(
  tx: Prisma.TransactionClient,
  checkoutSessionId: string,
  items: { variantId: string; quantity: number }[],
): Promise<string[]> {
  const reservationIds: string[] = [];
  const insufficient: string[] = [];

  for (const item of items) {
    await tx.$queryRaw`SELECT id FROM variants WHERE id = ${item.variantId}::uuid FOR UPDATE`;

    const available = await getAvailableQuantity(tx, item.variantId);
    if (available < item.quantity) {
      insufficient.push(item.variantId);
      continue;
    }

    const reservation = await tx.inventoryReservation.create({
      data: {
        variantId: item.variantId,
        checkoutSessionId,
        quantity: item.quantity,
        expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
      },
    });
    reservationIds.push(reservation.id);
  }

  if (insufficient.length > 0) {
    // Throwing inside $transaction rolls back every reservation already
    // inserted this call — "all or none" is enforced by the transaction, not by manual cleanup.
    throw new InsufficientInventoryError(insufficient);
  }

  return reservationIds;
}

export async function releaseReservationsForCheckoutSession(
  client: Db,
  checkoutSessionId: string,
): Promise<void> {
  await client.inventoryReservation.updateMany({
    where: { checkoutSessionId, status: "ACTIVE" },
    data: { status: "RELEASED", releasedAt: new Date() },
  });
}

export async function consumeReservationsForCheckoutSession(
  client: Db,
  checkoutSessionId: string,
): Promise<void> {
  await client.inventoryReservation.updateMany({
    where: { checkoutSessionId, status: "ACTIVE" },
    data: { status: "CONSUMED" },
  });
}

/**
 * The scheduled-sweep entry point (technical-architecture.md §19: "an
 * external scheduler hitting an internal endpoint" — no queue at MVP).
 * Nothing in this project invokes it on a schedule yet — see
 * docs/planning/commerce-completeness-audit.md §21's risk note.
 */
export async function expireStaleReservations(client: PrismaClient = db): Promise<number> {
  const result = await client.inventoryReservation.updateMany({
    where: { status: "ACTIVE", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED", releasedAt: new Date() },
  });
  return result.count;
}

/**
 * ============================================================================
 * ERP-AWARE AVAILABILITY — Phase 9.5, corrected in Phase 9.5R
 * ============================================================================
 * ERP IS THE ONLY INVENTORY AUTHORITY (audit §1). This project's own
 * `InventoryReservation`/`inventoryQuantity` above remain UNCHANGED code,
 * but are strictly LEGACY/NON-AUTHORITATIVE data — they continue to
 * guard against two simultaneous Website checkouts racing for the same
 * (Website-local, stale) unit, a same-repo concurrency guard only (audit
 * §7/§15). They are NEVER combined with an ERP answer (no `min()`, no
 * averaging, nothing) — when ERP has an answer, ERP's number is used
 * alone, full stop; the local number cannot narrow, widen, or otherwise
 * influence it.
 *
 * Two, and only two, legitimate reasons local data is ever used at all:
 *   1. The variant has no `erpVariantId` (never synced from ERP) — there
 *      is no ERP claim to honor or override; this is not a fallback from
 *      failure, it's the only data that has ever existed for this row.
 *   2. ERP could not be reached (timeout/unavailable/malformed) for a
 *      variant that DOES have an `erpVariantId` — this is a real
 *      verification failure. It is reported as `failed: true` and MUST
 *      NOT be silently treated as "use local data as truth" by any
 *      caller — see `getVariantForPurchase` (service.ts), which returns
 *      the explicit `"unknown"` state for this case, never a number
 *      borrowed from `inventoryQuantity` presented as if verified.
 * ============================================================================
 */

export type ErpVariantForAvailability = { id: string; erpVariantId: string | null };

/**
 * Batched: a cart or a checkout's line count is always small, so this is
 * always at most one ERP call (the adapter itself sub-batches beyond its
 * own per-request id limit, which no realistic cart/checkout approaches).
 * Keyed by the Website's own variant `id` (re-keyed internally from
 * ERP's own `erpVariantId`, which is what's actually sent over the wire
 * — see erp-integration/inventory.ts).
 */
export async function fetchErpAvailability(
  variants: ErpVariantForAvailability[]
): Promise<{ availableById: Map<string, number>; failed: boolean }> {
  const checkable = variants.filter((v): v is { id: string; erpVariantId: string } => v.erpVariantId !== null);
  if (checkable.length === 0) return { availableById: new Map(), failed: false };

  const websiteIdByErpVariantId = new Map(checkable.map((v) => [v.erpVariantId, v.id]));

  try {
    const { availableById: availableByErpVariantId } = await erpInventoryAdapter.getAvailability(
      checkable.map((v) => v.erpVariantId)
    );
    const availableById = new Map<string, number>();
    for (const [erpVariantId, available] of availableByErpVariantId) {
      const websiteId = websiteIdByErpVariantId.get(erpVariantId);
      if (websiteId !== undefined) availableById.set(websiteId, available);
    }
    return { availableById, failed: false };
  } catch (err) {
    logger.warn({ err, variantIds: checkable.map((v) => v.id) }, "erp-inventory: availability check failed — caller must treat this as unknown, never as local data masquerading as truth");
    return { availableById: new Map(), failed: true };
  }
}
