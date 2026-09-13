import { z } from "zod";

import { apiError, apiSuccess, parseOrError } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveSession, withSessionCookie } from "@/lib/session";
import { cartService } from "@/modules/cart";

const bodySchema = z.object({ quantity: z.number().int().min(0).max(99) });

type RouteParams = { params: Promise<{ variantId: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const { variantId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = parseOrError(bodySchema, body);
  if (!parsed.success) return parsed.response;

  try {
    const session = await resolveSession();

    // Same cart-mutation rate limit as POST /api/v1/cart/items — see that route's comment.
    const rate = checkRateLimit(`cart-update:${session.sessionId}`, 60, 10 * 60 * 1000);
    if (!rate.allowed) {
      return apiError("business_rule", "cart_rate_limited", "عدد المحاولات كبير، برجاء المحاولة لاحقًا.");
    }

    const cart = await cartService.getOrCreateCartForSession(session.sessionId, session.customerId);
    await cartService.updateQuantity(cart.id, variantId, parsed.data.quantity);
    const view = await cartService.getCartView(cart.id);

    const response = apiSuccess({ cart: view });
    return session.isNew ? withSessionCookie(response, session.token) : response;
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { variantId } = await params;

  try {
    const session = await resolveSession();
    const cart = await cartService.getOrCreateCartForSession(session.sessionId, session.customerId);
    await cartService.removeItem(cart.id, variantId);
    const view = await cartService.getCartView(cart.id);

    const response = apiSuccess({ cart: view });
    return session.isNew ? withSessionCookie(response, session.token) : response;
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
