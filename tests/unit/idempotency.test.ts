import type { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  claimIdempotencyKey,
  completeIdempotencyKey,
  IdempotencyConflictError,
  IdempotencyScopeMismatchError,
} from "@/lib/idempotency";

/**
 * A minimal in-memory fake satisfying just the two `idempotencyKey.*`
 * methods claimIdempotencyKey/completeIdempotencyKey actually call — lets
 * this logic be unit-tested without a real database. Integration tests
 * cover the real Prisma-backed behavior (row locking, actual transactions)
 * separately — see tests/integration/checkout.test.ts.
 */
function makeFakeTx() {
  const rows = new Map<string, { key: string; scope: string; status: string; responseSnapshot: unknown }>();

  return {
    idempotencyKey: {
      async findUnique({ where: { key } }: { where: { key: string } }) {
        return rows.get(key) ?? null;
      },
      async create({ data }: { data: { key: string; scope: string; status: string } }) {
        if (rows.has(data.key)) {
          const error = new Error("Unique constraint failed") as Error & { code: string };
          error.code = "P2002";
          throw error;
        }
        const row = { ...data, responseSnapshot: null };
        rows.set(data.key, row);
        return row;
      },
      async update({ where: { key }, data }: { where: { key: string }; data: Record<string, unknown> }) {
        const existing = rows.get(key);
        if (!existing) throw new Error("not found");
        const updated = { ...existing, ...data };
        rows.set(key, updated);
        return updated;
      },
    },
  } as unknown as Prisma.TransactionClient;
}

describe("claimIdempotencyKey / completeIdempotencyKey", () => {
  it("a fresh key is not already completed", async () => {
    const tx = makeFakeTx();
    const claim = await claimIdempotencyKey(tx, "checkout.createOrder", "key-1");
    expect(claim.alreadyCompleted).toBe(false);
  });

  it("a completed key replays the original response instead of re-running", async () => {
    const tx = makeFakeTx();
    await claimIdempotencyKey(tx, "checkout.createOrder", "key-2");
    await completeIdempotencyKey(tx, "key-2", { orderId: "order-abc" });

    const claim = await claimIdempotencyKey<{ orderId: string }>(tx, "checkout.createOrder", "key-2");
    expect(claim.alreadyCompleted).toBe(true);
    if (claim.alreadyCompleted) {
      expect(claim.response.orderId).toBe("order-abc");
    }
  });

  it("a key still IN_PROGRESS (never completed) throws IdempotencyConflictError", async () => {
    const tx = makeFakeTx();
    await claimIdempotencyKey(tx, "checkout.createOrder", "key-3");
    await expect(claimIdempotencyKey(tx, "checkout.createOrder", "key-3")).rejects.toThrow(IdempotencyConflictError);
  });

  it("reusing a key across a different scope throws IdempotencyScopeMismatchError", async () => {
    const tx = makeFakeTx();
    await claimIdempotencyKey(tx, "checkout.createOrder", "key-4");
    await completeIdempotencyKey(tx, "key-4", {});
    await expect(claimIdempotencyKey(tx, "payment.create", "key-4")).rejects.toThrow(IdempotencyScopeMismatchError);
  });

  it("a genuine create()-time race (findUnique saw nothing, create still collides) surfaces as IdempotencyConflictError, not a raw DB error", async () => {
    // A true race: this caller's findUnique ran before another caller's
    // create() committed, so it sees nothing — but the create() itself
    // still hits the DB's unique constraint (P2002). This is the case a
    // pure "check then insert" (without relying on the DB constraint)
    // would miss entirely.
    const tx = {
      idempotencyKey: {
        async findUnique() {
          return null;
        },
        async create() {
          const error = new Error("Unique constraint failed") as Error & { code: string };
          error.code = "P2002";
          throw error;
        },
      },
    } as unknown as Prisma.TransactionClient;

    await expect(claimIdempotencyKey(tx, "checkout.createOrder", "key-5")).rejects.toThrow(IdempotencyConflictError);
  });
});
