import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isSampleContent } from "@/lib/content-integrity";
import { formatPrice } from "@/lib/format-price";
import { breadcrumbJsonLd } from "@/lib/structured-data";
import { catalogService } from "@/modules/catalog";
import { pickPrimaryVariant, toProductCardDataList } from "@/ui/commerce/catalog-adapters";
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

/**
 * Phase 9.1 — reconnected to `catalogService.getProduct()` (was
 * `getMockProductBySlug()`/`MOCK_PRODUCTS`). `generateStaticParams`
 * removed AND `dynamic = "force-dynamic"` added explicitly, for the same
 * reason as /shop and /shop/[category] (confirmed the hard way there —
 * `npm run build` genuinely queried the real database mid-build without
 * this): a real, changeable catalog must never be baked into a
 * build-time static page — see this phase's brief §12. Product JSON-LD
 * deliberately still NOT added — reconnecting the data path doesn't
 * resolve the actual reason it was withheld: `isSampleContent()`
 * (`src/lib/content-integrity.ts`) still returns true for every seeded
 * product today, and emitting structured data asserting real product
 * facts for admittedly-fake content would be exactly the "invented
 * product claim" prior phases' briefs forbid. Unlike indexability
 * (`generateMetadata` below), this is a blanket "not built yet" rather
 * than per-product, since no JSON-LD builder exists to call at all —
 * add one once real catalog content exists, gated the same way.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await catalogService.getProduct(slug);
  if (!product) return {};
  return {
    title: product.name,
    description: `${product.name} — ${product.category.name}، جواهر الخير.`,
    alternates: { canonical: `/product/${slug}` },
    // Phase 11R — corrected from Phase 11's blanket `robots: {index:false}`
    // on every PDP. Public Product Detail Pages are canonical, indexable
    // commerce pages by architecture (see this page's own comment below
    // and sitemap.ts) — there is no business requirement to keep real
    // products out of search. The only thing actually disqualifying a
    // page from indexing today is that ITS OWN data is still honestly
    // labeled sample content (`isSampleContent`) — checked per product,
    // not applied to the whole route. A real product (no marker) is
    // indexable the moment it exists; nothing here needs to change when
    // that happens.
    ...(isSampleContent(product.name) ? { robots: { index: false, follow: true } } : {}),
  };
}

const AVAILABILITY_LABEL: Record<string, { label: string; variant: "success" | "warning" | "neutral" }> = {
  in_stock: { label: "متوفر", variant: "success" },
  low_stock: { label: "ينفد قريبًا", variant: "warning" },
  out_of_stock: { label: "غير متوفر حاليًا", variant: "neutral" },
  /** Phase 9.5R — ERP could not be reached to verify; never shown as confirmed in-stock. */
  unknown: { label: "يتعذر التحقق من التوفر حاليًا", variant: "neutral" },
};

/**
 * A foundation-level PDP, not the full spec in
 * docs/ux/ux-specification.md §7 (no real gallery/variant chips — those
 * need real product media, still absent per
 * catalog-inventory-gap-analysis.md, and a full variant-picker UI prior
 * phases explicitly excluded). Reuses every applicable approved
 * primitive, unchanged. Phase 11 added the mobile sticky add-to-cart bar
 * (product-actions.tsx) — that piece didn't actually depend on either
 * missing thing.
 *
 * Phase 9.1 — the top-of-page price/availability/add-to-cart section is
 * shown for the product's "primary" variant (first active, else first at
 * all — `pickPrimaryVariant`, see catalog-adapters.ts for why this is a
 * safe derivation, not an invented rule) — the real catalog can now have
 * genuinely multiple variants per product, which the mock data never
 * modeled at all.
 */
export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await catalogService.getProduct(slug);
  if (!product) notFound();

  const primary = pickPrimaryVariant(product);
  if (!primary) notFound(); // a product with zero variants has nothing sellable to show

  const relatedProducts = await catalogService.listProductsByCategory(product.category.slug);
  const related = toProductCardDataList(relatedProducts.filter((item) => item.id !== product.id)).slice(0, 4);
  const availability = AVAILABILITY_LABEL[primary.availability];

  const breadcrumbItems = [
    { label: "الرئيسية", href: "/" },
    { label: "المتجر", href: "/shop" },
    { label: product.category.name, href: `/shop/${product.category.slug}` },
    { label: product.name },
  ];

  return (
    <PageContainer className="py-10">
      <JsonLd data={breadcrumbJsonLd(breadcrumbItems)} />
      <Breadcrumb items={breadcrumbItems} />

      <div className="mt-6 grid gap-8 sm:grid-cols-2 sm:gap-12">
        <ImagePlaceholder
          variant="feature"
          label={`صورة المنتج — ${product.name}`}
          caption="الصورة الحقيقية قادمة قريبًا"
        />

        <div className="flex flex-col gap-4">
          <p className="text-body-sm text-text-tertiary">{product.category.name}</p>
          <h1 className="text-h1 font-extrabold text-text-primary">{product.name}</h1>
          <Badge variant={availability.variant} className="w-fit">
            {availability.label}
          </Badge>
          <PriceDisplay price={primary.price} compareAtPrice={primary.compareAtPrice ?? undefined} size="lg" />

          <div className="mt-2">
            <ProductActions
              variantId={primary.id}
              productName={product.name}
              category={product.category.name}
              availability={primary.availability}
              hasMultipleVariants={product.hasMultipleVariants}
              priceLabel={formatPrice(primary.price)}
            />
          </div>

          <div className="mt-4">
            <Accordion
              items={[
                {
                  id: "description",
                  title: "الوصف",
                  content: product.description ?? `منتج من فئة ${product.category.name} — من جواهر الخير.`,
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
