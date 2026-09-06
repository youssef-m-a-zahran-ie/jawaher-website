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
  // Lean standalone build for the Dockerfile — see docker-compose.yml/Dockerfile.
  output: "standalone",
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
