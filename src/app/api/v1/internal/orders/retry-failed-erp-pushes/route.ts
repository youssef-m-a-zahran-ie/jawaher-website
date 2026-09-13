import { apiError, apiSuccess } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { env } from "@/lib/env";
import { retryFailedErpPushes } from "@/modules/orders";

/**
 * The same "external scheduler hitting an internal endpoint" mechanism as
 * `internal/inventory/sweep-expired-reservations` (that route's own
 * comment) — no job queue, mirrors an already-established pattern exactly.
 * Nothing in this project invokes this on a schedule yet; wiring an actual
 * cron trigger against this URL is a deployment-configuration task (see
 * docs/architecture/production-readiness.md).
 *
 * Phase 12 — closes a real gap: `pushOrderToErp` was always documented as
 * safe to call repeatedly/from a sweep, but no sweep ever existed, so an
 * order whose first ERP push failed had no path back to `SUCCEEDED` short
 * of a manual database edit.
 *
 * Protected by a shared secret (never by obscurity). Fails closed: if no
 * secret is configured in production, every call is rejected.
 */
export async function POST(request: Request) {
  if (env.NODE_ENV === "production" || env.INTERNAL_API_SECRET) {
    const provided = request.headers.get("x-internal-api-secret");
    if (!env.INTERNAL_API_SECRET || provided !== env.INTERNAL_API_SECRET) {
      return apiError("authorization", "internal_endpoint_unauthorized", "غير مصرح.");
    }
  }

  try {
    const result = await retryFailedErpPushes();
    return apiSuccess(result);
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
