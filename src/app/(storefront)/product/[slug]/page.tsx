import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { breadcrumbJsonLd } from "@/lib/structured-data";
import { CATEGORIES } from "@/ui/commerce/categories";
import { getMockProductBySlug, getMockProductsByCategoryName, MOCK_PRODUCTS } from "@/ui/commerce/mock-products";
import { PriceDisplay } from "@/ui/commerce/price-display";
import { ProductGrid } from "@/ui/commerce/product-grid";
import { Accordion } from "@/ui/primitives/accordion";
import { Badge } from "@/ui/primitives/badge";
import { Breadcrumb } from "@/ui/primitives/breadcrumb";
import { ImagePlaceholder } from "@/ui/primitives/image-placeholder";
import { PageContainer } from "@/ui/primitives/page-container";
import { JsonLd } from "@/ui/structured-data";
import { ProductActions } from "./product-actions";

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return MOCK_PRODUCTS.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = getMockProductBySlug(slug);
  if (!product) return {};
  return { title: product.name, description: `${product.name} — ${product.category}، جواهر الخير.` };
}

const AVAILABILITY_LABEL: Record<string, { label: string; variant: "success" | "warning" | "neutral" }> = {
  in_stock: { label: "متوفر", variant: "success" },
  low_stock: { label: "ينفد قريبًا", variant: "warning" },
  out_of_stock: { label: "غير متوفر حاليًا", variant: "neutral" },
};

/**
 * A foundation-level PDP, not the full spec in
 * docs/ux/ux-specification.md §7 (no real gallery/variant chips/sticky
 * add-to-cart bar — those need real product media and variant data that
 * don't exist yet). Establishes the route and reuses every applicable
 * approved primitive, per this phase's brief ("Phase 3 does NOT implement
 * the full catalog"). See docs/planning/feature-completeness-audit.md's
 * Phase 3 section for what's deferred and why.
 */
export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = getMockProductBySlug(slug);
  if (!product) notFound();

  const category = CATEGORIES.find((item) => item.name === product.category);
  const related = getMockProductsByCategoryName(product.category)
    .filter((item) => item.id !== product.id)
    .slice(0, 4);
  const availability = AVAILABILITY_LABEL[product.availability];

  const breadcrumbItems = [
    { label: "الرئيسية", href: "/" },
    { label: "المتجر", href: "/shop" },
    ...(category ? [{ label: category.name, href: `/shop/${category.slug}` }] : []),
    { label: product.name },
  ];

  return (
    <PageContainer className="py-10">
      <JsonLd data={breadcrumbJsonLd(breadcrumbItems)} />
      <Breadcrumb items={breadcrumbItems} />

      <div className="mt-6 grid gap-8 sm:grid-cols-2 sm:gap-12">
        <ImagePlaceholder variant="feature" label={product.imageAlt} caption="الصورة الحقيقية قادمة قريبًا" />

        <div className="flex flex-col gap-4">
          <p className="text-body-sm text-text-tertiary">{product.category}</p>
          <h1 className="text-h1 font-extrabold text-text-primary">{product.name}</h1>
          <Badge variant={availability.variant} className="w-fit">
            {availability.label}
          </Badge>
          <PriceDisplay price={product.price} compareAtPrice={product.compareAtPrice} size="lg" />

          <div className="mt-2">
            <ProductActions
              productId={product.id}
              productName={product.name}
              category={product.category}
              availability={product.availability}
              hasMultipleVariants={product.hasMultipleVariants}
            />
          </div>

          <div className="mt-4">
            <Accordion
              items={[
                {
                  id: "description",
                  title: "الوصف",
                  content: `منتج من فئة ${product.category} — من جواهر الخير.`,
                  defaultOpen: true,
                },
                {
                  id: "delivery",
                  title: "التوصيل",
                  content: "تفاصيل الشحن والتوصيل تُعرض عند إتمام الطلب.",
                },
              ]}
            />
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <div className="mt-16">
          <h2 className="mb-6 text-h2 font-extrabold text-text-primary">منتجات ذات صلة</h2>
          <ProductGrid products={related} />
        </div>
      )}
    </PageContainer>
  );
}
