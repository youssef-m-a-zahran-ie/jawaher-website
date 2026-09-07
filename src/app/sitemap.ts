import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site-url";
import { CATEGORIES } from "@/ui/commerce/categories";

const POLICY_SLUGS = ["shipping", "returns", "payment", "privacy", "terms"];

/**
 * Deliberately excludes /product/[slug]: every product right now is
 * labeled mock data (src/ui/commerce/mock-products.ts) — asking search
 * engines to index placeholder product pages would be exactly the kind of
 * fake-data-leaking-as-real this phase's brief forbids. Add product URLs
 * here once a real catalog replaces the mock one. /account and /search are
 * excluded too (not indexable content pages).
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
