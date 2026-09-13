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
  imageAlt: string;
  badge?: { label: string; variant: BadgeVariant };
};
