import { z } from "zod";

import { apiError, apiSuccess, parseOrError } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveSession, withSessionCookie } from "@/lib/session";
import { cartService } from "@/modules/cart";

const bodySchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().positive().max(99),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = parseOrError(bodySchema, body);
  if (!parsed.success) return parsed.response;

  try {
    const session = await resolveSession();

    // Cart-mutation rate limit (technical-architecture.md §12) — a real gap
    // the Phase 9.7 security review found: unlike checkout/coupon/order-track,
    // this endpoint had no limit at all before this phase.
    const rate = checkRateLimit(`cart-add:${session.sessionId}`, 60, 10 * 60 * 1000);
    if (!rate.allowed) {
      return apiError("business_rule", "cart_rate_limited", "عدد المحاولات كبير، برجاء المحاولة لاحقًا.");
    }

    const cart = await cartService.getOrCreateCartForSession(session.sessionId, session.customerId);
    const result = await cartService.addItem(cart.id, parsed.data.variantId, parsed.data.quantity);
    const view = await cartService.getCartView(cart.id);

    const response = apiSuccess({ cart: view, clamped: result.clamped });
    return session.isNew ? withSessionCookie(response, session.token) : response;
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
