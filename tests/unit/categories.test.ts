import { describe, expect, it } from "vitest";

import { CATEGORIES, getCategoryBySlug } from "@/ui/commerce/categories";
import { MOCK_PRODUCTS } from "@/ui/commerce/mock-products";

describe("CATEGORIES", () => {
  it("has exactly the five approved categories", () => {
    expect(CATEGORIES).toHaveLength(5);
  });

  it("has unique slugs", () => {
    const slugs = CATEGORIES.map((category) => category.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has exactly one featured category (dates, per the business's sales-mix guidance)", () => {
    const featured = CATEGORIES.filter((category) => category.featured);
    expect(featured).toHaveLength(1);
    expect(featured[0]?.slug).toBe("dates");
  });

  it("every category name matches at least one mock product's category exactly", () => {
    const mockCategoryNames = new Set(MOCK_PRODUCTS.map((product) => product.category));
    for (const category of CATEGORIES) {
      expect(mockCategoryNames.has(category.name)).toBe(true);
    }
  });

  it("getCategoryBySlug finds a known slug and returns undefined for an unknown one", () => {
    expect(getCategoryBySlug("dates")?.name).toBe("تمور");
    expect(getCategoryBySlug("not-a-category")).toBeUndefined();
  });
});
