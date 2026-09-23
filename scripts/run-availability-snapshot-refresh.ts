// Manual/cron-invoked availability-snapshot refresh trigger — Shop/Search
// Availability Snapshot milestone, mirroring scripts/run-catalog-sync.ts's
// own precedent exactly (same reasoning: tsx, not node's native TS
// support, for the same constructor-parameter-property-syntax reason
// documented there). Run via the package.json script below:
//
//   npm run availability-snapshot:refresh
import "dotenv/config";

async function main() {
  const { runAvailabilitySnapshotRefresh } = await import("@/modules/availability-snapshot");

  const outcome = await runAvailabilitySnapshotRefresh();

  console.log(`availability snapshot refresh finished: ${outcome.status}`);
  console.log(JSON.stringify(outcome, null, 2));
  if (outcome.status === "FAILED") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("availability snapshot refresh crashed before completing:", error);
  process.exitCode = 1;
});
