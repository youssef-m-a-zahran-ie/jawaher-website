import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

type Db = PrismaClient | Prisma.TransactionClient;

const LOCK_ID = "singleton";

/** Idempotent — safe to call before every refresh attempt. Mirrors catalog-sync's own ensureSyncLockExists exactly. */
export async function ensureSnapshotLockExists(client: Db = db): Promise<void> {
  await client.availabilitySnapshotLock.upsert({
    where: { id: LOCK_ID },
    update: {},
    create: { id: LOCK_ID, isRunning: false },
  });
}

/** Atomic conditional UPDATE (isRunning: false -> true) — same concurrency-guard shape as CatalogSyncLock, a separate row so a catalog sync and an availability refresh never block each other. */
export async function tryAcquireSnapshotLock(runId: string, client: Db = db): Promise<boolean> {
  const result = await client.availabilitySnapshotLock.updateMany({
    where: { id: LOCK_ID, isRunning: false },
    data: { isRunning: true, lockedAt: new Date(), runId },
  });
  return result.count === 1;
}

export async function releaseSnapshotLock(client: Db = db): Promise<void> {
  await client.availabilitySnapshotLock.updateMany({
    where: { id: LOCK_ID },
    data: { isRunning: false },
  });
}

export async function createSnapshotRun(correlationId: string, client: Db = db): Promise<string> {
  const run = await client.availabilitySnapshotRun.create({
    data: { correlationId, status: "RUNNING" },
  });
  return run.id;
}

export interface SnapshotRunCounters {
  variantsAttempted: number;
  variantsSucceeded: number;
  variantsFailed: number;
}

export async function completeSnapshotRun(
  runId: string,
  status: "SUCCEEDED" | "PARTIAL" | "FAILED",
  counters: SnapshotRunCounters,
  errorSummary: string | null,
  client: Db = db
): Promise<void> {
  await client.availabilitySnapshotRun.update({
    where: { id: runId },
    data: { status, completedAt: new Date(), errorSummary, ...counters },
  });
}

export interface ErpLinkedVariant {
  id: string;
  erpVariantId: string;
}

/** Every active, ERP-linked variant — the refresh job's own candidate set. Website-only variants (no erpVariantId) are structurally excluded; there is no ERP claim to snapshot for them. */
export async function listActiveErpLinkedVariants(client: Db = db): Promise<ErpLinkedVariant[]> {
  const rows = await client.variant.findMany({
    where: { active: true, erpVariantId: { not: null } },
    select: { id: true, erpVariantId: true },
  });
  return rows.filter((r): r is ErpLinkedVariant => r.erpVariantId !== null);
}

/** A successful ERP answer for this variant — updates the presentation status AND the freshness clock, clears any prior error. */
export async function recordSnapshotSuccess(
  variantId: string,
  erpVariantId: string,
  presentationStatus: "in_stock" | "low_stock" | "out_of_stock",
  now: Date,
  client: Db = db
): Promise<void> {
  await client.variantAvailabilitySnapshot.upsert({
    where: { variantId },
    update: { erpVariantId, presentationStatus, lastSuccessAt: now, lastAttemptAt: now, lastError: null },
    create: { variantId, erpVariantId, presentationStatus, lastSuccessAt: now, lastAttemptAt: now },
  });
}

/**
 * A failed refresh attempt for this variant (its batch's ERP call threw).
 * Deliberately does NOT touch presentationStatus/lastSuccessAt on an
 * existing row — only lastAttemptAt/lastError — so a transient failure
 * never erases the last known-good value (this milestone's own core
 * safety requirement). If no row exists yet at all, there is nothing to
 * preserve and nothing safe to invent, so this is a no-op for a
 * never-successfully-snapshotted variant — it simply stays "unknown" at
 * read time (§ no row = unknown).
 */
export async function recordSnapshotAttemptFailure(variantId: string, now: Date, errorSummary: string, client: Db = db): Promise<void> {
  await client.variantAvailabilitySnapshot.updateMany({
    where: { variantId },
    data: { lastAttemptAt: now, lastError: errorSummary },
  });
}

export interface SnapshotRow {
  variantId: string;
  presentationStatus: string;
  lastSuccessAt: Date;
}

export async function getSnapshotsForVariantIds(variantIds: string[], client: Db = db): Promise<Map<string, SnapshotRow>> {
  if (variantIds.length === 0) return new Map();
  const rows = await client.variantAvailabilitySnapshot.findMany({
    where: { variantId: { in: variantIds } },
    select: { variantId: true, presentationStatus: true, lastSuccessAt: true },
  });
  return new Map(rows.map((r) => [r.variantId, r]));
}
