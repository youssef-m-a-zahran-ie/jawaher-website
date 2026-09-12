import { describe, expect, it } from "vitest";

import {
  erpDecimalPriceToMinorUnits,
  deriveFallbackVariantLabel,
  deriveFallbackSlug,
  mapErpProductStatus,
  isErpVariantActive,
  mapErpCategory,
  mapErpProduct,
} from "@/modules/catalog-sync/mapper";

/**
 * Phase 9.4 — pure mapping/derivation function tests. No Prisma, no
 * network — every function here is a pure transformation, matching this
 * repo's convention of testing pure logic directly (money.test.ts,
 * tax-policy.test.ts) rather than through an integration harness.
 */
describe("erpDecimalPriceToMinorUnits", () => {
  it("converts a whole-EGP ERP decimal string to piasters", () => {
    expect(erpDecimalPriceToMinorUnits("185.0000")).toBe(18500);
  });

  it("converts a small fractional value exactly", () => {
    expect(erpDecimalPriceToMinorUnits("0.2500")).toBe(25);
  });

  it("rounds a 4-digit fraction to the nearest piaster", () => {
    expect(erpDecimalPriceToMinorUnits("10.0037")).toBe(1000); // 0.37/100 rounds down
    expect(erpDecimalPriceToMinorUnits("10.0067")).toBe(1001); // 0.67/100 rounds up
  });

  it("handles the carry when rounding pushes the fraction to 100 piasters", () => {
    expect(erpDecimalPriceToMinorUnits("1.9999")).toBe(200);
  });

  it("handles a bare integer EGP amount with no fraction", () => {
    expect(erpDecimalPriceToMinorUnits("340.0000")).toBe(34000);
  });

  it("throws a clear error on an unexpected format rather than silently coercing", () => {
    expect(() => erpDecimalPriceToMinorUnits("not-a-price")).toThrow(TypeError);
    expect(() => erpDecimalPriceToMinorUnits("-5.0000")).toThrow(TypeError);
  });
});

describe("deriveFallbackVariantLabel", () => {
  it("trims trailing zeros from the pack quantity", () => {
    expect(deriveFallbackVariantLabel("0.5000", "kg")).toBe("0.5 kg");
  });

  it("collapses a whole quantity with no leftover decimal point", () => {
    expect(deriveFallbackVariantLabel("1.0000", "kg")).toBe("1 kg");
  });

  it("preserves meaningful trailing digits", () => {
    expect(deriveFallbackVariantLabel("0.2500", "kg")).toBe("0.25 kg");
  });
});

describe("deriveFallbackSlug", () => {
  it("is deterministic and derived only from the real ERP id — never fabricated text", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(deriveFallbackSlug(id)).toBe(`erp-${id}`);
    expect(deriveFallbackSlug(id)).toBe(deriveFallbackSlug(id));
  });
});

describe("mapErpProductStatus", () => {
  it("maps active -> ACTIVE", () => {
    expect(mapErpProductStatus("active")).toBe("ACTIVE");
  });

  it("maps discontinued -> DISCONTINUED", () => {
    expect(mapErpProductStatus("discontinued")).toBe("DISCONTINUED");
  });

  it("collapses archived onto the existing DISCONTINUED status — not a new invented status", () => {
    expect(mapErpProductStatus("archived")).toBe("DISCONTINUED");
  });

  it("defensively maps an unexpected value (including draft, which this sync never requests) to DISCONTINUED rather than crashing", () => {
    expect(mapErpProductStatus("draft")).toBe("DISCONTINUED");
  });
});

describe("isErpVariantActive", () => {
  it("is true only for an explicitly active ERP variant status", () => {
    expect(isErpVariantActive("active")).toBe(true);
    expect(isErpVariantActive("discontinued")).toBe(false);
    expect(isErpVariantActive("archived")).toBe(false);
    expect(isErpVariantActive("draft")).toBe(false);
  });
});

describe("mapErpCategory / mapErpProduct — composition", () => {
  it("maps a category, preserving the real ERP id and name", () => {
    const mapped = mapErpCategory({ id: "cat-1", name: "تمور", parentCategoryId: null });
    expect(mapped).toEqual({ erpCategoryId: "cat-1", name: "تمور", fallbackSlug: "erp-cat-1" });
  });

  it("maps a product with nested variants, deriving each variant's fallback label from packQuantity + baseUnitCode", () => {
    const mapped = mapErpProduct({
      id: "prod-1",
      name: "تمر مجدول",
      status: "active",
      categoryId: "cat-1",
      categoryName: "تمور",
      baseUnitCode: "kg",
      updatedAt: "2026-01-01T00:00:00.000Z",
      variants: [
        { id: "v1", sku: "SKU-1", barcode: null, status: "active", sellingPrice: "185.0000", packQuantity: "0.5000" },
      ],
    });
    expect(mapped.status).toBe("ACTIVE");
    expect(mapped.variants[0]).toEqual({
      sku: "SKU-1",
      active: true,
      priceAmountMinor: 18500,
      fallbackLabel: "0.5 kg",
    });
  });

  it("maps a null sellingPrice to a null priceAmountMinor — never fabricated as 0", () => {
    const mapped = mapErpProduct({
      id: "prod-2",
      name: "منتج غير مسعّر",
      status: "active",
      categoryId: "cat-1",
      categoryName: "تمور",
      baseUnitCode: "kg",
      updatedAt: "2026-01-01T00:00:00.000Z",
      variants: [
        { id: "v2", sku: "SKU-2", barcode: null, status: "active", sellingPrice: null, packQuantity: "1.0000" },
      ],
    });
    expect(mapped.variants[0]?.priceAmountMinor).toBeNull();
  });
});
