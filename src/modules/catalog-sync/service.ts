import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { erpCatalogAdapter, type ErpCatalogProduct } from "@/modules/erp-integration";
import { mapErpCategory, mapErpProduct } from "./mapper";
import {
  ensureSyncLockExists,
  tryAcquireSyncLock,
  releaseSyncLock,
  createSyncRun,
  completeSyncRun,
  getLastSuccessfulSyncStartedAt,
  upsertCategory,
  upsertProduct,
  upsertVariant,
  deactivateMissingProducts,
  deactivateMissingVariants,
  type SyncRunCounters,
} from "./repository";

/**
 * ============================================================================
 * CATALOG SYNC — ORCHESTRATION
 * ============================================================================
 * See docs/integration/website-erp-catalog-sync.md for the full design.
 * INVENTORY IS NOT SYNCED HERE — this module never calls the ERP
 * inventory endpoint and never writes `Variant.inventoryQuantity`
 * (strict non-goal, §17 of that document).
 * ============================================================================
 */

const PAGE_SIZE = 100;
const MAX_PAGES = 500; // defensive cap only — 50,000 products; §28's "hundreds or thousands" is far below this

export class SyncAlreadyRunningError extends Error {
  constructor() {
    super("A catalog sync is already running — refusing to start a second, concurrent run.");
    this.name = "SyncAlreadyRunningError";
  }
}

export class IncrementalSyncRequiresPriorFullSyncError extends Error {
  constructor() {
    super("No prior successful sync found — run a full sync at least once before an incremental sync.");
    this.name = "IncrementalSyncRequiresPriorFullSyncError";
  }
}

export interface SyncOutcome {
  runId: string;
  correlationId: string;
  status: "SUCCEEDED" | "FAILED";
  counters: SyncRunCounters;
  errorSummary?: string;
}

function emptyCounters(): SyncRunCounters {
  return {
    categoriesFetched: 0,
    productsFetched: 0,
    productsCreated: 0,
    productsUpdated: 0,
    productsDeactivated: 0,
    variantsDeactivated: 0,
  };
}

async function syncCategories(correlationId: string, counters: SyncRunCounters): Promise<Map<string, string>> {
  const { categories } = await erpCatalogAdapter.listCategories(correlationId);
  counters.categoriesFetched = categories.length;
  const idByErpId = new Map<string, string>();
  for (const erpCategory of categories) {
    const mapped = mapErpCategory(erpCategory);
    const websiteId = await upsertCategory(mapped);
    idByErpId.set(erpCategory.id, websiteId);
  }
  return idByErpId;
}

async function syncOneProduct(
  erpProduct: ErpCatalogProduct,
  categoryIdByErpId: Map<string, string>,
  counters: SyncRunCounters
): Promise<void> {
  const categoryId = categoryIdByErpId.get(erpProduct.categoryId);
  if (categoryId === undefined) {
    logger.warn({ erpProductId: erpProduct.id, erpCategoryId: erpProduct.categoryId }, "catalog-sync: product references an unknown ERP category — skipped");
    return;
  }

  const mapped = mapErpProduct(erpProduct);
  await db.$transaction(async (tx) => {
    const productResult = await upsertProduct(mapped, categoryId, tx);
    for (const variant of mapped.variants) {
      await upsertVariant(variant, productResult.id, tx);
    }
    if (productResult.wasCreated) counters.productsCreated++;
    else counters.productsUpdated++;
  });
}

interface FetchPagesResult {
  seenErpProductIds: string[];
  seenErpVariantIds: string[];
}

