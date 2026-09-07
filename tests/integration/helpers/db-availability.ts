import { db } from "@/lib/db";

/**
 * This sandbox has no Docker/local Postgres (same disclosed limitation as
 * Phase 1's health check) — every integration test in this directory
 * checks this first and skips (not fails) when unreachable, so `npm test`
 * degrades gracefully here. `.github/workflows/ci.yml` is designed to give
 * these tests a real Postgres service container, but no run of that
 * workflow has actually been observed (no `git remote` configured in this
 * environment) — treat "passes in CI" as unverified until a real run is
 * confirmed, not as already true.
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
