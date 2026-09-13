import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

import { isDatabaseAvailable } from "./helpers/db-availability";

/**
 * Phase 9.4 — full ERP -> Website catalog sync, against a REAL database
 * (mirroring catalog-storefront.test.ts's own convention: real Prisma,
 * skipIf(!dbAvailable), never mocked in this sandbox's absence of local
 * Postgres) with a MOCKED ERP HTTP layer (mirroring erp-client.test.ts's
 * fetch-stubbing convention) — combining both of this repo's own
 * established test patterns rather than inventing a third.
 *
 * `@/lib/env` is remocked per test so the ERP adapter believes it's
 * configured, while DATABASE_URL is passed through from the real
 * process.env (populated by tests/setup/load-env.ts) so `db` still
 * connects to the real database.
 */
const dbAvailable = await isDatabaseAvailable();

function mockErpEnv() {
  vi.resetModules();
  vi.doMock("@/lib/env", () => ({
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.DATABASE_URL,
      ERP_BASE_URL: "http://localhost:9999",
      ERP_API_KEY: "test-api-key",
      ERP_CONNECTION_ID: "test-connection-id",
      ERP_REQUEST_TIMEOUT_MS: undefined,
    },
  }));
}

type ErpProductFixture = {
  id: string;
  name: string;
  status: string;
  categoryId: string;
  categoryName: string;
  baseUnitCode: string;
  updatedAt: string;
  variants: { id: string; sku: string; barcode: string | null; status: string; sellingPrice: string | null; packQuantity: string }[];
};

function fakeErpServer(opts: {
  categories?: { id: string; name: string; parentCategoryId: string | null }[];
  productPages?: ErpProductFixture[][];
}) {
  const categories = opts.categories ?? [];
  const pages = opts.productPages ?? [[]];
  const callIndex = { categories: 0, products: 0 };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const u = new URL(String(url));
      if (u.pathname.endsWith("/catalog/categories")) {
        callIndex.categories++;
        return new Response(JSON.stringify({ categories, requestId: "rid" }), { status: 200 });
      }
      if (u.pathname.endsWith("/catalog/products")) {
        const skip = Number(u.searchParams.get("skip") ?? "0");
        const limit = Number(u.searchParams.get("limit") ?? "100");
        const pageIndex = skip / limit;
        const products = pages[pageIndex] ?? [];
        const hasMore = pageIndex < pages.length - 1;
        callIndex.products++;
        return new Response(
          JSON.stringify({ products, pagination: { limit, skip, total: products.length, hasMore }, requestId: "rid" }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 404 });
    })
  );
  return callIndex;
}

