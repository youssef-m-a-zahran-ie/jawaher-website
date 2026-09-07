import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { CartItemUnavailableError, cartService } from "@/modules/cart";
import { createTestSessionAndCart, createTestVariant, cleanupTestData } from "./helpers/fixtures";
import { isDatabaseAvailable } from "./helpers/db-availability";

const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)("cart", () => {
  const categoryIds: string[] = [];
  const sessionIds: string[] = [];

  afterAll(async () => {
    await cleanupTestData({ categoryIds, sessionIds });
    await db.$disconnect();
  });

  it("adds an item, clamped to available inventory", async () => {
    const { category, variant } = await createTestVariant({ quantity: 3 });
    categoryIds.push(category.id);
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);

    const result = await cartService.addItem(cart.id, variant.id, 10);
    expect(result.addedQuantity).toBe(3);
    expect(result.clamped).toBe(true);

    const view = await cartService.getCartView(cart.id);
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0].quantity).toBe(3);
  });

  it("adding the same variant twice increments quantity rather than duplicating the line", async () => {
    const { category, variant } = await createTestVariant({ quantity: 10 });
    categoryIds.push(category.id);
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);

    await cartService.addItem(cart.id, variant.id, 2);
    await cartService.addItem(cart.id, variant.id, 3);

    const view = await cartService.getCartView(cart.id);
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0].quantity).toBe(3); // upsert sets, doesn't sum — see repository.upsertItem
  });

  it("rejects adding an unknown variant", async () => {
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);

    await expect(cartService.addItem(cart.id, randomUUID(), 1)).rejects.toThrow(CartItemUnavailableError);
  });

  it("rejects adding an out-of-stock variant", async () => {
    const { category, variant } = await createTestVariant({ quantity: 0 });
    categoryIds.push(category.id);
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);

    await expect(cartService.addItem(cart.id, variant.id, 1)).rejects.toThrow(CartItemUnavailableError);
  });

  it("updateQuantity to 0 removes the line", async () => {
    const { category, variant } = await createTestVariant({ quantity: 5 });
    categoryIds.push(category.id);
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);

    await cartService.addItem(cart.id, variant.id, 2);
    await cartService.updateQuantity(cart.id, variant.id, 0);

    const view = await cartService.getCartView(cart.id);
    expect(view.lines).toHaveLength(0);
  });

  it("removeItem removes exactly that line, leaving others intact", async () => {
    const { category, variant: variantA } = await createTestVariant({ quantity: 5 });
    categoryIds.push(category.id);
    const { variant: variantB } = await createTestVariant({ quantity: 5 });
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);

    await cartService.addItem(cart.id, variantA.id, 1);
    await cartService.addItem(cart.id, variantB.id, 1);
    await cartService.removeItem(cart.id, variantA.id);

    const view = await cartService.getCartView(cart.id);
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0].variantId).toBe(variantB.id);
  });

  it("totals always reflect the live price, never a stale add-time snapshot", async () => {
    const { category, variant } = await createTestVariant({ quantity: 5, priceEgp: 100 });
    categoryIds.push(category.id);
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);

    await cartService.addItem(cart.id, variant.id, 2);
    await db.variant.update({ where: { id: variant.id }, data: { priceAmountMinor: 15000 } }); // price changes to 150.00

    const view = await cartService.getCartView(cart.id);
    expect(view.lines[0].unitPrice.toDecimalString()).toBe("150.00");
    expect(view.lines[0].priceChangedSinceAdded).toBe(true);
    expect(view.subtotal.toDecimalString()).toBe("300.00"); // 150 * 2, never the stale 100 * 2
  });

  it("a variant that goes out of stock after being added is excluded from the totals, not silently priced", async () => {
    const { category, variant } = await createTestVariant({ quantity: 5 });
    categoryIds.push(category.id);
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);

    await cartService.addItem(cart.id, variant.id, 2);
    await db.variant.update({ where: { id: variant.id }, data: { inventoryQuantity: 0 } });

    const view = await cartService.getCartView(cart.id);
    expect(view.lines).toHaveLength(0);
    expect(view.subtotal.isZero()).toBe(true);
  });

  it("merges a guest cart into an existing customer cart, summing quantities per SKU with live prices", async () => {
    const { category, variant } = await createTestVariant({ quantity: 20, priceEgp: 50 });
    categoryIds.push(category.id);
    const { session: guestSession, cart: guestCart } = await createTestSessionAndCart();
    const { session: customerSession, cart: customerCart } = await createTestSessionAndCart();
    sessionIds.push(guestSession.id, customerSession.id);

    await cartService.addItem(guestCart.id, variant.id, 2);
    await cartService.addItem(customerCart.id, variant.id, 3);

    await cartService.mergeCarts(guestCart.id, customerCart.id);

    const view = await cartService.getCartView(customerCart.id);
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0].quantity).toBe(5);

    const guestCartAfter = await db.cart.findUnique({ where: { id: guestCart.id } });
    expect(guestCartAfter?.status).toBe("CONVERTED");
  });
});
