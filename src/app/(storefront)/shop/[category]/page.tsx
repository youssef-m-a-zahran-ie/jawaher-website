import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { breadcrumbJsonLd } from "@/lib/structured-data";
import { catalogService } from "@/modules/catalog";
import { getCategoryBySlug } from "@/ui/commerce/categories";
import { toProductCardDataList } from "@/ui/commerce/catalog-adapters";
import { ProductGrid } from "@/ui/commerce/product-grid";
import { Breadcrumb } from "@/ui/primitives/breadcrumb";
import { EmptyState } from "@/ui/primitives/empty-state";
import { PageContainer } from "@/ui/primitives/page-container";
import { JsonLd } from "@/ui/structured-data";

type PageProps = { params: Promise<{ category: string }> };

/**
 * Phase 9.1 — `generateStaticParams` REMOVED (was a static list from
 * `CATEGORIES`) and `dynamic = "force-dynamic"` added explicitly. With
 * static params present, Next.js would pre-render each category page at
 * build time, baking in whatever `catalogService` returned then —
 * confirmed the hard way on the sibling /shop page (`npm run build`
 * genuinely queried the real database mid-build) — exactly the "caching
 * that can cause incorrect catalog behavior" this phase's brief (§12)
 * forbids, now that real, changeable product data is behind this page.
 * Every request renders fresh instead; five categories at today's scale
 * makes this a non-issue performance-wise.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category: slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) return {};
  return { title: category.name, description: category.description };
}

/**
 * "Structurally identical across all five categories: intro, best sellers,
 * grid..." (docs/ux/ux-specification.md §5). Filter/sort UI is
 * intentionally not built (see the /shop page's comment — same reasoning);
 * the subcategory/type filter set it would need is an open ERP dependency
 * (requirements §25).
 *
 * Phase 9.1 — products reconnected to `catalogService.listProductsByCategory()`
 * (was `getMockProductsByCategoryName()`), keyed by the route's own slug —
 * the real `Category.slug` column, not a name-matching lookup.
 */
export default async function CategoryPage({ params }: PageProps) {
  const { category: slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) notFound();

  const products = toProductCardDataList(await catalogService.listProductsByCategory(slug));
  const breadcrumbItems = [
    { label: "الرئيسية", href: "/" },
    { label: "المتجر", href: "/shop" },
    { label: category.name },
  ];

  return (
    <PageContainer className="py-10">
      <JsonLd data={breadcrumbJsonLd(breadcrumbItems)} />
      <Breadcrumb items={breadcrumbItems} />
      <h1 className="mb-2 mt-4 text-h1 font-extrabold text-text-primary">{category.name}</h1>
      <p className="mb-8 max-w-xl text-body text-text-secondary">{category.description}</p>

      {products.length > 0 ? (
        <ProductGrid products={products} />
      ) : (
        <EmptyState title="لا توجد منتجات في هذه الفئة حاليًا" description="سنضيف منتجات قريبًا." />
      )}
    </PageContainer>
  );
}
