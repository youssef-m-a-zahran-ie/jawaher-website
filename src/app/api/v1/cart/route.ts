import { apiSuccess } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { resolveSession, withSessionCookie } from "@/lib/session";
import { cartService } from "@/modules/cart";

export async function GET() {
  try {
    const session = await resolveSession();
    const cart = await cartService.getOrCreateCartForSession(session.sessionId, session.customerId);
    const view = await cartService.getCartView(cart.id);
    const response = apiSuccess({ cart: view });
    return session.isNew ? withSessionCookie(response, session.token) : response;
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
