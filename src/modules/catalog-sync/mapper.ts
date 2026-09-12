import type { ErpCatalogCategory, ErpCatalogProduct, ErpCatalogVariant } from "@/modules/erp-integration";

/**
 * ============================================================================
 * CATALOG SYNC — PURE MAPPING FUNCTIONS
 * ============================================================================
 * No I/O here — every function is a pure transformation, tested in
 * isolation without touching Prisma or the ERP client. Encodes the
 * ERP-owned vs. Website-owned field classification documented in
 * website-erp-catalog-sync.md §4/§8, so that document and this file
 * cannot silently drift apart.
 * ============================================================================
 */

/** ERP's `active`/`discontinued`/`archived`/`draft` collapsed onto the Website's own, smaller ProductStatus enum (ACTIVE/DISCONTINUED only — it has no ARCHIVED or DRAFT member, and none is added this phase). "archived" collapses onto DISCONTINUED — the existing safe deactivation convention (§18) — not a new status. "draft" is never expected here: this sync never requests status=draft (see §9), so it's mapped defensively to DISCONTINUED rather than throwing, in case ERP's default ever changes. */
export function mapErpProductStatus(erpStatus: string): "ACTIVE" | "DISCONTINUED" {
  return erpStatus === "active" ? "ACTIVE" : "DISCONTINUED";
}

/** A variant is purchasable only if ERP's own variant-level status says so — independent of the parent product's status (both are enforced; see repository.ts). */
export function isErpVariantActive(erpStatus: string): boolean {
  return erpStatus === "active";
}

/**
 * ERP prices are `Decimal(14,4)` strings (e.g. "185.0000") — never parsed
 * as a JS float, and never divided using JS's floating-point `/` operator
 * either. Converts to EGP piaster integers using `BigInt` exclusively, so
 * the 4-decimal-digit ERP value is rounded to 2-decimal-digit piasters
 * with genuinely exact integer division (rounding half up), not an
 * approximation. Deliberately not reusing `Money.fromDecimalString()`
 * (src/domain/money.ts): that function's regex intentionally accepts only
 * 1-2 fraction digits (a human-entered-price contract) and rejects ERP's
 * 4-digit wire format — widening it would loosen a shared domain
 * primitive's contract for a single caller's convenience, so this stays
 * local to the sync boundary.
 */
export function erpDecimalPriceToMinorUnits(erpDecimal: string): number {
  const match = /^(\d+)\.(\d{1,4})$/.exec(erpDecimal.trim());
  if (!match) {
    throw new TypeError(`Unexpected ERP price format: "${erpDecimal}" (expected e.g. "185.0000")`);
  }
  // BigInt() calls, not "n"-suffixed literals — this project's tsconfig
  // target (ES2017) predates BigInt literal syntax; the function form
  // works at any target and is exactly as exact.
  const wholeEgp = BigInt(match[1]);
  const fractionOfTenThousandths = BigInt(match[2].padEnd(4, "0")); // 0-9999, exact
  const totalTenThousandths = wholeEgp * BigInt(10_000) + fractionOfTenThousandths;
  // 1 piaster = 100 ten-thousandths of an EGP; +50 then integer-divide by 100 rounds to nearest piaster.
  const piastersTotal = (totalTenThousandths + BigInt(50)) / BigInt(100);
  return Number(piastersTotal);
}

/**
 * `Variant.label` is required (non-null) but ERP has no display-label
 * field at all (erp-catalog-inventory-api.md §17.3, unresolved gap) — used
 * ONLY when creating a brand-new variant that has no existing Website
 * label to preserve. Deterministically derived from ERP's own
 * `packQuantity` + the product's `baseUnitCode` (e.g. "0.5000" + "kg" ->
 * "0.5 kg") — real, structured, already-authoritative ERP data, not a
 * fabricated value. Trailing zeros are trimmed by pure string
 * manipulation (never parsed as a float) since this is display
 * formatting, not arithmetic.
 */
export function deriveFallbackVariantLabel(packQuantity: string, baseUnitCode: string): string {
  const trimmed = packQuantity.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return `${trimmed} ${baseUnitCode}`;
}

/**
 * `Category.slug`/`Product.slug` are required, unique, and ERP provides
 * no slug field at all — this codebase also has no existing mechanical
 * slug-generation rule to reuse (the seed data's slugs are hand-picked
 * English words, not derived from the Arabic `name` by any algorithm).
 * Inventing an Arabic-transliteration/slugify scheme here would be a new,
 * undocumented presentation convention — exactly what this phase must not
 * silently decide. Using the ERP id itself as the fallback slug is
 * deterministic, unique-by-construction, and fabricates nothing; it is
 * documented as a known limitation (website-erp-catalog-sync.md §18),
 * pending a real slug/URL-naming decision. ONLY used at creation time —
 * an existing slug is never overwritten (see repository.ts).
 */
export function deriveFallbackSlug(erpId: string): string {
  return `erp-${erpId}`;
}

export interface MappedCategory {
  erpCategoryId: string;
  name: string;
  fallbackSlug: string;
}

export function mapErpCategory(erp: ErpCatalogCategory): MappedCategory {
  return {
    erpCategoryId: erp.id,
    name: erp.name,
    fallbackSlug: deriveFallbackSlug(erp.id),
  };
}

export interface MappedVariant {
  sku: string;
  active: boolean;
  priceAmountMinor: number | null;
  fallbackLabel: string;
}

export function mapErpVariant(erp: ErpCatalogVariant, baseUnitCode: string): MappedVariant {
  return {
    sku: erp.sku,
    active: isErpVariantActive(erp.status),
    // A null sellingPrice is real ERP data (not yet priced) — never
    // defaulted to 0, which would make an unpriced item look free.
    // The repository skips overwriting price when this is null.
    priceAmountMinor: erp.sellingPrice != null ? erpDecimalPriceToMinorUnits(erp.sellingPrice) : null,
    fallbackLabel: deriveFallbackVariantLabel(erp.packQuantity, baseUnitCode),
  };
}

export interface MappedProduct {
  erpProductId: string;
  name: string;
  status: "ACTIVE" | "DISCONTINUED";
  fallbackSlug: string;
  variants: MappedVariant[];
}

export function mapErpProduct(erp: ErpCatalogProduct): MappedProduct {
  return {
    erpProductId: erp.id,
    name: erp.name,
    status: mapErpProductStatus(erp.status),
    fallbackSlug: deriveFallbackSlug(erp.id),
    variants: erp.variants.map((v) => mapErpVariant(v, erp.baseUnitCode)),
  };
}
