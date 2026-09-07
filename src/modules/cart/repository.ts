import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";

type Db = PrismaClient | Prisma.TransactionClient;

export const cartRepository = {
  findActiveCartBySession(sessionId: string, client: Db = db) {
    return client.cart.findFirst({
      where: { sessionId, status: "ACTIVE" },
      include: { items: { include: { variant: { include: { product: true } } } } },
    });
  },

  findActiveCartByCustomer(customerId: string, client: Db = db) {
    return client.cart.findFirst({
      where: { customerId, status: "ACTIVE" },
      include: { items: { include: { variant: { include: { product: true } } } } },
    });
  },

  findCartById(cartId: string, client: Db = db) {
    return client.cart.findUnique({
      where: { id: cartId },
      include: { items: { include: { variant: { include: { product: true } } } } },
    });
  },

  createCart(sessionId: string, customerId: string | null, client: Db = db) {
    return client.cart.create({
      data: { sessionId, customerId },
      include: { items: { include: { variant: { include: { product: true } } } } },
    });
  },

  upsertItem(cartId: string, variantId: string, quantity: number, addedPriceAmountMinor: number, client: Db = db) {
    return client.cartItem.upsert({
      where: { cartId_variantId: { cartId, variantId } },
      create: { cartId, variantId, quantity, addedPriceAmountMinor },
      update: { quantity },
    });
  },

  setItemQuantity(cartId: string, variantId: string, quantity: number, client: Db = db) {
    return client.cartItem.update({ where: { cartId_variantId: { cartId, variantId } }, data: { quantity } });
  },

  removeItem(cartId: string, variantId: string, client: Db = db) {
    return client.cartItem.delete({ where: { cartId_variantId: { cartId, variantId } } }).catch(() => null);
  },

  markConverted(cartId: string, client: Db = db) {
    return client.cart.update({ where: { id: cartId }, data: { status: "CONVERTED" } });
  },
};
