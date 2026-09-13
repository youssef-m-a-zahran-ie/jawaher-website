import { z } from "zod";

import { apiError, apiSuccess, parseOrError } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveSession, withSessionCookie } from "@/lib/session";
import { checkoutService } from "@/modules/checkout";
import { pushOrderToErp } from "@/modules/orders";

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
    const session = await resolveSession();

    // Order placement gets its own rate limit, independent of the general
    // API limit (technical-architecture.md §12) — the idempotency key above
    // already makes retries of the SAME attempt safe/free; this guards
    // against a single requester hammering the endpoint with distinct keys.
    const rate = checkRateLimit(`order-place:${session.sessionId}`, 10, 10 * 60 * 1000);
    if (!rate.allowed) {
      return apiError("business_rule", "order_place_rate_limited", "عدد المحاولات كبير، برجاء المحاولة لاحقًا.");
    }

    const order = await checkoutService.confirmAndPlaceOrder(
      parsed.data.checkoutSessionId,
      { sessionId: session.sessionId, customerId: session.customerId },
      { method: parsed.data.method, idempotencyKey },
    );

    // Deliberately a SEPARATE step, after the Website's own transaction
    // has already committed (never inside it — see erp-sync.service.ts's
    // own header comment). Never throws and never blocks the customer
    // from seeing their order as placed: the Website's commercial
    // commitment is already complete and authoritative by this point
    // (docs/architecture/data-ownership.md's approved lifecycle);
    // `Order.erpPushStatus` tracks the outcome for retry/observability
    // rather than surfacing a failure here.
    await pushOrderToErp(order.orderId);

    const response = apiSuccess({ order });
    return session.isNew ? withSessionCookie(response, session.token) : response;
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
