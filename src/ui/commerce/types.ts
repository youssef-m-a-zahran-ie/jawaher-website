import type { Money } from "@/domain/money";
import type { BadgeVariant } from "@/ui/primitives/badge";

export type ProductAvailability = "in_stock" | "low_stock" | "out_of_stock";

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
  imageAlt: string;
  badge?: { label: string; variant: BadgeVariant };
};
