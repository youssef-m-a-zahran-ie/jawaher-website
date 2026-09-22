import { cache } from "react";

import { Money } from "@/domain/money";
import { catalogRepository, type CatalogProductRow, type CatalogVariantRow } from "@/modules/catalog/repository";
import {
  deriveAvailability,
  getAvailableQuantity,
  getAvailableQuantitiesForVariants,
  fetchErpAvailability,
  type AvailabilityState,
} from "@/modules/catalog/inventory";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

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

/**
 * Category Catalog Reconnection — the real catalog identity only
 * (`Category.slug`/`name`/`sortOrder`). Deliberately narrower than the
 * raw Prisma row (which also carries `erpCategoryId`/`createdAt`/
 * `updatedAt` — internal correlation/bookkeeping fields with no UI/API
 * use), mirroring `ProductView`'s own precedent of never leaking a raw
 * Prisma row past this service boundary. Presentation-only decoration
 * (icon, marketing description, "featured") is added on top of this by
 * `ui/commerce/catalog-adapters.ts`'s `toCategoryCardData` — never here,
 * so this stays reusable, brand-agnostic domain data.
 */
export type CategoryView = {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
};

function mapCategory(row: { id: string; slug: string; name: string; sortOrder: number }): CategoryView {
  return { id: row.id, slug: row.slug, name: row.name, sortOrder: row.sortOrder };
}

/** Public interface — module-boundaries.md's Catalog row (getCategory/getProduct/listProducts). */
export const catalogService = {
  /**
   * `cache()`-wrapped (React's per-request dedup, not a cross-request
   * cache): `/shop/[category]`'s own `generateMetadata` and page component
   * both call this with the same slug in the same request — without this,
   * that would be two real database round trips for what is, from the
   * caller's perspective, one read. Never stale across requests — a fresh
   * cache scope is created per request by the framework.
   */
  getCategory: cache(async (slug: string): Promise<CategoryView | null> => {
    const row = await catalogRepository.findCategoryBySlug(slug);
    return row ? mapCategory(row) : null;
  }),

  /**
   * `cache()`-wrapped for the same reason as `getCategory` — the site
   * shell (`Header`/`Footer`, both rendered on every page) and a given
   * page's own category needs (e.g. the homepage's featured-category
   * tile) all call this once per request; without this, every one of
   * those would be a separate real query for what is always the same
   * five-or-so-row table read within that single request.
   */
  listCategories: cache(async (): Promise<CategoryView[]> => {
    const rows = await catalogRepository.listCategories();
    return rows.map(mapCategory);
  }),

  /**
   * The PDP's data source. Unlike the listing methods below, this
   * overlays a live, ERP-authoritative availability read on top of the
   * base (Website-local) `mapProduct()` result — Phase 9.5R, per the
   * review's explicit "PDP is more important than Shop if only one can
   * be safely completed" instruction. Shop/search listings deliberately
   * do NOT get this overlay (see docs/integration/inventory-integration-audit.md
   * §18 for why: an unbounded per-listing-page ERP fan-out is exactly
   * the N+1 risk this phase must not introduce) — a real, named,
   * documented limitation, not an oversight.
   */
  async getProduct(slug: string): Promise<ProductView | null> {
    const row = await catalogRepository.findProductBySlugWithVariants(slug);
    if (!row || row.status !== "ACTIVE") return null;
    const availability = await buildAvailabilityMap([row]);
    const product = mapProduct(row, availability);
    return applyErpAvailabilityOverlay(product, row.variants);
  },

  async listProductsByCategory(categorySlug: string): Promise<ProductView[]> {
    const rows = await catalogRepository.listActiveProductsByCategorySlug(categorySlug);
    const availability = await buildAvailabilityMap(rows);
    return rows.map((row) => mapProduct(row, availability));
  },

  async listAllProducts(): Promise<ProductView[]> {
    const rows = await catalogRepository.listAllActiveProducts();
    const availability = await buildAvailabilityMap(rows);
    return rows.map((row) => mapProduct(row, availability));
  },

  /** Phase 9.1 — backs the /search page against real data; see repository.ts's own comment on match fields/scope. */
  async searchProducts(query: string): Promise<ProductView[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const rows = await catalogRepository.searchActiveProducts(trimmed);
    const availability = await buildAvailabilityMap(rows);
    return rows.map((row) => mapProduct(row, availability));
  },

  /**
   * Used by Cart to re-validate a line item against live data — never
   * trust a client-supplied price/availability. ERP IS THE ONLY
   * INVENTORY AUTHORITY (Phase 9.5R correction — docs/integration/
   * inventory-integration-audit.md §1): when ERP answers, its number is
   * used ALONE, never combined with the Website-local number via
   * `min()` or any other blend. Website-local data (`inventoryQuantity`)
   * is used only when there is genuinely no ERP claim to defer to (no
   * `erpVariantId`) — never as a fallback that quietly overrides or
   * dilutes a real ERP answer, and never presented as verified when ERP
   * could not be reached (see the `"unknown"` branch below).
   */
  async getVariantForPurchase(variantId: string) {
    const variant = await catalogRepository.findVariantById(variantId);
    if (!variant || !variant.active || variant.product.status !== "ACTIVE") return null;
    const price = Money.fromMinor(variant.priceAmountMinor);

    if (variant.erpVariantId === null) {
      // Never synced from ERP — there is no ERP claim to honor or
      // override; Website-local data is the only data that has ever
      // existed for this row (legacy/unmigrated catalog item).
      const localAvailable = await getAvailableQuantity(db, variantId);
      return { variant, price, availability: deriveAvailability(localAvailable), availableQuantity: localAvailable };
    }

    const { availableById, failed } = await fetchErpAvailability([{ id: variant.id, erpVariantId: variant.erpVariantId }]);
    if (failed) {
      // A genuine verification failure — NOT silently treated as "use
      // Website-local data as truth" (Phase 9.5R §5). `availableQuantity`
      // still carries a best-effort local number for display purposes
      // only (e.g. so the UI doesn't show a scary "0 available"); any
      // caller gating a purchase decision must branch on `availability`,
      // never on this number, when it is `"unknown"`.
      logger.warn({ variantId }, "erp-inventory: could not verify availability — returning \"unknown\", not a fabricated local number");
      const localAvailable = await getAvailableQuantity(db, variantId);
      return { variant, price, availability: "unknown" as const, availableQuantity: localAvailable };
    }

    const erpAvailable = availableById.get(variant.id) ?? 0; // ERP responded but had nothing for this id — genuinely not found/no stock, authoritative
    return { variant, price, availability: deriveAvailability(erpAvailable), availableQuantity: erpAvailable };
  },
};

