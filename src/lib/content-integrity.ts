/**
 * Phase 11R — the one place the app tells real catalog content apart from
 * the seeded sample/placeholder data (`prisma/seed.ts`'s `SAMPLE_SUFFIX`,
 * literal `" (اسم تجريبي)"`). This is a **content-readiness check, not an
 * SEO-strategy decision**: Product Detail Pages as a route type are
 * public, canonical commerce pages and are indexable by default (see
 * `src/app/sitemap.ts` and `src/app/(storefront)/product/[slug]/page.tsx`'s
 * own comments) — the only thing this function gates is whether a given
 * product's *current data* is honestly-labeled fake content that must
 * not be indexed or listed in the sitemap yet. Once real product names
 * (no suffix) replace the seed data, every product this function checks
 * automatically becomes indexable — no code change, no manual flag flip,
 * because the check is against the data itself, not a route-level switch.
 *
 * Deliberately duplicated as a literal string rather than importing
 * `prisma/seed.ts` into application code — that file is a one-shot script
 * (calls `main()`/disconnects at module scope) and importing it here would
 * run it as a side effect. If the marker ever changes, update both.
 */
const SAMPLE_CONTENT_MARKER = " (اسم تجريبي)";

export function isSampleContent(name: string): boolean {
  return name.includes(SAMPLE_CONTENT_MARKER);
}
