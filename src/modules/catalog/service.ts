import { Money } from "@/domain/money";
import { catalogRepository, type CatalogProductRow, type CatalogVariantRow } from "@/modules/catalog/repository";
import { deriveAvailability, getAvailableQuantity, type AvailabilityState } from "@/modules/catalog/inventory";
import { db } from "@/lib/db";

export type VariantView = {
  id: string;
  sku: string;
  label: string;
  price: Money;
  compareAtPrice: Money | null;
  availability: AvailabilityState;
  active: boolean;
};

export type ProductView = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: { slug: string; name: string };
  hasMultipleVariants: boolean;
  variants: VariantView[];
};

/** Public interface — module-boundaries.md's Catalog row (getCategory/getProduct/listProducts). */
export const catalogService = {
  async getCategory(slug: string) {
    return catalogRepository.findCategoryBySlug(slug);
  },

  async listCategories() {
    return catalogRepository.listCategories();
  },

  async getProduct(slug: string): Promise<ProductView | null> {
    const row = await catalogRepository.findProductBySlugWithVariants(slug);
    if (!row || row.status !== "ACTIVE") return null;
    return mapProduct(row);
  },

  async listProductsByCategory(categorySlug: string): Promise<ProductView[]> {
    const rows = await catalogRepository.listActiveProductsByCategorySlug(categorySlug);
    return Promise.all(rows.map(mapProduct));
  },

  async listAllProducts(): Promise<ProductView[]> {
    const rows = await catalogRepository.listAllActiveProducts();
    return Promise.all(rows.map(mapProduct));
  },

  /** Phase 9.1 — backs the /search page against real data; see repository.ts's own comment on match fields/scope. */
  async searchProducts(query: string): Promise<ProductView[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const rows = await catalogRepository.searchActiveProducts(trimmed);
    return Promise.all(rows.map(mapProduct));
  },

  /** Used by Cart/Checkout to re-validate a line item against live data — never trust a client-supplied price/availability. */
  async getVariantForPurchase(variantId: string) {
    const variant = await catalogRepository.findVariantById(variantId);
    if (!variant || !variant.active || variant.product.status !== "ACTIVE") return null;
    const available = await getAvailableQuantity(db, variantId);
    return {
      variant,
      price: Money.fromMinor(variant.priceAmountMinor),
      availability: deriveAvailability(available),
      availableQuantity: available,
    };
  },
};

async function mapProduct(row: CatalogProductRow): Promise<ProductView> {
  const variants = await Promise.all(row.variants.map(mapVariant));
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: { slug: row.category.slug, name: row.category.name },
    hasMultipleVariants: row.variants.length > 1,
    variants,
  };
}

async function mapVariant(row: CatalogVariantRow): Promise<VariantView> {
  const available = await getAvailableQuantity(db, row.id);
  return {
    id: row.id,
    sku: row.sku,
    label: row.label,
    price: Money.fromMinor(row.priceAmountMinor),
    compareAtPrice: row.compareAtAmountMinor != null ? Money.fromMinor(row.compareAtAmountMinor) : null,
    availability: deriveAvailability(available),
    active: row.active,
  };
}
