import { describe, expect, it } from "vitest";

import { Money } from "@/domain/money";
import { pickPrimaryVariant, toProductCardData, toProductCardDataList } from "@/ui/commerce/catalog-adapters";
import type { ProductView, VariantView } from "@/modules/catalog";

/**
 * Phase 9.1 — pure-function tests for the mock->real reshaping layer.
 * No database needed (unlike tests/integration/catalog-storefront.test.ts,
 * which exercises the same functions against real `catalogService` data).
 */

function makeVariant(overrides: Partial<VariantView> = {}): VariantView {
  return {
    id: "variant-1",
    sku: "SKU-1",
    label: "500 جم",
    price: Money.fromMinor(10000),
    compareAtPrice: null,
    availability: "in_stock",
    active: true,
    ...overrides,
  };
}

function makeProduct(overrides: Partial<ProductView> = {}): ProductView {
  return {
    id: "product-1",
    slug: "test-product",
    name: "منتج اختبار",
    description: "وصف اختبار",
    category: { slug: "dates", name: "تمور" },
    hasMultipleVariants: false,
    variants: [makeVariant()],
    ...overrides,
  };
}

describe("pickPrimaryVariant", () => {
  it("returns the first active variant when one exists", () => {
    const inactive = makeVariant({ id: "v-inactive", active: false });
    const active = makeVariant({ id: "v-active", active: true });
    const product = makeProduct({ variants: [inactive, active] });

    expect(pickPrimaryVariant(product)?.id).toBe("v-active");
  });

  it("falls back to the first variant when none are active", () => {
    const first = makeVariant({ id: "v-1", active: false });
    const second = makeVariant({ id: "v-2", active: false });
    const product = makeProduct({ variants: [first, second] });

    expect(pickPrimaryVariant(product)?.id).toBe("v-1");
  });

  it("returns undefined for a product with zero variants", () => {
    const product = makeProduct({ variants: [] });
    expect(pickPrimaryVariant(product)).toBeUndefined();
  });
});

describe("toProductCardData", () => {
  it("maps a single-variant product's real fields onto ProductCardData", () => {
    const variant = makeVariant({ price: Money.fromMinor(18500), compareAtPrice: Money.fromMinor(22000) });
    const product = makeProduct({ variants: [variant], hasMultipleVariants: false });

    const card = toProductCardData(product);

    expect(card).toEqual({
      id: product.id,
      slug: product.slug,
      name: product.name,
      category: "تمور",
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      availability: "in_stock",
      hasMultipleVariants: false,
      primaryVariantId: variant.id,
      imageAlt: `صورة المنتج — ${product.name}`,
    });
  });

  it("never invents a badge (no bestseller concept exists in the real schema)", () => {
    const card = toProductCardData(makeProduct());
    expect(card?.badge).toBeUndefined();
  });

  it("omits compareAtPrice entirely (undefined, not null) when the variant has none", () => {
    const variant = makeVariant({ compareAtPrice: null });
    const card = toProductCardData(makeProduct({ variants: [variant] }));
    expect(card?.compareAtPrice).toBeUndefined();
  });

  it("returns null for a product with zero variants rather than fabricating one", () => {
    expect(toProductCardData(makeProduct({ variants: [] }))).toBeNull();
  });

  it("uses the first active variant's price/availability for a multi-variant product's card", () => {
    const cheap = makeVariant({ id: "v-1", price: Money.fromMinor(5000), availability: "out_of_stock", active: false });
    const real = makeVariant({ id: "v-2", price: Money.fromMinor(9000), availability: "in_stock", active: true });
    const product = makeProduct({ variants: [cheap, real], hasMultipleVariants: true });

    const card = toProductCardData(product);

    expect(card?.price).toEqual(real.price);
    expect(card?.availability).toBe("in_stock");
    expect(card?.hasMultipleVariants).toBe(true);
    expect(card?.primaryVariantId).toBe("v-2");
  });

  it("primaryVariantId is the real Variant.id, never the parent Product.id (Phase 9.7 quick-add fix)", () => {
    const variant = makeVariant({ id: "the-real-variant-id" });
    const product = makeProduct({ id: "the-product-id", variants: [variant] });

    const card = toProductCardData(product);

    expect(card?.id).toBe("the-product-id");
    expect(card?.primaryVariantId).toBe("the-real-variant-id");
  });
});

describe("toProductCardDataList", () => {
  it("filters out any product that maps to null, preserving the rest", () => {
    const withVariants = makeProduct({ id: "p1" });
    const withoutVariants = makeProduct({ id: "p2", variants: [] });

    const cards = toProductCardDataList([withVariants, withoutVariants]);

    expect(cards).toHaveLength(1);
    expect(cards[0]?.id).toBe("p1");
  });
});