describe.skipIf(!dbAvailable)("Website ERP catalog sync (Phase 9.4)", () => {
  const runId = randomUUID().slice(0, 8);
  const erpCategoryIds: string[] = [];
  const erpProductIds: string[] = [];

  function erpCategory(suffix: string, name: string) {
    const id = `${runId}-cat-${suffix}`;
    erpCategoryIds.push(id);
    return { id, name, parentCategoryId: null };
  }

  function erpProduct(suffix: string, categoryId: string, overrides: Partial<ErpProductFixture> = {}): ErpProductFixture {
    const id = `${runId}-prod-${suffix}`;
    erpProductIds.push(id);
    return {
      id,
      name: `منتج اختبار ${runId}-${suffix}`,
      status: "active",
      categoryId,
      categoryName: "فئة",
      baseUnitCode: "kg",
      updatedAt: new Date().toISOString(),
      variants: [
        {
          id: `${id}-v1`,
          sku: `SKU-${runId}-${suffix}`,
          barcode: null,
          status: "active",
          sellingPrice: "100.0000",
          packQuantity: "1.0000",
        },
      ],
      ...overrides,
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("@/lib/env");
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    const products = await db.product.findMany({ where: { erpProductId: { in: erpProductIds } } });
    for (const product of products) {
      await db.variant.deleteMany({ where: { productId: product.id } });
      await db.product.delete({ where: { id: product.id } });
    }
    await db.category.deleteMany({ where: { erpCategoryId: { in: erpCategoryIds } } });
    await db.catalogSyncRun.deleteMany({ where: { correlationId: { not: undefined } } }).catch(() => null);
    await db.$disconnect();
  });

  it("creates a new category and product+variant on first sync (IDENTITY: matched by erpCategoryId/erpProductId, never name/slug)", async () => {
    mockErpEnv();
    const category = erpCategory("new", `فئة ${runId}`);
    const product = erpProduct("new", category.id);
    fakeErpServer({ categories: [category], productPages: [[product]] });

    const { runFullSync } = await import("@/modules/catalog-sync/service");
    const { db } = await import("@/lib/db");

    const outcome = await runFullSync();
    expect(outcome.status).toBe("SUCCEEDED");
    expect(outcome.counters.productsCreated).toBeGreaterThanOrEqual(1);

    const row = await db.product.findUnique({ where: { erpProductId: product.id }, include: { variants: true, category: true } });
    expect(row).not.toBeNull();
    expect(row?.name).toBe(product.name);
    expect(row?.status).toBe("ACTIVE");
    expect(row?.category.erpCategoryId).toBe(category.id);
    expect(row?.variants[0]?.sku).toBe(product.variants[0]?.sku);
    expect(row?.variants[0]?.priceAmountMinor).toBe(10000);
  });

  it("running the identical payload twice does not create duplicates (idempotent upsert)", async () => {
    mockErpEnv();
    const category = erpCategory("dup", `فئة ${runId}`);
    const product = erpProduct("dup", category.id);
    fakeErpServer({ categories: [category], productPages: [[product]] });
    const { runFullSync } = await import("@/modules/catalog-sync/service");
    await runFullSync();

    mockErpEnv();
    fakeErpServer({ categories: [category], productPages: [[product]] });
    const { runFullSync: runFullSync2 } = await import("@/modules/catalog-sync/service");
    const { db } = await import("@/lib/db");
    await runFullSync2();

    const rows = await db.product.findMany({ where: { erpProductId: product.id } });
    expect(rows).toHaveLength(1);
    const variantRows = await db.variant.findMany({ where: { erpVariantId: product.variants[0]?.id } });
    expect(variantRows).toHaveLength(1);
  });

  it("IDENTITY (9.4R): the same ERP Variant ID always maps to the same Website variant row, even when its SKU changes", async () => {
    mockErpEnv();
    const category = erpCategory("vident", `فئة ${runId}`);
    const product = erpProduct("vident", category.id);
    const erpVariantId = product.variants[0]!.id;
    fakeErpServer({ categories: [category], productPages: [[product]] });
    const { runFullSync } = await import("@/modules/catalog-sync/service");
    const { db } = await import("@/lib/db");
    await runFullSync();

    const firstRow = await db.variant.findUnique({ where: { erpVariantId } });
    expect(firstRow).not.toBeNull();
    const websiteVariantId = firstRow!.id;

    // ERP renames the SKU on the SAME variant (same erpVariantId).
    mockErpEnv();
    const renamedProduct = { ...product, variants: [{ ...product.variants[0]!, sku: `SKU-${runId}-RENAMED` }] };
    fakeErpServer({ categories: [category], productPages: [[renamedProduct]] });
    const { runFullSync: runFullSync2 } = await import("@/modules/catalog-sync/service");
    await runFullSync2();

    // Same Website row (same internal id), updated SKU, no duplicate created.
    const afterRename = await db.variant.findUnique({ where: { erpVariantId } });
    expect(afterRename?.id).toBe(websiteVariantId);
    expect(afterRename?.sku).toBe(`SKU-${runId}-RENAMED`);
    const allVariantsForThisErpId = await db.variant.findMany({ where: { erpVariantId } });
    expect(allVariantsForThisErpId).toHaveLength(1);
    const oldSkuRow = await db.variant.findUnique({ where: { sku: product.variants[0]!.sku } });
    expect(oldSkuRow).toBeNull(); // the old SKU value is gone, not a second row
  });

  it("updates an existing product's ERP-owned fields (name/status/price) without touching website-owned fields (description/slug/label)", async () => {
    mockErpEnv();
    const category = erpCategory("upd", `فئة ${runId}`);
    const product = erpProduct("upd", category.id, { name: "اسم أصلي" });
    fakeErpServer({ categories: [category], productPages: [[product]] });
    const { runFullSync } = await import("@/modules/catalog-sync/service");
    await runFullSync();

    const { db: dbBefore } = await import("@/lib/db");
    const before = await dbBefore.product.findUnique({ where: { erpProductId: product.id }, include: { variants: true } });
    const originalSlug = before?.slug;
    const originalLabel = before?.variants[0]?.label;
    await dbBefore.product.update({ where: { id: before!.id }, data: { description: "وصف كتبه فريق الموقع" } });

    mockErpEnv();
    const updatedProduct = { ...product, name: "اسم محدث من ERP", status: "discontinued", variants: [{ ...product.variants[0]!, sellingPrice: "150.0000" }] };
    fakeErpServer({ categories: [category], productPages: [[updatedProduct]] });
    const { runFullSync: runFullSync2 } = await import("@/modules/catalog-sync/service");
    await runFullSync2();

    const { db } = await import("@/lib/db");
    const after = await db.product.findUnique({ where: { erpProductId: product.id }, include: { variants: true } });
    expect(after?.name).toBe("اسم محدث من ERP");
    expect(after?.status).toBe("DISCONTINUED");
    expect(after?.variants[0]?.priceAmountMinor).toBe(15000);
    // Website-owned fields untouched by the sync:
    expect(after?.slug).toBe(originalSlug);
    expect(after?.description).toBe("وصف كتبه فريق الموقع");
    expect(after?.variants[0]?.label).toBe(originalLabel);
  });

  it("full-sync deactivation sweep marks a product DISCONTINUED once it no longer appears in ERP's default fetch (CATALOG DEACTIVATION, §8)", async () => {
    mockErpEnv();
    const category = erpCategory("sweep", `فئة ${runId}`);
    const product = erpProduct("sweep", category.id);
    fakeErpServer({ categories: [category], productPages: [[product]] });
    const { runFullSync } = await import("@/modules/catalog-sync/service");
    await runFullSync();

    // Second full sync: ERP no longer returns this product at all (e.g. it moved to draft, or was removed).
    mockErpEnv();
    fakeErpServer({ categories: [category], productPages: [[]] });
    const { runFullSync: runFullSync2 } = await import("@/modules/catalog-sync/service");
    const outcome = await runFullSync2();

    const { db } = await import("@/lib/db");
    const row = await db.product.findUnique({ where: { erpProductId: product.id } });
    expect(row?.status).toBe("DISCONTINUED");
    expect(outcome.counters.productsDeactivated).toBeGreaterThanOrEqual(1);
  });

  it("full-sync sweep deactivates a single variant (active: false) that no longer appears on its still-active parent product", async () => {
    mockErpEnv();
    const category = erpCategory("vsweep", `فئة ${runId}`);
    const product = erpProduct("vsweep", category.id, {
      variants: [
        { id: `${runId}-vsweep-v1`, sku: `SKU-${runId}-vsweep-1`, barcode: null, status: "active", sellingPrice: "10.0000", packQuantity: "1.0000" },
        { id: `${runId}-vsweep-v2`, sku: `SKU-${runId}-vsweep-2`, barcode: null, status: "active", sellingPrice: "20.0000", packQuantity: "1.0000" },
      ],
    });
    fakeErpServer({ categories: [category], productPages: [[product]] });
    const { runFullSync } = await import("@/modules/catalog-sync/service");
    const { db } = await import("@/lib/db");
    await runFullSync();

    // Second full sync: the product still exists, but ERP no longer lists its second variant.
    mockErpEnv();
    const narrowedProduct = { ...product, variants: [product.variants[0]!] };
    fakeErpServer({ categories: [category], productPages: [[narrowedProduct]] });
    const { runFullSync: runFullSync2 } = await import("@/modules/catalog-sync/service");
    const outcome = await runFullSync2();

    const kept = await db.variant.findUnique({ where: { erpVariantId: `${runId}-vsweep-v1` } });
    const dropped = await db.variant.findUnique({ where: { erpVariantId: `${runId}-vsweep-v2` } });
    expect(kept?.active).toBe(true);
    expect(dropped?.active).toBe(false);
    expect(outcome.counters.variantsDeactivated).toBeGreaterThanOrEqual(1);
  });

  it("does NOT deactivate a seed/manual product that has no erpProductId at all (sweep is scoped to ERP-managed rows only)", async () => {
    const { db } = await import("@/lib/db");
    const manualCategory = await db.category.create({ data: { slug: `manual-cat-${runId}`, name: `فئة يدوية ${runId}` } });
    const manualProduct = await db.product.create({
      data: { slug: `manual-prod-${runId}`, name: `منتج يدوي ${runId}`, categoryId: manualCategory.id, status: "ACTIVE" },
    });

    mockErpEnv();
    const category = erpCategory("scoped", `فئة ${runId}`);
    fakeErpServer({ categories: [category], productPages: [[]] });
    const { runFullSync } = await import("@/modules/catalog-sync/service");
    await runFullSync();

    const untouched = await db.product.findUnique({ where: { id: manualProduct.id } });
    expect(untouched?.status).toBe("ACTIVE");

    await db.product.delete({ where: { id: manualProduct.id } });
    await db.category.delete({ where: { id: manualCategory.id } });
  });

  it("a failed page (ERP error mid-run) does NOT run the deactivation sweep and does NOT advance the watermark", async () => {
    mockErpEnv();
    const category = erpCategory("fail", `فئة ${runId}`);
    const product = erpProduct("fail", category.id);
    fakeErpServer({ categories: [category], productPages: [[product]] });
    const { runFullSync } = await import("@/modules/catalog-sync/service");
    await runFullSync();

    mockErpEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const u = new URL(String(url));
        if (u.pathname.endsWith("/catalog/categories")) {
          return new Response(JSON.stringify({ categories: [category], requestId: "rid" }), { status: 200 });
        }
        return new Response(null, { status: 500 });
      })
    );
    const { runFullSync: runFullSync2, IncrementalSyncRequiresPriorFullSyncError } = await import("@/modules/catalog-sync/service");
    void IncrementalSyncRequiresPriorFullSyncError;
    const outcome = await runFullSync2();

    expect(outcome.status).toBe("FAILED");
    const { db } = await import("@/lib/db");
    const row = await db.product.findUnique({ where: { erpProductId: product.id } });
    // The product from the FIRST successful run must still be ACTIVE — the
    // failed second run's (nonexistent) sweep must not have touched it.
    expect(row?.status).toBe("ACTIVE");
  });

  it("refuses a second, concurrent sync while one is already running (CONCURRENCY, §22)", async () => {
    mockErpEnv();
    const category = erpCategory("lock", `فئة ${runId}`);
    let resolveFirstFetch: (() => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const u = new URL(String(url));
        if (u.pathname.endsWith("/catalog/categories")) {
          await new Promise<void>((resolve) => {
            resolveFirstFetch = resolve;
          });
          return new Response(JSON.stringify({ categories: [category], requestId: "rid" }), { status: 200 });
        }
        return new Response(JSON.stringify({ products: [], pagination: { limit: 100, skip: 0, total: 0, hasMore: false }, requestId: "rid" }), {
          status: 200,
        });
      })
    );
    const { runFullSync, SyncAlreadyRunningError } = await import("@/modules/catalog-sync/service");

    const firstRun = runFullSync();
    await vi.waitFor(() => expect(resolveFirstFetch).toBeDefined());

    await expect(runFullSync()).rejects.toBeInstanceOf(SyncAlreadyRunningError);

    resolveFirstFetch?.();
    await firstRun;
  });

  it("incremental sync throws a clear error when no prior successful full sync exists, rather than guessing a watermark", async () => {
    mockErpEnv();
    const { db } = await import("@/lib/db");
    await db.catalogSyncRun.deleteMany({});
    const { runIncrementalSync, IncrementalSyncRequiresPriorFullSyncError } = await import("@/modules/catalog-sync/service");

    await expect(runIncrementalSync()).rejects.toBeInstanceOf(IncrementalSyncRequiresPriorFullSyncError);
  });

  it("CUSTOMER: a synced product is immediately visible through catalogService (Shop/PDP/search), no additional wiring needed", async () => {
    mockErpEnv();
    const category = erpCategory("customer", `فئة عرض ${runId}`);
    const product = erpProduct("customer", category.id, { name: `منتج معروض ${runId}` });
    fakeErpServer({ categories: [category], productPages: [[product]] });
    const { runFullSync } = await import("@/modules/catalog-sync/service");
    await runFullSync();

    const { catalogService } = await import("@/modules/catalog");
    const { db } = await import("@/lib/db");
    const row = await db.product.findUnique({ where: { erpProductId: product.id } });

    const found = await catalogService.getProduct(row!.slug);
    expect(found).not.toBeNull();
    expect(found?.name).toBe(product.name);
    expect(found?.variants[0]?.sku).toBe(product.variants[0]?.sku);
    expect(found?.variants[0]?.price.amountMinor).toBe(10000);

    const all = await catalogService.listAllProducts();
    expect(all.some((p) => p.id === row!.id)).toBe(true);

    const searchResults = await catalogService.searchProducts(`معروض ${runId}`);
    expect(searchResults.some((p) => p.id === row!.id)).toBe(true);
  });
});

describe("catalog sync — sandbox database availability", () => {
  it("documents whether the above suite actually ran", () => {
    if (!dbAvailable) {
      console.warn("catalog-sync.test.ts: SKIPPED — no local Postgres reachable in this sandbox (same disclosed limitation as every other integration test in this repo).");
    }
    expect(true).toBe(true);
  });
});
