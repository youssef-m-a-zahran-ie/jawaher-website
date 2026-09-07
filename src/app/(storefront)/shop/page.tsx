import type { Metadata } from "next";

import { MOCK_PRODUCTS } from "@/ui/commerce/mock-products";
import { ProductGrid } from "@/ui/commerce/product-grid";
import { Breadcrumb } from "@/ui/primitives/breadcrumb";
import { PageContainer } from "@/ui/primitives/page-container";

export const metadata: Metadata = {
  title: "المتجر",
  description: "تسوق كل منتجات جواهر الخير — تمور، عسل، زيوت، مكسرات وسمن.",
};

/**
 * The "fast, filterable path to every product" page (requirements §2) —
 * Phase 3 ships the grid only; filter/sort UI is not built yet (no real
 * filterable dataset exists behind it), per this phase's brief ("Phase 3
 * does NOT implement the full catalog"). See
 * docs/planning/feature-completeness-audit.md's Phase 3 section.
 */
export default function ShopPage() {
  return (
    <PageContainer className="py-10">
      <Breadcrumb items={[{ label: "الرئيسية", href: "/" }, { label: "المتجر" }]} />
      <h1 className="mb-6 mt-4 text-h1 font-extrabold text-text-primary">المتجر</h1>
      <ProductGrid products={MOCK_PRODUCTS} />
    </PageContainer>
  );
}
