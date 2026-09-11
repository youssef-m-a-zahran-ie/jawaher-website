import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { catalogService } from "@/modules/catalog";
import { toProductCardDataList } from "@/ui/commerce/catalog-adapters";
import { isDatabaseAvailable } from "./helpers/db-availability";

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

  afterAll(async () => {
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
});
