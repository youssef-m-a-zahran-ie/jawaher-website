import { catalogService } from "@/modules/catalog";
import { toProductCardDataList } from "@/ui/commerce/catalog-adapters";
import { CATEGORIES } from "@/ui/commerce/categories";
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
 */
export const dynamic = "force-dynamic";

const HOMEPAGE_PRODUCT_COUNT = 8;

export default async function HomePage() {
  const featuredCategory = CATEGORIES.find((category) => category.featured) ?? CATEGORIES[0];
  const otherCategories = CATEGORIES.filter((category) => category !== featuredCategory);
  const products = toProductCardDataList(await catalogService.listAllProducts()).slice(0, HOMEPAGE_PRODUCT_COUNT);

  return (
    <>
      <Hero />

      <PageContainer className="py-16">
        <h2 className="mb-6 text-h2 font-extrabold text-text-primary">تسوق حسب الفئة</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <CategoryTile category={featuredCategory} size="lg" className="col-span-2" />
          {otherCategories.map((category) => (
            <CategoryTile key={category.slug} category={category} />
          ))}
        </div>
      </PageContainer>

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
