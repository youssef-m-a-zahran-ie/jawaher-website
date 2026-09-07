import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * State-changing operations on orders/payments log an audit entry
 * (technical-architecture.md §13). Deliberately not a full event-sourcing
 * system — one append-only row per transition, queried by entity when
 * support needs a history, nothing more.
 */
export async function recordAuditEvent(
  db: PrismaClient | Prisma.TransactionClient,
  event: {
    entityType: "Order" | "Payment" | "InventoryReservation" | "Coupon";
    entityId: string;
    action: string;
    actorType: "customer" | "system";
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db.auditLog.create({
    data: {
      entityType: event.entityType,
      entityId: event.entityId,
      action: event.action,
      actorType: event.actorType,
      metadata: event.metadata as Prisma.InputJsonValue,
    },
  });
}
