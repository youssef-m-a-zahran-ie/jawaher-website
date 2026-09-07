import { cpSync, existsSync } from "node:fs";

/**
 * `next build` with `output: "standalone"` (next.config.ts) produces
 * .next/standalone/server.js, but deliberately doesn't bundle static
 * assets into it — those must be copied in manually (this is documented
 * Next.js behavior, not a bug). The Dockerfile does this with plain COPY
 * instructions; this script does the same thing with Node's fs APIs
 * (rather than shell `cp -r`) so it runs identically on Windows and Linux
 * — used by playwright.config.ts's webServer, and runnable manually:
 *   node scripts/prepare-standalone.mjs
 *
 * Note: plain `next start` does NOT correctly serve a standalone build —
 * it prints "does not work with output: standalone" and should not be
 * used for this project. Always run the standalone server.js directly.
 */
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) {
  cpSync("public", ".next/standalone/public", { recursive: true });
}
console.log("Standalone build assets prepared (.next/standalone/.next/static, public/).");
