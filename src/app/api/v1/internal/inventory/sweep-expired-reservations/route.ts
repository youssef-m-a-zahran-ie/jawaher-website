import { apiError, apiSuccess } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { env } from "@/lib/env";
import { expireStaleReservations } from "@/modules/catalog";

/**
 * The "external scheduler hitting an internal endpoint" mechanism
 * technical-architecture.md §19 specifies for MVP (no job queue). Nothing
 * in this project invokes this on a schedule yet — see
 * docs/planning/commerce-completeness-audit.md §21's risk note; wiring an
 * actual cron trigger is a deployment-configuration task.
 *
 * Protected by a shared secret (never by obscurity — "internal" in the
 * path is not a security boundary on its own). Fails closed: if no secret
 * is configured in production, every call is rejected rather than
 * silently allowed.
 */
export async function POST(request: Request) {
  if (env.NODE_ENV === "production" || env.INTERNAL_API_SECRET) {
    const provided = request.headers.get("x-internal-api-secret");
    if (!env.INTERNAL_API_SECRET || provided !== env.INTERNAL_API_SECRET) {
      return apiError("authorization", "internal_endpoint_unauthorized", "غير مصرح.");
    }
  }

  try {
    const expiredCount = await expireStaleReservations();
    return apiSuccess({ expiredCount });
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
