import { db } from "@/lib/db";

/**
 * This sandbox has no Docker/local Postgres (same disclosed limitation as
 * Phase 1's health check) — every integration test in this directory
 * checks this first and skips (not fails) when unreachable, so `npm test`
 * degrades gracefully here and runs for real in CI, which has a real
 * Postgres service container (.github/workflows/ci.yml).
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
