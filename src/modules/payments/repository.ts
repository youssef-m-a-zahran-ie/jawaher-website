import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";

type Db = PrismaClient | Prisma.TransactionClient;

export const paymentsRepository = {
  createPayment(data: Prisma.PaymentCreateInput, client: Db = db) {
    return client.payment.create({ data });
  },

  findByIdempotencyKey(idempotencyKey: string, client: Db = db) {
    return client.payment.findUnique({ where: { idempotencyKey } });
  },

  updateStatus(
    id: string,
    data: Partial<{
      status: Prisma.PaymentUpdateInput["status"];
      providerReference: string;
      failureReason: string;
      authorizedAt: Date;
      capturedAt: Date;
      failedAt: Date;
      cancelledAt: Date;
      refundInitiatedAt: Date;
      refundCompletedAt: Date;
    }>,
    client: Db = db,
  ) {
    return client.payment.update({ where: { id }, data });
  },

  findLatestForOrder(orderId: string, client: Db = db) {
    return client.payment.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" } });
  },
};
