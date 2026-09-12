import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";
import type { MappedCategory, MappedProduct, MappedVariant } from "./mapper";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * ============================================================================
 * CATALOG SYNC — REPOSITORY (Prisma writes only, no business logic)
 * ============================================================================
 * Every upsert here is keyed by a stable ERP identifier
 * (erpCategoryId/erpProductId) or the pre-existing globally-unique `sku`
 * (website-erp-catalog-sync.md §7) — never name/slug. Fields not listed as
 * "ERP-owned" in that document's §4 table are never written here; see each
 * function's own comment for exactly which fields it touches.
 * ============================================================================
 */

const LOCK_ID = "catalog-sync";

/** Idempotent — safe to call before every sync attempt. */
export async function ensureSyncLockExists(client: Db = db): Promise<void> {
  await client.catalogSyncLock.upsert({
    where: { id: LOCK_ID },
    update: {},
    create: { id: LOCK_ID, isRunning: false },
  });
}

/**
 * Atomic conditional UPDATE (isRunning: false -> true) — see
 * website-erp-catalog-sync.md §14 for why this, and not a
 * SELECT-then-INSERT race, is the real concurrency guard.
 */
export async function tryAcquireSyncLock(runId: string, client: Db = db): Promise<boolean> {
  const result = await client.catalogSyncLock.updateMany({
    where: { id: LOCK_ID, isRunning: false },
    data: { isRunning: true, lockedAt: new Date(), runId },
  });
  return result.count === 1;
}

export async function releaseSyncLock(client: Db = db): Promise<void> {
  await client.catalogSyncLock.updateMany({
    where: { id: LOCK_ID },
    data: { isRunning: false },
  });
}

export async function createSyncRun(
  type: "FULL" | "INCREMENTAL",
  correlationId: string,
  client: Db = db
): Promise<string> {
  const run = await client.catalogSyncRun.create({
    data: { type, correlationId, status: "RUNNING" },
  });
  return run.id;
}

export interface SyncRunCounters {
  categoriesFetched: number;
  productsFetched: number;
  productsCreated: number;
  productsUpdated: number;
  productsDeactivated: number;
  variantsDeactivated: number;
}

export async function completeSyncRun(
  runId: string,
  status: "SUCCEEDED" | "FAILED",
  counters: Partial<SyncRunCounters>,
  errorSummary: string | null,
  client: Db = db
): Promise<void> {
  await client.catalogSyncRun.update({
    where: { id: runId },
    data: { status, completedAt: new Date(), errorSummary, ...counters },
  });
}

/** The watermark for the next incremental sync — the most recent SUCCEEDED run's own startedAt. See website-erp-catalog-sync.md §11 for why startedAt, not completedAt. */
export async function getLastSuccessfulSyncStartedAt(client: Db = db): Promise<Date | null> {
  const lastRun = await client.catalogSyncRun.findFirst({
    where: { status: "SUCCEEDED" },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true },
  });
  return lastRun?.startedAt ?? null;
}

/**
 * Category: ERP-owned `name`; `slug` set only at creation (fallback,
 * never overwritten — website-erp-catalog-sync.md §17); `sortOrder` never
 * touched (website-owned presentation, schema default on create).
 */
export async function upsertCategory(mapped: MappedCategory, client: Db = db): Promise<string> {
  const row = await client.category.upsert({
    where: { erpCategoryId: mapped.erpCategoryId },
    update: { name: mapped.name },
    create: { erpCategoryId: mapped.erpCategoryId, name: mapped.name, slug: mapped.fallbackSlug },
  });
  return row.id;
}

export interface UpsertProductResult {
  id: string;
  wasCreated: boolean;
}

/**
 * Product: ERP-owned `name`/`status`/`categoryId` are always overwritten.
 * `description` (website-owned rich content) is left null on create and
 * never touched on update. `slug` set only at creation (fallback), never
 * overwritten. `sortOrder`/`attributes` never touched.
 */
export async function upsertProduct(
  mapped: Pick<MappedProduct, "erpProductId" | "name" | "status">,
  categoryId: string,
  client: Db = db
): Promise<UpsertProductResult> {
  const existing = await client.product.findUnique({
    where: { erpProductId: mapped.erpProductId },
    select: { id: true },
  });
  const row = await client.product.upsert({
    where: { erpProductId: mapped.erpProductId },
    update: { name: mapped.name, status: mapped.status, categoryId },
    create: {
      erpProductId: mapped.erpProductId,
      name: mapped.name,
      status: mapped.status,
      categoryId,
      slug: `erp-${mapped.erpProductId}`,
    },
  });
  return { id: row.id, wasCreated: existing === null };
}

/**
 * Variant: ERP-owned `active` status is always overwritten. `priceAmountMinor`
 * (ERP-owned) is overwritten only when ERP actually returned a price — a
 * null ERP price is real data ("not yet priced"), never faked as 0, and on
 * create with no price at all the variant is skipped entirely (see
 * service.ts) rather than writing a fabricated 0 into a NOT NULL column.
 * `label` (website-owned presentation, but NOT NULL) uses the fallback
 * only at creation and is never overwritten afterwards.
 * `compareAtAmountMinor`/`currency`/`inventoryQuantity`/`sortOrder` are
 * strictly never touched here (website/promotions-owned or, for
 * inventory, this phase's explicit non-goal).
 */
export async function upsertVariant(
  mapped: MappedVariant,
  productId: string,
  client: Db = db
): Promise<{ id: string; wasCreated: boolean } | null> {
  const existing = await client.variant.findUnique({ where: { sku: mapped.sku }, select: { id: true } });
  if (existing === null && mapped.priceAmountMinor === null) {
    // Cannot create a NOT NULL priceAmountMinor row with no real ERP price — skip, don't fabricate.
    return null;
  }
  const row = await client.variant.upsert({
    where: { sku: mapped.sku },
    update: {
      active: mapped.active,
      ...(mapped.priceAmountMinor !== null ? { priceAmountMinor: mapped.priceAmountMinor } : {}),
    },
    create: {
      sku: mapped.sku,
      productId,
      active: mapped.active,
      priceAmountMinor: mapped.priceAmountMinor as number, // guarded above
      label: mapped.fallbackLabel,
    },
  });
  return { id: row.id, wasCreated: existing === null };
}

/**
 * Full-sync deactivation sweep (website-erp-catalog-sync.md §8/§9) — only
 * ever touches rows already ERP-managed (`erpProductId` not null); seed/
 * manual rows with no ERP origin are never in scope. MUST only be called
 * after a full sync's entire page loop has succeeded — never on a
 * partial/failed run (see service.ts).
 */
export async function deactivateMissingProducts(seenErpProductIds: string[], client: Db = db): Promise<number> {
  const result = await client.product.updateMany({
    where: { erpProductId: { not: null, notIn: seenErpProductIds }, status: "ACTIVE" },
    data: { status: "DISCONTINUED" },
  });
  return result.count;
}

export async function deactivateMissingVariants(seenSkus: string[], client: Db = db): Promise<number> {
  const erpManagedProducts = await client.product.findMany({
    where: { erpProductId: { not: null } },
    select: { id: true },
  });
  if (erpManagedProducts.length === 0) return 0;
  const result = await client.variant.updateMany({
    where: {
      productId: { in: erpManagedProducts.map((p) => p.id) },
      sku: { notIn: seenSkus },
      active: true,
    },
    data: { active: false },
  });
  return result.count;
}
