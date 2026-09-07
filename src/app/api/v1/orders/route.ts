import { z } from "zod";

import { apiError, apiSuccess, parseOrError } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { checkoutService } from "@/modules/checkout";

const bodySchema = z.object({
  checkoutSessionId: z.string().uuid(),
  method: z.enum(["COD", "ONLINE"]),
});

/**
 * Idempotency-Key is REQUIRED (technical-architecture.md §11/§12) — a
 * double-click "place order" or a network-retried request with the same
 * key is a documented no-op, enforced inside checkoutService's single
 * transaction (never relying on frontend button-disabling alone).
 */
export async function POST(request: Request) {
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey) {
    return apiError("validation", "missing_idempotency_key", "Idempotency-Key header مطلوب.");
  }

  const body = await request.json().catch(() => null);
  const parsed = parseOrError(bodySchema, body);
  if (!parsed.success) return parsed.response;

  try {
    const order = await checkoutService.confirmAndPlaceOrder(parsed.data.checkoutSessionId, {
      method: parsed.data.method,
      idempotencyKey,
    });
    return apiSuccess({ order });
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
