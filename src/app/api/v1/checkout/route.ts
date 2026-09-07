import { apiSuccess } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { resolveSession, withSessionCookie } from "@/lib/session";
import { cartService } from "@/modules/cart";
import { checkoutService } from "@/modules/checkout";

/** Starts a checkout session from the current cart — the accordion's entry point (technical-architecture.md §10). */
export async function POST() {
  try {
    const session = await resolveSession();
    const cart = await cartService.getOrCreateCartForSession(session.sessionId, session.customerId);
    const checkoutSession = await checkoutService.startCheckout(cart.id, session.customerId, null);

    const response = apiSuccess({ checkoutSessionId: checkoutSession.id });
    return session.isNew ? withSessionCookie(response, session.token) : response;
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
