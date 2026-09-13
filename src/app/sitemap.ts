import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site-url";
import { CATEGORIES } from "@/ui/commerce/categories";

const POLICY_SLUGS = ["shipping", "returns", "payment", "privacy", "terms"];

/**
 * Deliberately excludes /product/[slug]. Phase 9.1 reconnected these
 * pages to the real, database-backed catalog (src/ui/commerce/mock-products.ts
 * is no longer their data source) — but the seeded content itself is
 * still explicitly labeled placeholder (every name carries a literal
 * " (اسم تجريبي)" suffix, prisma/seed.ts's SAMPLE_SUFFIX). Asking search
 * engines to index and rank pages whose own data admits they're fake
 * would be the same "fake-data-leaking-as-real" problem this project's
 * docs have always forbidden — the backend being real doesn't change
 * that. Add product URLs here once real (non-suffixed) catalog content
 * exists, not merely once a real pipe exists. /account and /search are
 * excluded too (not indexable content pages).
 *
 * Phase 11: this sitemap exclusion alone never stopped a crawler reaching
 * a PDP via Shop/Category/Search/Home's own internal links to it — closed
 * with a page-level `robots: {index:false}` on `/product/[slug]` itself
 * (that page's own `generateMetadata`), removed at the same trigger named
 * above.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/shop`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    ...CATEGORIES.map((category) => ({
      url: `${SITE_URL}/shop/${category.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    ...POLICY_SLUGS.map((slug) => ({
      url: `${SITE_URL}/policies/${slug}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
