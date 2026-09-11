import { CATEGORIES } from "@/ui/commerce/categories";
import { CategoryTile } from "@/ui/commerce/category-tile";
import { MOCK_BEST_SELLERS } from "@/ui/commerce/mock-products";
import { ProductGrid } from "@/ui/commerce/product-grid";
import { Hero } from "@/ui/home/hero";
import { StoryTeaser } from "@/ui/home/story-teaser";
import { TrustStrip } from "@/ui/home/trust-strip";
import { PageContainer } from "@/ui/primitives/page-container";

/**
 * Section order matches docs/ux/ux-specification.md §4 exactly: Hero,
 * Categories, Best sellers, Trust strip, (Offers — omitted, no active
 * offer exists in mock data; the spec requires it be entirely absent
 * rather than shown empty), Story+Products-Experience teaser, Footer
 * (rendered by the root layout). No additional sections were added beyond
 * that order — the root layout's default title/description already cover
 * the homepage, so no metadata export is needed here either.
 *
 * "Best sellers" (below) is DELIBERATELY STILL `MOCK_BEST_SELLERS`, not
 * reconnected by Phase 9.1. That phase's brief named /shop, /shop/
 * [category], /product/[slug], and /search explicitly — this page wasn't
 * one of them, and "best seller" has no real backing concept to reconnect
 * to even if it had been: no "featured"/"bestseller" flag exists on the
 * real `Product`/`Variant` schema (confirmed, not just unpopulated — see
 * docs/integration/catalog-inventory-gap-analysis.md §9's classification
 * of this exact question as **C — requires a business decision**, not a
 * data-wiring task). Left as-is rather than silently reconnected to an
 * arbitrary substitute (e.g. "first N real products") that would quietly
 * invent a ranking the business never asked for.
 */
export default function HomePage() {
  const featuredCategory = CATEGORIES.find((category) => category.featured) ?? CATEGORIES[0];
  const otherCategories = CATEGORIES.filter((category) => category !== featuredCategory);

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
        <h2 className="mb-6 text-h2 font-extrabold text-text-primary">الأكثر مبيعًا</h2>
        <ProductGrid products={MOCK_BEST_SELLERS} />
      </PageContainer>

      <TrustStrip />
      <StoryTeaser />
    </>
  );
}
