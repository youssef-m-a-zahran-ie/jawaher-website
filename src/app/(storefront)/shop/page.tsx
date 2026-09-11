import type { Metadata } from "next";

import { catalogService } from "@/modules/catalog";
import { toProductCardDataList } from "@/ui/commerce/catalog-adapters";
import { ProductGrid } from "@/ui/commerce/product-grid";
import { EmptyState } from "@/ui/primitives/empty-state";
import { Breadcrumb } from "@/ui/primitives/breadcrumb";
import { PageContainer } from "@/ui/primitives/page-container";

export const metadata: Metadata = {
  title: "المتجر",
  description: "تسوق كل منتجات جواهر الخير — تمور، عسل، زيوت، مكسرات وسمن.",
};

/**
 * Phase 9.1 — reconnected to the real, database-backed `catalogService`
 * (was `MOCK_PRODUCTS`; see docs/integration/catalog-inventory-gap-analysis.md).
 *
 * `dynamic = "force-dynamic"` is REQUIRED here, not optional: this route
 * has no dynamic segment, so Next.js's default behavior is to attempt to
 * statically prerender it at BUILD time — confirmed the hard way (`npm
 * run build` genuinely tried to query the real database during the
 * build, which would bake that build's product/price/availability
 * snapshot into a static page served to every visitor until the next
 * deploy). That is exactly the "caching that can cause incorrect catalog
 * behavior" this phase's brief (§12) forbids, so it's disabled explicitly
 * rather than left to an implicit heuristic.
 *
 * The "fast, filterable path to every product" page (requirements §2) —
 * filter/sort UI is still not built (unchanged from Phase 3 — no real
 * filterable dataset shape has been designed yet, not a data-source
 * limitation). See docs/planning/feature-completeness-audit.md's Phase 3
 * section.
 */
export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const products = toProductCardDataList(await catalogService.listAllProducts());

  return (
    <PageContainer className="py-10">
      <Breadcrumb items={[{ label: "الرئيسية", href: "/" }, { label: "المتجر" }]} />
      <h1 className="mb-6 mt-4 text-h1 font-extrabold text-text-primary">المتجر</h1>
      {products.length > 0 ? (
        <ProductGrid products={products} />
      ) : (
        <EmptyState title="لا توجد منتجات حاليًا" description="سنضيف منتجات قريبًا." />
      )}
    </PageContainer>
  );
}
