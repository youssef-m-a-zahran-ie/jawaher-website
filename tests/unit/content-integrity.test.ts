import { describe, expect, it } from "vitest";

import { isSampleContent } from "@/lib/content-integrity";

/**
 * Phase 11R — this predicate is what makes the sitemap/PDP indexing
 * strategy self-correcting (sitemap.ts, product/[slug]/page.tsx's
 * `generateMetadata`): a real product (no marker) must be indexable the
 * instant it exists, with zero code change — these tests pin that
 * behavior directly, since a false positive/negative here would silently
 * mis-index either fake or real catalog content.
 */
describe("isSampleContent", () => {
  it("recognizes the exact seed-data marker", () => {
    expect(isSampleContent("تمر مجدول (اسم تجريبي)")).toBe(true);
  });

  it("returns false for a real-looking product name with no marker", () => {
    expect(isSampleContent("تمر مجدول فاخر")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isSampleContent("")).toBe(false);
  });
});
