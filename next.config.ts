import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Baseline CSP, set statically (not nonce-based) so Home/Category/PDP/About
 * can stay on ISR/SSG per docs/architecture/technical-architecture.md §20 —
 * nonce-based CSP forces every page into dynamic rendering, which would
 * silently undermine that already-approved caching strategy. Tracked as a
 * documented trade-off in docs/architecture/technical-decisions.md rather
 * than "solved" by picking the stricter option — revisit per-route (e.g.
 * for the SSR-only checkout/account pages) once those exist for real.
 */
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:;
  font-src 'self' data:;
  connect-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, " ")
  .trim();

const nextConfig: NextConfig = {
  // Lean standalone build for the Dockerfile (docker-compose.yml/Dockerfile
  // COPY --from=builder /app/.next/standalone, then `CMD ["node",
  // "server.js"]` — that entrypoint only exists in standalone output).
  //
  // NOT for Vercel: found the hard way — a real Vercel build got through
  // TypeScript, env validation, and all 32 pages, then failed at Vercel's
  // own post-build step ("onBuildComplete from Vercel") with
  // `ENOENT: .next/next-server.js.nft.json`. Vercel does its own file
  // tracing/packaging for serverless functions and expects the standard
  // (non-standalone) `.next` output layout; `output: "standalone"`
  // restructures that layout for a self-hosted Node server instead,
  // which is exactly what Vercel's own docs say this option is
  // unnecessary — and here, actively incompatible — for.
  //
  // `VERCEL` is the platform's own documented build-time signal (set to
  // "1" automatically by both `vercel build` and Vercel's build
  // environment) — never set locally or in the Dockerfile, so this stays
  // "standalone" for every build that isn't actually running on Vercel.
  output: process.env.VERCEL ? undefined : "standalone",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
