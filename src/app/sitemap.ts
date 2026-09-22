import type { MetadataRoute } from "next";

import { isSampleContent } from "@/lib/content-integrity";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { SITE_URL } from "@/lib/site-url";
import { catalogService } from "@/modules/catalog";

const POLICY_SLUGS = ["shipping", "returns", "payment", "privacy", "terms"];

/**
 * Phase 11R — corrected from Phase 9.1/11's blanket exclusion of every
 * `/product/[slug]` URL. Public PDPs are canonical, indexable commerce
 * pages by architecture (`product/[slug]/page.tsx`'s own comment) — a
 * sitemap should list exactly the pages that ARE indexable, so it now
 * queries the real catalog and includes each product whose OWN data
 * isn't still labeled sample content (`isSampleContent`, the same check
 * `generateMetadata` uses for the per-product `noindex`) — never the
 * whole route type. This is genuinely new for a sitemap generator (no
 * DB dependency before this phase): failure degrades to the static
 * pages only, exactly like the homepage/`/experience` catalog-read
 * fixes from Phase 10/11 — a sitemap that's temporarily missing products
 * is far better than a sitemap request that 500s.
 *
 * /account, /checkout, /track, /search remain excluded — not a content-
 * readiness question, they're private/transactional/utility pages by
 * nature (`robots.ts` and each page's own `generateMetadata` already
 * carry the matching `noindex`, kept in sync intentionally).
 */
// Same reasoning as /shop's own `dynamic = "force-dynamic"`: a real,
// changeable product list must never be baked into a build-time static
// sitemap (confirmed elsewhere the hard way — `npm run build` genuinely
// queries the database mid-build without this).
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Phase 13 — matches robots.ts's own environment check exactly (see its
  // comment for why `APP_ENV`, not `NODE_ENV`): a non-production
  // deployment has nothing worth advertising for crawling — an empty
  // sitemap is a stronger, simpler signal than a populated one a
  // `Disallow: /` robots.txt is merely asking crawlers to respect.
  if (env.APP_ENV !== "production") {
    return [];
  }

  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/shop`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    ...POLICY_SLUGS.map((slug) => ({
      url: `${SITE_URL}/policies/${slug}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];

  // Category Catalog Reconnection — category URLs now come from
  // `catalogService.listCategories()` (was the static `CATEGORIES`
  // constant), same try/catch-degrades-to-nothing pattern as products
  // below, for the same reason: a temporarily unreachable database must
  // produce a smaller sitemap, never a 500.
  let categoryEntries: MetadataRoute.Sitemap = [];
  try {
    const categories = await catalogService.listCategories();
    categoryEntries = categories.map((category) => ({
      url: `${SITE_URL}/shop/${category.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
  } catch (err) {
    logger.warn({ err }, "sitemap: category fetch failed — omitting category URLs");
  }

  let productEntries: MetadataRoute.Sitemap = [];
  try {
    const products = await catalogService.listAllProducts();
    productEntries = products
      .filter((product) => !isSampleContent(product.name))
      .map((product) => ({
        url: `${SITE_URL}/product/${product.slug}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
  } catch (err) {
    logger.warn({ err }, "sitemap: catalog fetch failed — returning static pages only");
  }

  return [...staticEntries, ...categoryEntries, ...productEntries];
}
