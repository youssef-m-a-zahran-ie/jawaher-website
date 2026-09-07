import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Production mode: closer to real behavior, and avoids dev-only
    // overlays interfering with assertions. DATABASE_URL is deliberately
    // left as whatever's in the environment (or unset) so this also proves
    // the health check degrades gracefully instead of crashing when the
    // database is unreachable — see tests/e2e/health.spec.ts.
    //
    // Deliberately NOT `npm run start`: with next.config.ts's
    // `output: "standalone"`, `next start` prints "does not work with
    // output: standalone configuration" and doesn't serve the app
    // correctly. The real production entry point is
    // .next/standalone/server.js (see the Dockerfile, which uses the same
    // file) — scripts/prepare-standalone.mjs copies in the static assets
    // that standalone output deliberately excludes.
    command: "npm run build && node scripts/prepare-standalone.mjs && node .next/standalone/server.js",
    env: { NODE_ENV: "production" },
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
