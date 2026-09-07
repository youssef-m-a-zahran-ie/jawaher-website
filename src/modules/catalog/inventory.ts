import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";
import { env } from "@/lib/env";

type Db = PrismaClient | Prisma.TransactionClient;

export type AvailabilityState = "in_stock" | "low_stock" | "out_of_stock";

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