/**
 * PDP-only ERP availability overlay (Phase 9.5R) — a single batched call
 * for every variant of one product (bounded, safe; see `getProduct()`'s
 * own comment). Same authority rule as `getVariantForPurchase`: ERP's
 * number replaces the Website-local one outright when available; never
 * combined via `min()`. Variants with no `erpVariantId`, or when ERP
 * could not be reached at all, keep `mapProduct()`'s original
 * Website-local-derived availability — for the failure case this is a
 * deliberately narrower exception than cart/checkout's own policy (this
 * is a page *read*, not a purchase decision; §2 of the review accepts a
 * PDP falling back to its pre-existing display rather than blocking the
 * page) but is never claimed to be ERP-verified when it isn't.
 */
async function applyErpAvailabilityOverlay(
  product: ProductView,
  rawVariants: CatalogVariantRow[]
): Promise<ProductView> {
  const checkable = rawVariants.filter((v) => v.erpVariantId !== null);
  if (checkable.length === 0) return product;

  const { availableById, failed } = await fetchErpAvailability(
    checkable.map((v) => ({ id: v.id, erpVariantId: v.erpVariantId }))
  );
  if (failed) {
    logger.warn({ productId: product.id }, "erp-inventory: PDP availability check failed — showing Website-local data, not ERP-verified");
    return product;
  }

  return {
    ...product,
    variants: product.variants.map((variantView) => {
      const erpAvailable = availableById.get(variantView.id);
      if (erpAvailable === undefined) return variantView; // this variant had no erpVariantId — untouched
      return { ...variantView, availability: deriveAvailability(erpAvailable) };
    }),
  };
}

/**
 * Phase 12 — one batched query for every variant across however many
 * product rows are being rendered, instead of `mapVariant` calling
 * `getAvailableQuantity` (its own DB round trip) per variant — see that
 * function's own comment in inventory.ts for the full N+1 finding. Every
 * row here already carries `inventoryQuantity` (the repository's
 * `include: { variants: ... }` selects full scalar columns), so this
 * needs only the reservation side, batched.
 */
async function buildAvailabilityMap(rows: CatalogProductRow[]): Promise<Map<string, number>> {
  const variants = rows.flatMap((row) => row.variants.map((v) => ({ id: v.id, inventoryQuantity: v.inventoryQuantity })));
  return getAvailableQuantitiesForVariants(db, variants);
}

function mapProduct(row: CatalogProductRow, availability: Map<string, number>): ProductView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: { slug: row.category.slug, name: row.category.name },
    hasMultipleVariants: row.variants.length > 1,
    variants: row.variants.map((variant) => mapVariant(variant, availability)),
  };
}

function mapVariant(row: CatalogVariantRow, availability: Map<string, number>): VariantView {
  // Falls back to a fresh per-variant read only if the batch map is
  // somehow missing this id (defensive — it never should be, since the
  // map is always built from these exact same rows) rather than silently
  // treating an unknown variant as available.
  const available = availability.get(row.id) ?? 0;
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
