import { z } from "zod";

import { apiSuccess, parseOrError } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-response";
import { checkoutService } from "@/modules/checkout";

const bodySchema = z.object({ checkoutSessionId: z.string().uuid(), code: z.string().min(1).max(40) });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = parseOrError(bodySchema, body);
  if (!parsed.success) return parsed.response;

  // Coupon-apply gets its own tighter rate limit, independent of the general API limit (technical-architecture.md §12).
  const rate = checkRateLimit(`coupon-apply:${parsed.data.checkoutSessionId}`, 10, 10 * 60 * 1000);
  if (!rate.allowed) {
    return apiError("business_rule", "coupon_rate_limited", "عدد المحاولات كبير، برجاء المحاولة لاحقًا.");
  }

  try {
    const { discount } = await checkoutService.applyCoupon(parsed.data.checkoutSessionId, parsed.data.code);
    return apiSuccess({ discountAmountMinor: discount.amountMinor });
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
