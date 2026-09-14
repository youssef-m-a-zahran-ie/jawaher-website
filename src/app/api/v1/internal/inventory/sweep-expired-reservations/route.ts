import { apiSuccess } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { checkInternalRequestAuthorized } from "@/lib/internal-auth";
import { expireStaleReservations } from "@/modules/catalog";

/**
 * The "external scheduler hitting an internal endpoint" mechanism
 * technical-architecture.md §19 specifies for MVP (no job queue). Nothing
 * in this project invokes this on a schedule yet — see
 * docs/planning/commerce-completeness-audit.md §21's risk note; wiring an
 * actual cron trigger is a deployment-configuration task. Phase 13
 * prepares (but has not verified against a real deployment) Vercel Cron
 * as one such trigger for the staging environment — see `vercel.json`
 * and `checkInternalRequestAuthorized`'s own comment for the auth
 * convention this now also accepts.
 *
 * `GET` and `POST` both run the exact same sweep — this is an internal,
 * secret-gated, idempotent trigger, not a public resource with different
 * read/write semantics. `GET` exists specifically because Vercel Cron
 * can only issue GET requests to a configured path; `POST` remains for
 * any other scheduler (curl, a DigitalOcean cron daemon) that prefers it.
 */
async function runSweep(request: Request) {
  const unauthorized = checkInternalRequestAuthorized(request);
  if (unauthorized) return unauthorized;

  try {
    const expiredCount = await expireStaleReservations();
    return apiSuccess({ expiredCount });
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}

export const GET = runSweep;
export const POST = runSweep;