async function fetchAndUpsertAllPages(
  correlationId: string,
  categoryIdByErpId: Map<string, string>,
  counters: SyncRunCounters,
  filter: { status?: "active" | "discontinued" | "archived"; updatedSince?: Date } = {}
): Promise<FetchPagesResult> {
  const seenErpProductIds: string[] = [];
  const seenErpVariantIds: string[] = [];
  let skip = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { products, pagination } = await erpCatalogAdapter.listProducts(
      { ...filter, skip, limit: PAGE_SIZE },
      correlationId
    );
    counters.productsFetched += products.length;
    for (const erpProduct of products) {
      seenErpProductIds.push(erpProduct.id);
      for (const variant of erpProduct.variants) seenErpVariantIds.push(variant.id);
      await syncOneProduct(erpProduct, categoryIdByErpId, counters);
    }
    if (!pagination.hasMore) break;
    skip += PAGE_SIZE;
    if (page === MAX_PAGES - 1) {
      throw new Error(`catalog-sync: exceeded MAX_PAGES (${MAX_PAGES}) — aborting to avoid unbounded work`);
    }
  }
  return { seenErpProductIds, seenErpVariantIds };
}

async function runSync(
  type: "FULL" | "INCREMENTAL",
  work: (correlationId: string, counters: SyncRunCounters) => Promise<void>
): Promise<SyncOutcome> {
  const correlationId = randomUUID();
  await ensureSyncLockExists();
  const acquired = await tryAcquireSyncLock(correlationId);
  if (!acquired) {
    logger.warn({ correlationId, type }, "catalog-sync: refused to start — another sync is already running");
    throw new SyncAlreadyRunningError();
  }

  const runId = await createSyncRun(type, correlationId);
  const counters = emptyCounters();
  const log = logger.child({ correlationId, runId, type });
  log.info("catalog-sync: run started");

  try {
    await work(correlationId, counters);
    await completeSyncRun(runId, "SUCCEEDED", counters, null);
    log.info({ counters }, "catalog-sync: run succeeded");
    return { runId, correlationId, status: "SUCCEEDED", counters };
  } catch (err) {
    const errorSummary = err instanceof Error ? err.name : "UnknownError";
    await completeSyncRun(runId, "FAILED", counters, errorSummary);
    log.error({ counters, errorSummary, err }, "catalog-sync: run failed — no deactivation sweep applied, watermark not advanced");
    return { runId, correlationId, status: "FAILED", counters, errorSummary };
  } finally {
    await releaseSyncLock();
  }
}

/**
 * Populates the Website projection from ERP end to end. Never requests
 * `status=draft` (website-erp-catalog-sync.md §9). On full success only,
 * runs the deactivation sweep (§8) — anything ERP-managed that this run
 * did not see gets marked inactive. On any failure, the sweep is skipped
 * entirely and the watermark is not advanced, so nothing is falsely
 * deactivated and the next incremental run doesn't miss records.
 */
export async function runFullSync(): Promise<SyncOutcome> {
  return runSync("FULL", async (correlationId, counters) => {
    const categoryIdByErpId = await syncCategories(correlationId, counters);
    const { seenErpProductIds, seenErpVariantIds } = await fetchAndUpsertAllPages(correlationId, categoryIdByErpId, counters);
    counters.productsDeactivated = await deactivateMissingProducts(seenErpProductIds);
    counters.variantsDeactivated = await deactivateMissingVariants(seenErpVariantIds);
  });
}

/**
 * Fetches only ERP records updated since the last successful sync's own
 * start time. Cannot detect a product that disappeared from ERP's
 * default view (e.g. transitioned to draft) — that limitation is
 * unavoidable with an updatedSince-only feed and is documented in
 * website-erp-catalog-sync.md §11; only a full sync's sweep detects it.
 */
export async function runIncrementalSync(): Promise<SyncOutcome> {
  const since = await getLastSuccessfulSyncStartedAt();
  if (since === null) {
    throw new IncrementalSyncRequiresPriorFullSyncError();
  }
  return runSync("INCREMENTAL", async (correlationId, counters) => {
    const categoryIdByErpId = await syncCategories(correlationId, counters);
    await fetchAndUpsertAllPages(correlationId, categoryIdByErpId, counters, { updatedSince: since });
  });
}
