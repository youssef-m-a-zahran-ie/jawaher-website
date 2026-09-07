import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";

type Db = PrismaClient | Prisma.TransactionClient;

export const promotionsRepository = {
  findActiveCouponByCode(code: string, client: Db = db) {
    return client.coupon.findUnique({ where: { code } });
  },

  countRedemptionsForCustomer(couponId: string, customerId: string, client: Db = db) {
    return client.couponRedemption.count({ where: { couponId, customerId } });
  },

  recordRedemption(
    data: { couponId: string; orderId?: string; customerId?: string; guestPhoneE164?: string },
    client: Db = db,
  ) {
    return client.couponRedemption.create({ data });
  },

  incrementUsageCount(couponId: string, client: Db = db) {
    return client.coupon.update({ where: { id: couponId }, data: { usageCount: { increment: 1 } } });
  },
};
