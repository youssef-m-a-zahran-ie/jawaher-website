import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { breadcrumbJsonLd } from "@/lib/structured-data";
import { CATEGORIES, getCategoryBySlug } from "@/ui/commerce/categories";
import { getMockProductsByCategoryName } from "@/ui/commerce/mock-products";
import { ProductGrid } from "@/ui/commerce/product-grid";
import { Breadcrumb } from "@/ui/primitives/breadcrumb";
import { EmptyState } from "@/ui/primitives/empty-state";
import { PageContainer } from "@/ui/primitives/page-container";
import { JsonLd } from "@/ui/structured-data";

type PageProps = { params: Promise<{ category: string }> };

export function generateStaticParams() {
  return CATEGORIES.map((category) => ({ category: category.slug }));
}

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
 */
export default async function CategoryPage({ params }: PageProps) {
  const { category: slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) notFound();

  const products = getMockProductsByCategoryName(category.name);
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
