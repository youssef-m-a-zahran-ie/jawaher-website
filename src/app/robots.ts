import type { MetadataRoute } from "next";

import { env } from "@/lib/env";
import { SITE_URL } from "@/lib/site-url";

/**
 * Phase 13 — a non-production deployment (Vercel staging/preview, or any
 * environment that isn't explicitly `APP_ENV=production`) must never
 * compete with the real production site in search results. `NODE_ENV`
 * can't be used for this check — Next.js sets it to `"production"` for
 * every optimized build, staging included (`env.ts`'s own comment) — so
 * this reads `APP_ENV` specifically, and defaults to the cautious
 * behavior (blocked) if it's ever unset.
 *
 * A single `Disallow: /` is deliberately simpler than per-route rules
 * here: this is a brand-new staging surface with no prior public
 * existence to "un-index," so there is nothing a more surgical policy
 * would need to preserve — blocking everything is both correct and the
 * least code. Phase 11R's real, per-route production policy (public
 * commerce pages indexable, private/utility pages `noindex`) is
 * untouched below and takes over exactly when `APP_ENV=production`.
 */
export default function robots(): MetadataRoute.Robots {
  if (env.APP_ENV !== "production") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dev/", "/account", "/checkout", "/track"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
