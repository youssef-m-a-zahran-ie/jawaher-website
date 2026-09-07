import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";

type Db = PrismaClient | Prisma.TransactionClient;

export const customersRepository = {
  findCustomerByPhone(phoneE164: string, client: Db = db) {
    return client.customer.findUnique({ where: { phoneE164 } });
  },

  findCustomerById(id: string, client: Db = db) {
    return client.customer.findUnique({ where: { id } });
  },

  createCustomer(phoneE164: string, client: Db = db) {
    return client.customer.create({ data: { phoneE164 } });
  },

  createSession(data: { customerId: string | null; token: string; expiresAt: Date }, client: Db = db) {
    return client.session.create({ data });
  },

  findSessionByToken(token: string, client: Db = db) {
    return client.session.findUnique({ where: { token } });
  },

  attachCustomerToSession(sessionId: string, customerId: string, client: Db = db) {
    return client.session.update({ where: { id: sessionId }, data: { customerId } });
  },

  deleteSession(token: string, client: Db = db) {
    return client.session.delete({ where: { token } }).catch(() => null);
  },

  listAddressesForCustomer(customerId: string, client: Db = db) {
    return client.address.findMany({ where: { customerId }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });
  },

  findAddressById(id: string, client: Db = db) {
    return client.address.findUnique({ where: { id } });
  },

  createAddress(data: Prisma.AddressCreateInput, client: Db = db) {
    return client.address.create({ data });
  },

  deleteAddress(id: string, client: Db = db) {
    return client.address.delete({ where: { id } });
  },
};
