import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Idempotency-key ledger (technical-architecture.md §13). Designed to be
 * called with a transaction client (`tx`) as the *first* operations inside
 * a `$transaction` callback — see checkout/service.ts — so the claim and
 * the actual order-creation succeed or fail atomically together
 * (commerce-completeness-audit.md §13: "the key is recorded... inside the
 * same transaction as order creation").
 */

type Db = PrismaClient | Prisma.TransactionClient;

export class IdempotencyConflictError extends Error {
  constructor(readonly key: string) {
    super(`Idempotency key "${key}" is already being processed`);
    this.name = "IdempotencyConflictError";
  }
}

export class IdempotencyScopeMismatchError extends Error {
  constructor(readonly key: string) {
    super(`Idempotency key "${key}" was already used in a different scope`);
    this.name = "IdempotencyScopeMismatchError";
  }
}

export type IdempotencyClaim<T> = { alreadyCompleted: true; response: T } | { alreadyCompleted: false };

/**
 * Call first, inside the transaction. If it returns `alreadyCompleted:
 * true`, skip the operation entirely and return `response` — this is what
 * makes a duplicate "place order" click or a retried webhook a no-op
 * rather than a second order/payment. Throws IdempotencyConflictError if
 * another request is genuinely mid-flight for the same key right now
 * (caught via the unique-constraint race, not a pre-check race).
 */
export async function claimIdempotencyKey<T>(
  tx: Db,
  scope: string,
  key: string,
): Promise<IdempotencyClaim<T>> {
  const existing = await tx.idempotencyKey.findUnique({ where: { key } });

  if (existing) {
    if (existing.scope !== scope) {
      throw new IdempotencyScopeMismatchError(key);
    }
    if (existing.status === "COMPLETED") {
      return { alreadyCompleted: true, response: existing.responseSnapshot as T };
    }
    throw new IdempotencyConflictError(key);
  }

  try {
    await tx.idempotencyKey.create({ data: { key, scope, status: "IN_PROGRESS" } });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw new IdempotencyConflictError(key);
    }
    throw error;
  }

  return { alreadyCompleted: false };
}

/** Call once the operation the key guards has actually succeeded, inside the same transaction. */
export async function completeIdempotencyKey(tx: Db, key: string, response: unknown): Promise<void> {
  await tx.idempotencyKey.update({
    where: { key },
    data: { status: "COMPLETED", responseSnapshot: response as Prisma.InputJsonValue, completedAt: new Date() },
  });
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
