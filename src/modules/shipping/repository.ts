import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";

type Db = PrismaClient | Prisma.TransactionClient;

export const shippingRepository = {
  findActiveZoneByGovernorate(governorate: string, client: Db = db) {
    return client.shippingZone.findFirst({ where: { governorate, active: true } });
  },

  createShipment(
    data: {
      orderId: string;
      zoneIdentifier: string;
      methodLabel: string;
      feeAmountMinor: number;
      estimateLabel: string;
    },
    client: Db = db,
  ) {
    return client.shipment.create({ data });
  },
};
