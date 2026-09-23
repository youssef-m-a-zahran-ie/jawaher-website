import { randomUUID } from "node:crypto";

import { erpInventoryAdapter, MAX_IDS_PER_REQUEST } from "@/modules/erp-integration";
import { deriveAvailability } from "@/modules/catalog";
import { logger } from "@/lib/logger";
import * as repo from "./repository";

/**
 * ============================================================================
 * AVAILABILITY SNAPSHOT — REFRESH ORCHESTRATION
 * ============================================================================
 * See docs/integration/shop-search-availability-snapshot.md for the full
 * design. Consumes the EXISTING ERP Website availability contract
 * (erpInventoryAdapter.getAvailability — the same batched endpoint PDP/
 * Cart/Checkout already call) — no second ERP inventory calculation is
 * implemented here. ERP has already resolved bundle/BOM/stock-source
 * redirects and floored negatives by the time this job ever sees a
 * number; this file only turns that number into a customer-facing
 * presentation status and persists it.
 * ============================================================================
 */

export class SnapshotRefreshAlreadyRunningError extends Error {
  constructor() {
    super("An availability snapshot refresh is already running — refusing to start a second, concurrent run.");
    this.name = "SnapshotRefreshAlreadyRunningError";
  }
}

export interface SnapshotRefreshOutcome {
  runId: string;
  correlationId: string;
  status: "SUCCEEDED" | "PARTIAL" | "FAILED";
  variantsAttempted: number;
  variantsSucceeded: number;
  variantsFailed: number;
  errorSummary?: string;
}

function toPresentationStatus(state: ReturnType<typeof deriveAvailability>): "in_stock" | "low_stock" | "out_of_stock" {
  // deriveAvailability() never actually returns "unknown" (only 3 real
  // branches exist) — this narrows the type defensively rather than
  // trusting that at compile time, so a future change to that function
  // can't silently write an invalid value into a stored snapshot row.
  return state === "unknown" ? "out_of_stock" : state;
}

/**
 * Runs one full refresh: every active, ERP-linked variant, batched at the
 * adapter's own documented per-request limit (one real HTTP call per
 * chunk — see this module's own repository.ts for why this job chunks
 * itself instead of handing the whole list to getAvailability() in one
 * call: a failure partway through must not discard results already
 * persisted from earlier, successful chunks).
 *
 * A chunk-level failure (network error, ERP 5xx, malformed response)
 * marks every variant in that chunk as a failed ATTEMPT
 * (recordSnapshotAttemptFailure) — never overwrites its existing
 * presentationStatus/lastSuccessAt. A variant ERP itself reports as not
 * found this cycle is treated the same way (never fabricated as zero).
 */
export async function runAvailabilitySnapshotRefresh(): Promise<SnapshotRefreshOutcome> {
  const correlationId = randomUUID();
  await repo.ensureSnapshotLockExists();
  const acquired = await repo.tryAcquireSnapshotLock(correlationId);
  if (!acquired) {
    throw new SnapshotRefreshAlreadyRunningError();
  }

  const runId = await repo.createSnapshotRun(correlationId);
  const log = logger.child({ correlationId, runId });
  log.info("availability-snapshot: run started");

  let attempted = 0;
  let succeeded = 0;
  let failed = 0;
  let lastErrorSummary: string | null = null;

  try {
    const variants = await repo.listActiveErpLinkedVariants();
    attempted = variants.length;

    for (let i = 0; i < variants.length; i += MAX_IDS_PER_REQUEST) {
      const chunk = variants.slice(i, i + MAX_IDS_PER_REQUEST);
      const now = new Date();

      try {
        const { availableById } = await erpInventoryAdapter.getAvailability(chunk.map((v) => v.erpVariantId));
        for (const v of chunk) {
          const available = availableById.get(v.erpVariantId);
          if (available === undefined) {
            await repo.recordSnapshotAttemptFailure(v.id, now, "erp_reported_not_found");
            failed++;
            continue;
          }
          await repo.recordSnapshotSuccess(v.id, v.erpVariantId, toPresentationStatus(deriveAvailability(available)), now);
          succeeded++;
        }
      } catch (err) {
        const errorSummary = err instanceof Error ? err.name : "UnknownError";
        lastErrorSummary = errorSummary;
        log.warn({ err, chunkSize: chunk.length }, "availability-snapshot: a batch failed — preserving prior data for these variants, not zeroing them");
        for (const v of chunk) {
          await repo.recordSnapshotAttemptFailure(v.id, now, errorSummary);
          failed++;
        }
      }
    }

    const status: "SUCCEEDED" | "PARTIAL" | "FAILED" = failed === 0 ? "SUCCEEDED" : succeeded > 0 ? "PARTIAL" : "FAILED";
    await repo.completeSnapshotRun(runId, status, { variantsAttempted: attempted, variantsSucceeded: succeeded, variantsFailed: failed }, lastErrorSummary);
    log.info({ attempted, succeeded, failed, status }, "availability-snapshot: run finished");
    return { runId, correlationId, status, variantsAttempted: attempted, variantsSucceeded: succeeded, variantsFailed: failed, errorSummary: lastErrorSummary ?? undefined };
  } catch (err) {
    const errorSummary = err instanceof Error ? err.name : "UnknownError";
    await repo.completeSnapshotRun(runId, "FAILED", { variantsAttempted: attempted, variantsSucceeded: succeeded, variantsFailed: failed }, errorSummary);
    log.error({ err }, "availability-snapshot: run crashed before completing");
    return { runId, correlationId, status: "FAILED", variantsAttempted: attempted, variantsSucceeded: succeeded, variantsFailed: failed, errorSummary };
  } finally {
    await repo.releaseSnapshotLock();
  }
}
