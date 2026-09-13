import type { ProductView, VariantView } from "@/modules/catalog";
import type { ProductCardData } from "@/ui/commerce/types";

/**
 * Phase 9.1 — the ONLY place a real `catalogService` result gets reshaped
 * into the UI's existing `ProductCardData`/display contract. `ProductCard`/
 * `ProductGrid`/`PriceDisplay`/`QuickAddButton` are unchanged by this
 * phase — every adaptation the real catalog's genuinely-richer shape
 * (multiple real variants, no media, no bestseller flag) requires lives
 * here, not scattered across page components.
 *
 * Every choice below is a safe, non-inventive derivation (Phase 9.0/9.1
 * classification "A" — see catalog-inventory-gap-analysis.md §2), never a
 * fabricated business fact:
 * - `imageAlt`: no media exists on either side (confirmed) — a generic,
 *   honest "no real photo yet" label, matching the existing
 *   `ImagePlaceholder` primitive's own stated purpose.
 * - `badge`: omitted entirely — no "bestseller"/"featured" concept exists
 *   in the real schema (confirmed absent, not just unpopulated).
 * - price/availability for a multi-variant product's CARD: the first
 *   ACTIVE variant (falling back to the first variant at all, so a fully
 *   inactive product still renders a card rather than silently
 *   disappearing — this preserves the existing "always show a card, mark
 *   it unavailable" behavior instead of inventing a new hide-when-
 *   out-of-stock rule, which is an open, undecided business question per
 *   the Phase 9.0 audit).
 */

/** The variant a product's card/PDP-level price and availability are shown for, when more than one exists. */
export function pickPrimaryVariant(product: ProductView): VariantView | undefined {
  return product.variants.find((v) => v.active) ?? product.variants[0];
}

export function toProductCardData(product: ProductView): ProductCardData | null {
  const primary = pickPrimaryVariant(product);
  if (!primary) return null; // a product with zero variants has nothing sellable to show — never fabricate one

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    category: product.category.name,
    price: primary.price,
    compareAtPrice: primary.compareAtPrice ?? undefined,
    availability: primary.availability,
    hasMultipleVariants: product.hasMultipleVariants,
    primaryVariantId: primary.id,
    imageAlt: `صورة المنتج — ${product.name}`,
  };
}

export function toProductCardDataList(products: ProductView[]): ProductCardData[] {
  return products.map(toProductCardData).filter((p): p is ProductCardData => p !== null);
}
