import { z } from "zod";

import { apiSuccess, parseOrError } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-response";
import { ordersService } from "@/modules/orders";

const querySchema = z.object({
  orderNumber: z.string().min(1).max(30),
  phone: z.string().min(8).max(20),
});

/**
 * Public, unauthenticated lookup — order number ALONE is never sufficient
 * (commerce-completeness-audit.md §19's anti-enumeration control); the
 * phone must match too. Also its own tighter rate limit, independent of
 * the general API limit, since an order number is short and guessable.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = parseOrError(querySchema, {
    orderNumber: url.searchParams.get("orderNumber"),
    phone: url.searchParams.get("phone"),
  });
  if (!parsed.success) return parsed.response;

  const rate = checkRateLimit(`order-track:${parsed.data.phone}`, 10, 10 * 60 * 1000);
  if (!rate.allowed) {
    return apiError("business_rule", "tracking_rate_limited", "عدد المحاولات كبير، برجاء المحاولة لاحقًا.");
  }

  try {
    const order = await ordersService.trackOrder(parsed.data.orderNumber, parsed.data.phone);
    return apiSuccess({ order });
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
