// Manual/cron-invoked catalog sync trigger — Phase 9.4. Deliberately NOT
// an HTTP route or a Website Admin UI action (both out of this phase's
// scope, see docs/integration/website-erp-catalog-sync.md §17) — this is
// the explicit, deliberate way a human or an external scheduler runs a
// sync.
//
// Unlike prisma/seed.ts, this script needs the real "@/modules/..."
// application code (the ERP adapter + sync service), not a
// reimplementation — plain `node`'s native TypeScript support only
// strip-types (erases annotations) and cannot execute this codebase's
// existing constructor-parameter-property syntax used throughout the ERP
// adapter (a pre-existing pattern, not introduced by this phase) —
// confirmed empirically, not assumed. `tsx` (added as a devDependency
// for this reason alone — see website-erp-catalog-sync.md §17) performs
// a real TS->JS transform and resolves the tsconfig "@/" path alias
// natively, with no custom loader needed. Run via the package.json
// scripts below, not `node`/`tsx` directly:
//
//   npm run catalog-sync:full
//   npm run catalog-sync:incremental
import "dotenv/config";

async function main() {
  const mode = process.argv.includes("--incremental") ? "incremental" : "full";
  const { runFullSync, runIncrementalSync } = await import("@/modules/catalog-sync/service");

  const outcome = mode === "full" ? await runFullSync() : await runIncrementalSync();

  console.log(`catalog sync (${mode}) finished: ${outcome.status}`);
  console.log(JSON.stringify(outcome, null, 2));
  if (outcome.status === "FAILED") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("catalog sync crashed before completing:", error);
  process.exitCode = 1;
});
