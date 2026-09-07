import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  InsufficientInventoryError,
  reserveInventoryForItems,
  releaseReservationsForCheckoutSession,
  getAvailableQuantity,
} from "@/modules/catalog";
import { createTestSessionAndCart, createTestVariant, cleanupTestData } from "./helpers/fixtures";
import { isDatabaseAvailable } from "./helpers/db-availability";

const dbAvailable = await isDatabaseAvailable();

/**
 * The test this phase's brief explicitly calls for: fire N concurrent
 * reservation attempts at a variant with fewer than N units available,
 * and assert exactly the correct number succeed — proving the row-level
 * lock in reserveInventoryForItems (src/modules/catalog/inventory.ts)
 * actually prevents overselling under real concurrent load, not just in
 * single-threaded reasoning. See docs/planning/commerce-completeness-audit.md §13.
 */
describe.skipIf(!dbAvailable)("inventory reservation concurrency", () => {
  const categoryIds: string[] = [];
  const sessionIds: string[] = [];

  afterAll(async () => {
    await cleanupTestData({ categoryIds, sessionIds });
    await db.$disconnect();
  });

  it("exactly 3 of 10 concurrent reservation attempts succeed when only 3 units are available", async () => {
    const { category, variant } = await createTestVariant({ quantity: 3 });
    categoryIds.push(category.id);

    const sessions = await Promise.all(Array.from({ length: 10 }, () => createTestSessionAndCart()));
    sessions.forEach((s) => sessionIds.push(s.session.id));

    const checkoutSessions = await Promise.all(
      sessions.map(({ cart }) =>
        db.checkoutSession.create({ data: { cartId: cart.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) } }),
      ),
    );

    const attempts = await Promise.allSettled(
      checkoutSessions.map((cs) =>
        db.$transaction((tx) => reserveInventoryForItems(tx, cs.id, [{ variantId: variant.id, quantity: 1 }])),
      ),
    );

    const succeeded = attempts.filter((a) => a.status === "fulfilled");
    const failed = attempts.filter((a) => a.status === "rejected");

    expect(succeeded).toHaveLength(3);
    expect(failed).toHaveLength(7);
    for (const failure of failed) {
      if (failure.status === "rejected") {
        expect(failure.reason).toBeInstanceOf(InsufficientInventoryError);
      }
    }

    // The invariant the brief names explicitly: total reserved never exceeds real stock.
    const totalReserved = await db.inventoryReservation.aggregate({
      where: { variantId: variant.id, status: "ACTIVE" },
      _sum: { quantity: true },
    });
    expect(totalReserved._sum.quantity).toBe(3);
  }, 20_000);

  it("a single request over the available quantity reserves none of the requested items (all-or-nothing)", async () => {
    const { category, variant } = await createTestVariant({ quantity: 2 });
    categoryIds.push(category.id);
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);
    const checkoutSession = await db.checkoutSession.create({
      data: { cartId: cart.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });

    await expect(
      db.$transaction((tx) =>
        reserveInventoryForItems(tx, checkoutSession.id, [{ variantId: variant.id, quantity: 5 }]),
      ),
    ).rejects.toThrow(InsufficientInventoryError);

    const reservations = await db.inventoryReservation.findMany({ where: { checkoutSessionId: checkoutSession.id } });
    expect(reservations).toHaveLength(0);
  });

  it("releasing a reservation makes exactly that quantity available again — never more", async () => {
    const { category, variant } = await createTestVariant({ quantity: 5 });
    categoryIds.push(category.id);
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);
    const checkoutSession = await db.checkoutSession.create({
      data: { cartId: cart.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });

    await db.$transaction((tx) => reserveInventoryForItems(tx, checkoutSession.id, [{ variantId: variant.id, quantity: 4 }]));
    await releaseReservationsForCheckoutSession(db, checkoutSession.id);

    const available = await getAvailableQuantity(db, variant.id);
    expect(available).toBe(5); // back to the full raw quantity — not 5 + something, not less than 5.
  });
});
