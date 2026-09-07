import { env } from "@/lib/env";

/**
 * The public site origin, no trailing slash. Falls back to a localhost dev
 * URL rather than a guessed production domain — see env.ts's comment on
 * NEXT_PUBLIC_SITE_URL. Used by metadataBase, sitemap.ts, and robots.ts.
 */
export const SITE_URL = env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
