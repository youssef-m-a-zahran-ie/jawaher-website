import { describe, expect, it } from "vitest";

import { getCategoryPresentation, type CategorySlug } from "@/ui/commerce/categories";

/**
 * Category Catalog Reconnection — this file used to test the static
 * `CATEGORIES` array as the source of category identity (slug/name). That
 * role now belongs to the real database (`catalogService.listCategories()`
 * — see `tests/integration/catalog-storefront.test.ts` for those,
 * DB-dependent, tests). What's left here is presentation-only: the icon/
 * description/"featured" config, tested directly since it has no database
 * dependency at all.
 */
const KNOWN_SLUGS: CategorySlug[] = ["dates", "honey", "oils", "nuts", "ghee"];

describe("getCategoryPresentation", () => {
  it("has a presentation entry for each of the five known launch categories", () => {
    for (const slug of KNOWN_SLUGS) {
      expect(getCategoryPresentation(slug)).toBeDefined();
    }
  });

  it("every known entry has a non-empty description and an icon component", () => {
    for (const slug of KNOWN_SLUGS) {
      const presentation = getCategoryPresentation(slug);
      expect(presentation?.description.length).toBeGreaterThan(0);
      expect(presentation?.icon).toBeDefined();
    }
  });

  it("has exactly one featured category (dates, per the business's sales-mix guidance)", () => {
    const featured = KNOWN_SLUGS.filter((slug) => getCategoryPresentation(slug)?.featured);
    expect(featured).toEqual(["dates"]);
  });

  it("returns undefined for a slug with no presentation entry, rather than throwing", () => {
    expect(getCategoryPresentation("not-a-category")).toBeUndefined();
  });
});
