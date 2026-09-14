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
 *
 * Phase 14 — found during staging bring-up: unlike `sitemap.ts`, this file
 * had no `dynamic` export, so Next.js prerendered it once at BUILD time
 * (confirmed via a real build: `robots.txt` listed as a static `○` route,
 * not `ƒ`). On Vercel that happens to be harmless (each deployment/
 * environment gets its own build with its own env vars), but it is a real
 * bug for the "build once, run anywhere" Docker/DigitalOcean path this app
 * must stay portable to: the Dockerfile never sets `APP_ENV` at build time
 * (only `NODE_ENV`), so an image built once and later run with different
 * `APP_ENV` values per environment would forever serve whatever
 * `robots.txt` the *build* saw (defaulting to blocked) — never the
 * container's real runtime environment. `force-dynamic` makes this re-run
 * per request, exactly like `sitemap.ts` already does, so both files are
 * governed by the same rule for the same reason.
 */
export const dynamic = "force-dynamic";

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
