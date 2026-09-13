import { z } from "zod";

import { apiError, apiSuccess, parseOrError } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveSession, withSessionCookie } from "@/lib/session";
import { checkoutService } from "@/modules/checkout";

const querySchema = z.object({ checkoutSessionId: z.string().uuid() });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = parseOrError(querySchema, { checkoutSessionId: url.searchParams.get("checkoutSessionId") });
  if (!parsed.success) return parsed.response;

  try {
    const session = await resolveSession();

    // Same rate limit rationale as checkout/address's own comment — the
    // checkoutSessionId is also passed in a URL query string here, a
    // realistic leak vector (server logs, Referer headers), reinforcing
    // why this endpoint needs its own limit independent of the ownership check.
    const rate = checkRateLimit(`checkout-rates:${session.sessionId}`, 20, 10 * 60 * 1000);
    if (!rate.allowed) {
      return apiError("business_rule", "checkout_rate_limited", "عدد المحاولات كبير، برجاء المحاولة لاحقًا.");
    }

    const rates = await checkoutService.getShippingRates(parsed.data.checkoutSessionId, {
      sessionId: session.sessionId,
      customerId: session.customerId,
    });
    const response = apiSuccess({ rates });
    return session.isNew ? withSessionCookie(response, session.token) : response;
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
