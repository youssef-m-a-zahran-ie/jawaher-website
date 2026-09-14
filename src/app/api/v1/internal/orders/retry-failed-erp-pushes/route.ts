import { apiSuccess } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { checkInternalRequestAuthorized } from "@/lib/internal-auth";
import { retryFailedErpPushes } from "@/modules/orders";

/**
 * The same "external scheduler hitting an internal endpoint" mechanism as
 * `internal/inventory/sweep-expired-reservations` (that route's own
 * comment) — no job queue, mirrors an already-established pattern exactly.
 * Nothing in this project invokes this on a schedule yet; wiring an actual
 * cron trigger is a deployment-configuration task. Phase 13 prepares (but
 * has not verified against a real deployment) Vercel Cron as one such
 * trigger for the staging environment — see `vercel.json`.
 *
 * Phase 12 — closes a real gap: `pushOrderToErp` was always documented as
 * safe to call repeatedly/from a sweep, but no sweep ever existed, so an
 * order whose first ERP push failed had no path back to `SUCCEEDED` short
 * of a manual database edit.
 *
 * `GET` and `POST` both run the exact same sweep — see the sibling
 * route's own comment on why (Vercel Cron issues GET only; `POST` remains
 * for any other scheduler).
 */
async function runSweep(request: Request) {
  const unauthorized = checkInternalRequestAuthorized(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await retryFailedErpPushes();
    return apiSuccess(result);
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}

export const GET = runSweep;
export const POST = runSweep;
