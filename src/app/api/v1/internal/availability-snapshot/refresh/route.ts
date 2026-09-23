import { apiSuccess } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { checkInternalRequestAuthorized } from "@/lib/internal-auth";
import { runAvailabilitySnapshotRefresh } from "@/modules/availability-snapshot";

/**
 * Shop/Search Availability Snapshot milestone — the same "external
 * scheduler hitting an internal endpoint" mechanism as
 * `internal/inventory/sweep-expired-reservations` and
 * `internal/orders/retry-failed-erp-pushes` (those routes' own comments).
 * `GET` and `POST` both run the same refresh — Vercel Cron issues GET
 * only; `POST` remains for any other scheduler.
 *
 * The job itself (`runAvailabilitySnapshotRefresh`) has no dependency on
 * this route or on Vercel Cron specifically — it is equally callable from
 * `scripts/run-availability-snapshot-refresh.ts` (manual/CI) or from any
 * other external scheduler pointed at this same authenticated endpoint,
 * per this milestone's own "keep the job logic independent from the
 * scheduler" requirement.
 */
async function runRefresh(request: Request) {
  const unauthorized = checkInternalRequestAuthorized(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await runAvailabilitySnapshotRefresh();
    return apiSuccess(result);
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}

export const GET = runRefresh;
export const POST = runRefresh;
