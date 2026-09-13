import type { CurrencyCode } from "@/domain/money";
import { MINOR_UNITS_PER_MAJOR_UNIT } from "@/domain/money";
import type { ErpCatalogCategory, ErpCatalogProduct, ErpCatalogVariant } from "@/modules/erp-integration";

/**
 * ============================================================================
 * CATALOG SYNC — PURE MAPPING FUNCTIONS
 * ============================================================================
 * No I/O here — every function is a pure transformation, tested in
 * isolation without touching Prisma or the ERP client. Encodes the
 * ERP-owned vs. Website-owned/derived field classification documented in
 * website-erp-catalog-sync.md §4, so that document and this file cannot
 * silently drift apart.
 *
 * FIELD OWNERSHIP (website-erp-catalog-sync.md §4 — the authoritative
 * version; kept here too so the two cannot drift):
 *
 *   Field                    | Owner            | Sync behavior
 *   --------------------------|------------------|---------------------------------
 *   Product.name              | ERP              | always overwritten
 *   Product.description       | Website          | never touched (ERP has no field)
 *   Product.status            | ERP (mapped)      | always overwritten + sweep
 *   Product.categoryId        | ERP (relationship)| always overwritten
 *   Product.slug              | Website (derived at creation only) | set once, never overwritten
 *   Variant.sku                | ERP (business id, NOT sync identity) | always overwritten
 *   Variant.erpVariantId        | ERP (sync identity)| set once, matched on
 *   Variant.priceAmountMinor   | ERP              | overwritten only when ERP returned a real price
 *   Variant.currency            | Website (convention — ERP has no currency concept) | never touched
 *   Variant.active               | ERP (mapped)     | always overwritten + sweep
 *   Variant.label                | Website (derived at creation only) | set once, never overwritten
 *   Variant.compareAtAmountMinor | Website/Promotions | never touched
 *   Variant.inventoryQuantity    | — (out of scope)| never touched (strict non-goal)
 *   Category.name                | ERP              | always overwritten
 *   Category.erpCategoryId        | ERP (sync identity)| set once, matched on
 *   Category.slug                 | Website (derived at creation only) | set once, never overwritten
 *   media (any field)              | — (no Website column exists) | not synced
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

/** ERP's own fixed wire-format decimal scale (Decimal(14,4) — see erp-catalog-inventory-api.md §7) — a property of the ERP contract, unrelated to which currency the Website happens to use. */
const ERP_DECIMAL_SCALE_DIGITS = 4;

/**
 * ERP prices are `Decimal(14,4)` strings (e.g. "185.0000") — never parsed
 * as a JS float, and never divided using JS's floating-point `/` operator
 * either. Converts to the given currency's minor units using `BigInt`
 * exclusively, with genuinely exact integer division (rounding half up),
 * not an approximation. The minor-unit scale (100 for EGP) is derived
 * from `Money`'s own `MINOR_UNITS_PER_MAJOR_UNIT` (src/domain/money.ts) —
 * not a second, independently-hardcoded assumption — so this function is
 * a generic major-decimal-to-minor-integer conversion, not an
 * EGP-specific one; `currency` defaults to "EGP" only because that is
 * the Website's one and only supported currency today (unchanged by this
 * phase — no multi-currency support is introduced or implied).
 *
 * Deliberately not reusing `Money.fromDecimalString()` directly: that
 * function's regex intentionally accepts only 1-2 fraction digits (a
 * human-entered-price contract) and rejects ERP's 4-digit wire format —
 * widening it would loosen a shared domain primitive's contract for a
 * single caller's convenience, so the parsing stays local to the sync
 * boundary while the minor-unit scale itself is still shared.
 */
export function erpDecimalPriceToMinorUnits(erpDecimal: string, currency: CurrencyCode = "EGP"): number {
  const match = new RegExp(`^(\\d+)\\.(\\d{1,${ERP_DECIMAL_SCALE_DIGITS}})$`).exec(erpDecimal.trim());
  if (!match) {
    throw new TypeError(`Unexpected ERP price format: "${erpDecimal}" (expected e.g. "185.0000")`);
  }
  const minorUnitsPerMajor = MINOR_UNITS_PER_MAJOR_UNIT[currency];

  // BigInt() calls, not "n"-suffixed literals — this project's tsconfig
  // target (ES2017) predates BigInt literal syntax; the function form
  // works at any target and is exactly as exact.
  const sourceScale = BigInt(10 ** ERP_DECIMAL_SCALE_DIGITS); // e.g. 10000 for 4 ERP decimal digits
  const targetScale = BigInt(minorUnitsPerMajor); // e.g. 100 for EGP piasters
  const wholeMajorUnits = BigInt(match[1]);
  const fractionAtSourceScale = BigInt(match[2].padEnd(ERP_DECIMAL_SCALE_DIGITS, "0")); // 0..sourceScale-1, exact
  const totalAtSourceScale = wholeMajorUnits * sourceScale + fractionAtSourceScale;

  // Rescale from the ERP's source precision to the currency's minor-unit
  // precision, rounding half up, using only exact integer arithmetic.
  const minorUnitsTotal = (totalAtSourceScale * targetScale + sourceScale / BigInt(2)) / sourceScale;
  return Number(minorUnitsTotal);
}

/**
 * `Variant.label` is required (non-null) but ERP has no display-label
 * field at all (erp-catalog-inventory-api.md §17.3, unresolved gap) — used
 * ONLY when creating a brand-new variant that has no existing Website
 * label to preserve. Deterministically DERIVED from ERP's own
 * `packQuantity` + the product's `baseUnitCode` (e.g. "0.5000" + "kg" ->
 * "0.5 kg") — real, structured, already-authoritative ERP data, not a
 * fabricated value — but the resulting label itself is Website-owned
 * presentation content once created (§4 above: never overwritten by a
 * later sync). Trailing zeros are trimmed by pure string manipulation
 * (never parsed as a float) since this is display formatting, not
 * arithmetic.
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
 * pending a real slug/URL-naming decision. Slug remains Website-owned —
 * a presentation/URL concern (§4 above) — ONLY used at creation time; an
 * existing slug is never overwritten (see repository.ts).
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
  /** The sync identity (unique, matched on) — never `sku`. See §7/§5 of website-erp-catalog-sync.md. */
  erpVariantId: string;
  /** ERP-owned business identifier, synced/overwritten on every update — but NOT the match key, so a SKU rename in ERP updates the existing row rather than creating a duplicate. */
  sku: string;
  active: boolean;
  priceAmountMinor: number | null;
  fallbackLabel: string;
}

export function mapErpVariant(erp: ErpCatalogVariant, baseUnitCode: string): MappedVariant {
  return {
    erpVariantId: erp.id,
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
