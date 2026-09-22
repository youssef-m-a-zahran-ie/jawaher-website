import { logger } from "@/lib/logger";
import { catalogService } from "@/modules/catalog";
import { toCategoryCardDataList, toProductCardDataList } from "@/ui/commerce/catalog-adapters";
import { CategoryTile } from "@/ui/commerce/category-tile";
import { ProductGrid } from "@/ui/commerce/product-grid";
import { Hero } from "@/ui/home/hero";
import { StoryTeaser } from "@/ui/home/story-teaser";
import { TrustStrip } from "@/ui/home/trust-strip";
import { EmptyState } from "@/ui/primitives/empty-state";
import { PageContainer } from "@/ui/primitives/page-container";

/**
 * Section order matches docs/ux/ux-specification.md §4 exactly: Hero,
 * Categories, [Products], Trust strip, (Offers — omitted, no active offer
 * exists, and the spec requires it be entirely absent rather than shown
 * empty), Story+Products-Experience teaser, Footer (root layout).
 *
 * Phase 9.7 — the "الأكثر مبيعًا" (best sellers) section here was
 * `MOCK_BEST_SELLERS`, live on the real homepage, every product carrying a
 * literal "(اسم تجريبي)" sample suffix — a real customer saw fake products
 * under a claim ("best sellers") that isn't even a real, knowable business
 * fact today (no "featured"/"bestseller" flag exists on `Product`/
 * `Variant` — docs/integration/catalog-inventory-gap-analysis.md §9
 * classifies that as a business decision this phase does not make).
 * Replaced with real catalog data under an honest, non-invented title
 * ("منتجاتنا") — the first N real products, no ranking claimed.
 * `dynamic = "force-dynamic"` for the same reason /shop has it: this page
 * has no dynamic segment, so Next would otherwise bake one build's
 * catalog snapshot into a static page (shop/page.tsx's own comment).
 *
 * Phase 10 — the catalog fetch is wrapped in try/catch, unlike /shop and
 * /shop/[category] (which deliberately let a catalog failure throw to the
 * nearest error boundary): the homepage's Hero/Categories/TrustStrip/
 * StoryTeaser sections carry the brand identity this phase is specifically
 * about and must never go dark just because the "منتجاتنا" section's data
 * happens to be unavailable — a real, verified bug found via this phase's
 * own Playwright run (a catalog outage previously blanked the entire
 * homepage, including the logo/hero, not just the product grid). /shop
 * and PDP are a customer's deliberate destination for catalog data
 * specifically, so failing loudly there remains correct and is left
 * untouched — this fix is scoped to the homepage only.
 *
 * Category Catalog Reconnection — the category tiles below now come from
 * `catalogService.listCategories()` too (was the static `CATEGORIES`
 * constant), decorated via `toCategoryCardDataList` (icon/description
 * from `ui/commerce/categories.ts`'s presentation config — see that
 * file's own comment). Same try/catch-to-empty-array resilience as
 * products, for the same reason: a database outage must not blank the
 * whole homepage. An empty result skips the "تسوق حسب الفئة" section
 * entirely rather than rendering it with nothing in it.
 */
export const dynamic = "force-dynamic";

const HOMEPAGE_PRODUCT_COUNT = 8;

async function loadHomepageProducts() {
  try {
    return toProductCardDataList(await catalogService.listAllProducts()).slice(0, HOMEPAGE_PRODUCT_COUNT);
  } catch (err) {
    logger.warn({ err }, "homepage: catalog fetch failed — showing the brand sections without a product grid");
    return [];
  }
}

async function loadHomepageCategories() {
  try {
    return toCategoryCardDataList(await catalogService.listCategories());
  } catch (err) {
    logger.warn({ err }, "homepage: category fetch failed — hiding the 'shop by category' section");
    return [];
  }
}

export default async function HomePage() {
  const categories = await loadHomepageCategories();
  const featuredCategory = categories.find((category) => category.featured) ?? categories[0];
  const otherCategories = categories.filter((category) => category !== featuredCategory);
  const products = await loadHomepageProducts();

  return (
    <>
      <Hero />

      {featuredCategory && (
        <PageContainer className="py-16">
          <h2 className="mb-6 text-h2 font-extrabold text-text-primary">تسوق حسب الفئة</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <CategoryTile category={featuredCategory} size="lg" className="col-span-2" />
            {otherCategories.map((category) => (
              <CategoryTile key={category.slug} category={category} />
            ))}
          </div>
        </PageContainer>
      )}

      <PageContainer className="py-16">
        <h2 className="mb-6 text-h2 font-extrabold text-text-primary">منتجاتنا</h2>
        {products.length > 0 ? (
          <ProductGrid products={products} />
        ) : (
          <EmptyState title="لا توجد منتجات حاليًا" description="سنضيف منتجات قريبًا." />
        )}
      </PageContainer>

      <TrustStrip />
      <StoryTeaser />
    </>
  );
}
