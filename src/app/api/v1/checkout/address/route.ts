import { z } from "zod";

import { apiError, apiSuccess, parseOrError } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveSession, withSessionCookie } from "@/lib/session";
import { checkoutService } from "@/modules/checkout";

const bodySchema = z.object({
  checkoutSessionId: z.string().uuid(),
  recipientName: z.string().min(1).max(120),
  phoneE164: z.string().min(8).max(20),
  governorate: z.string().min(1).max(60),
  city: z.string().min(1).max(60),
  area: z.string().max(60).optional(),
  street: z.string().min(1).max(200),
  building: z.string().max(60).optional(),
  floor: z.string().max(30).optional(),
  apartment: z.string().max(30).optional(),
  landmark: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = parseOrError(bodySchema, body);
  if (!parsed.success) return parsed.response;

  try {
    const session = await resolveSession();

    // Rate limit (technical-architecture.md §12) — a real gap the Phase
    // 9.7 security review found: this endpoint had none before this phase.
    const rate = checkRateLimit(`checkout-address:${session.sessionId}`, 20, 10 * 60 * 1000);
    if (!rate.allowed) {
      return apiError("business_rule", "checkout_rate_limited", "عدد المحاولات كبير، برجاء المحاولة لاحقًا.");
    }

    const { checkoutSessionId, ...address } = parsed.data;
    const updated = await checkoutService.setAddress(
      checkoutSessionId,
      { sessionId: session.sessionId, customerId: session.customerId },
      address,
    );
    const response = apiSuccess({ checkoutSession: updated });
    return session.isNew ? withSessionCookie(response, session.token) : response;
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
