import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { catalogService } from "@/modules/catalog";
import { toCategoryCardDataList, toProductCardDataList } from "@/ui/commerce/catalog-adapters";
import { isDatabaseAvailable } from "./helpers/db-availability";
import { cleanupTestData, createTestSessionAndCart } from "./helpers/fixtures";

/**
 * Phase 9.1 — proves the real data path the storefront pages (/shop,
 * /shop/[category], /product/[slug], /search) now use, end to end
 * against a real database. Skips (not fails) in this sandbox, which has
 * no local Postgres (see helpers/db-availability.ts's own disclosed
 * limitation, unchanged) — runs for real wherever a live database is
 * reachable (CI, or a developer machine with docker-compose up),
 * mirroring every other integration test in this directory.
 */
const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)("catalog storefront reconnection", () => {
  const runId = randomUUID().slice(0, 8);
  const categoryIds: string[] = [];
  const sessionIds: string[] = [];

  afterAll(async () => {
    // sessionIds first — cleanupTestData deletes each session's cart's
    // checkoutSessions/reservations before the category loop below tries
    // to delete the variants those reservations reference.
    await cleanupTestData({ sessionIds });
    for (const categoryId of categoryIds) {
      const products = await db.product.findMany({ where: { categoryId } });
      for (const product of products) {
        await db.variant.deleteMany({ where: { productId: product.id } });
        await db.product.delete({ where: { id: product.id } });
      }
      await db.category.delete({ where: { id: categoryId } }).catch(() => null);
    }
    await db.$disconnect();
  });

  async function seedOneProduct(opts: { active?: boolean; inventoryQuantity?: number } = {}) {
    const category = await db.category.create({ data: { slug: `test-cat-${runId}`, name: `فئة اختبار ${runId}` } });
    categoryIds.push(category.id);
    const product = await db.product.create({
      data: {
        slug: `test-prod-${runId}`,
        name: `منتج اختبار ${runId}`,
        description: "وصف اختبار",
        categoryId: category.id,
        status: opts.active === false ? "DISCONTINUED" : "ACTIVE",
      },
    });
    const variant = await db.variant.create({
      data: {
        productId: product.id,
        sku: `TEST-SKU-${runId}`,
        label: "500 جم",
        priceAmountMinor: 18500,
        inventoryQuantity: opts.inventoryQuantity ?? 10,
      },
    });
    return { category, product, variant };
  }

  it("catalogService.listAllProducts() surfaces a real seeded product — the /shop page's real data path", async () => {
    const { product } = await seedOneProduct();
    const products = await catalogService.listAllProducts();
    expect(products.some((p) => p.id === product.id)).toBe(true);
  });

  it("catalogService.listProductsByCategory(slug) filters correctly — the /shop/[category] page's real data path", async () => {
    const { category, product } = await seedOneProduct();
    const products = await catalogService.listProductsByCategory(category.slug);
    expect(products.map((p) => p.id)).toContain(product.id);
    const otherCategoryProducts = await catalogService.listProductsByCategory("nonexistent-category-slug");
    expect(otherCategoryProducts).toHaveLength(0);
  });

  it("catalogService.getProduct(slug) returns the product with its real variant — the PDP's real data path", async () => {
    const { product, variant } = await seedOneProduct();
    const found = await catalogService.getProduct(product.slug);
    expect(found).not.toBeNull();
    expect(found?.variants[0]?.sku).toBe(variant.sku);
    expect(found?.variants[0]?.price.amountMinor).toBe(18500);
  });

  it("catalogService.getProduct(slug) returns null for an unknown slug — drives the PDP's notFound()", async () => {
    expect(await catalogService.getProduct("this-slug-does-not-exist")).toBeNull();
  });

  it("catalogService.getProduct(slug) returns null for a DISCONTINUED product, not just a filtered variant", async () => {
    const { product } = await seedOneProduct({ active: false });
    expect(await catalogService.getProduct(product.slug)).toBeNull();
  });

  it("catalogService.searchProducts() matches by product name — the /search page's real data path", async () => {
    const { product } = await seedOneProduct();
    const results = await catalogService.searchProducts(`اختبار ${runId}`);
    expect(results.some((p) => p.id === product.id)).toBe(true);
  });

  it("catalogService.searchProducts() matches by category name too, same as the old mock behavior", async () => {
    const { category, product } = await seedOneProduct();
    const results = await catalogService.searchProducts(category.name);
    expect(results.some((p) => p.id === product.id)).toBe(true);
  });

  it("catalogService.searchProducts() returns an empty array for an empty/whitespace query", async () => {
    expect(await catalogService.searchProducts("")).toEqual([]);
    expect(await catalogService.searchProducts("   ")).toEqual([]);
  });

  it("catalogService.searchProducts() returns no results for a query matching nothing", async () => {
    await seedOneProduct();
    expect(await catalogService.searchProducts("zzz-no-such-product-zzz")).toEqual([]);
  });

  it("toProductCardDataList(...) over a real result renders the correct price via Money", async () => {
    await seedOneProduct();
    const cards = toProductCardDataList(await catalogService.listAllProducts());
    const card = cards.find((c) => c.name === `منتج اختبار ${runId}`);
    expect(card?.price.amountMinor).toBe(18500);
  });

  /**
   * Phase 12 — pins the batched N+1 fix (catalog/service.ts's
   * `buildAvailabilityMap`, inventory.ts's `getAvailableQuantitiesForVariants`):
   * a LISTING (not just the PDP, which already had its own ERP overlay
   * test elsewhere) must still correctly subtract an active reservation
   * from the raw `inventoryQuantity` column — the exact number the old,
   * removed per-variant `getAvailableQuantity` call used to compute.
   */
  it("a listing reflects reduced availability from a real active reservation, not the raw inventoryQuantity column", async () => {
    const { category, product, variant } = await seedOneProduct({ inventoryQuantity: 10 });
    const { session, cart } = await createTestSessionAndCart();
    sessionIds.push(session.id);
    const checkoutSession = await db.checkoutSession.create({
      data: { cartId: cart.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    await db.inventoryReservation.create({
      data: {
        variantId: variant.id,
        checkoutSessionId: checkoutSession.id,
        quantity: 7,
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const listed = await catalogService.listAllProducts();
    const found = listed.find((p) => p.id === product.id);
    // 10 on hand - 7 actively reserved = 3 available -> "low_stock" (<= LOW_STOCK_THRESHOLD of 5), never "in_stock".
    expect(found?.variants[0]?.availability).toBe("low_stock");

    const byCategory = await catalogService.listProductsByCategory(category.slug);
    expect(byCategory.find((p) => p.id === product.id)?.variants[0]?.availability).toBe("low_stock");
  });

  /**
   * Category Catalog Reconnection — the same real-data-path proof as the
   * product tests above, for `Header`/`Footer`/the homepage/`/shop/[category]`'s
   * now-real category source.
   */
  describe("categories", () => {
    it("catalogService.listCategories() surfaces a real seeded category, ordered by sortOrder", async () => {
      const first = await db.category.create({
        data: { slug: `test-cat-a-${runId}`, name: `فئة أ ${runId}`, sortOrder: 100 },
      });
      const second = await db.category.create({
        data: { slug: `test-cat-b-${runId}`, name: `فئة ب ${runId}`, sortOrder: 99 },
      });
      categoryIds.push(first.id, second.id);

      const categories = await catalogService.listCategories();
      const ids = categories.map((c) => c.id);
      expect(ids).toContain(first.id);
      expect(ids).toContain(second.id);
      // sortOrder 99 (second) must list before sortOrder 100 (first) — real ordering, not insertion order.
      expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
    });

    it("catalogService.getCategory(slug) returns the real category — the /shop/[category] page's existence check", async () => {
      const category = await db.category.create({ data: { slug: `test-cat-get-${runId}`, name: `فئة ${runId}` } });
      categoryIds.push(category.id);

      const found = await catalogService.getCategory(category.slug);
      expect(found?.id).toBe(category.id);
      expect(found?.name).toBe(category.name);
    });

    it("catalogService.getCategory(slug) returns null for an unknown slug — drives notFound()", async () => {
      expect(await catalogService.getCategory("this-category-does-not-exist")).toBeNull();
    });

    it("toCategoryCardDataList(...) decorates a real category, falling back to a generic icon/empty description for a slug with no presentation entry", async () => {
      const category = await db.category.create({ data: { slug: `test-cat-c-${runId}`, name: `فئة ج ${runId}` } });
      categoryIds.push(category.id);

      const cards = toCategoryCardDataList(await catalogService.listCategories());
      const card = cards.find((c) => c.slug === category.slug);
      expect(card?.name).toBe(category.name); // real catalog data, never overridden
      expect(card?.description).toBe(""); // no presentation entry for this test slug
      expect(card?.icon).toBeDefined(); // still gets a usable (generic) icon, never undefined
    });
  });
});
