import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";

type Db = PrismaClient | Prisma.TransactionClient;

export const ordersRepository = {
  findById(id: string, client: Db = db) {
    return client.order.findUnique({
      where: { id },
      include: { items: true, payments: { orderBy: { createdAt: "desc" } }, shipment: true },
    });
  },

  /**
   * The guest session that originally placed an order — used ONLY for the
   * ownership check on a guest order (Phase 9.7 fix, see `assertOrderOwnership`
   * in service.ts), never included in a customer-facing response. A separate,
   * minimal query rather than adding this relation to `findById` above, so
   * every existing caller's response shape is untouched.
   */
  async findOwningSessionId(orderId: string, client: Db = db): Promise<string | null> {
    const order = await client.order.findUnique({
      where: { id: orderId },
      select: { checkoutSession: { select: { cart: { select: { sessionId: true } } } } },
    });
    return order?.checkoutSession.cart.sessionId ?? null;
  },

  /** Public tracking lookup — order number + phone together, never order number alone (commerce-completeness-audit.md §19's anti-enumeration control). */
  findByNumberAndPhone(orderNumber: string, phoneE164: string, client: Db = db) {
    return client.order.findFirst({
      where: { orderNumber, OR: [{ shippingPhoneE164: phoneE164 }, { guestPhoneE164: phoneE164 }] },
      include: { items: true, payments: { orderBy: { createdAt: "desc" } }, shipment: true },
    });
  },

  listForCustomer(customerId: string, client: Db = db) {
    return client.order.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      include: { items: true, payments: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
  },

  cancel(id: string, reason: string, client: Db = db) {
    return client.order.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: reason } });
  },
};
