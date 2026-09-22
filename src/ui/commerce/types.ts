import type { ComponentType } from "react";

import type { Money } from "@/domain/money";
import type { BadgeVariant } from "@/ui/primitives/badge";

/**
 * "unknown" (Phase 9.5R) — ERP could not be reached to verify this
 * product's real availability; distinct from both `in_stock` (a false
 * confirmation) and `out_of_stock` (which could hide a genuinely
 * purchasable item during a transient ERP outage). See
 * src/modules/catalog/inventory.ts's own `AvailabilityState` (mirrored
 * here at the presentation layer) and docs/integration/
 * inventory-integration-audit.md §1/§5.
 */
export type ProductAvailability = "in_stock" | "low_stock" | "out_of_stock" | "unknown";

/**
 * The shape ProductCard renders — matches what the real Catalog
 * projection will eventually provide (docs/architecture/data-ownership.md
 * §1 Product/Variant), so swapping mock data for a real fetch later means
 * changing the data source, not this type or the component. Nothing here
 * is invented business/product information — see mock-products.ts for the
 * explicit "not real" labeling on the sample data itself.
 */
export type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  category: string;
  price: Money;
  compareAtPrice?: Money;
  availability: ProductAvailability;
  /** Quick-add is only offered for single-SKU products (requirements COM-004). */
  hasMultipleVariants: boolean;
  /**
   * Phase 9.7 — the real `Variant.id` `POST /api/v1/cart/items` actually
   * keys on, NOT `id` above (which is the parent Product's id — see
   * catalog-adapters.ts's own comment on why those must never be
   * conflated). Card-level quick-add only ever targets this one variant
   * (the same one `price`/`availability` above describe), so this is
   * unambiguous even for a multi-variant product's card.
   */
  primaryVariantId: string;
  imageAlt: string;
  badge?: { label: string; variant: BadgeVariant };
};

/**
 * Category Catalog Reconnection — `slug`/`name` are real catalog data
 * (`catalogService.listCategories()`/`getCategory()`, ultimately
 * `Category.slug`/`Category.name`); `description`/`icon`/`featured` are
 * presentation-only, decorated on top by `catalog-adapters.ts`'s
 * `toCategoryCardData` from `ui/commerce/categories.ts`'s config — never
 * the other way around. Mirrors `ProductCardData`'s own split between
 * real catalog fields and presentation-only ones (e.g. `badge`).
 */
export type CategoryCardData = {
  slug: string;
  name: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  featured?: boolean;
};
