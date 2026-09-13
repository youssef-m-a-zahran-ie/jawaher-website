import { z } from "zod";

import { apiError, apiSuccess, parseOrError } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { checkRateLimit } from "@/lib/rate-limit";
import { ordersService } from "@/modules/orders";

const bodySchema = z.object({
  orderNumber: z.string().min(1).max(30),
  phone: z.string().min(8).max(20),
  reason: z.string().max(300).optional(),
});

const DEFAULT_REASON = "طلب إلغاء من العميل عبر صفحة تتبع الطلب";

/**
 * Phase 9.7 — `ordersService.cancelOrder` existed with zero API route at
 * all (confirmed: no route anywhere calls it) — cancellation was
 * completely unreachable by any real customer. This is the guest-facing
 * path, reachable from /track: order number + phone together, same
 * anti-enumeration/rate-limit posture as `GET /api/v1/orders/track`
 * (commerce-completeness-audit.md §19) — never the internal order UUID,
 * never session/customerId (see `cancelTrackedOrder`'s own comment on why).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = parseOrError(bodySchema, body);
  if (!parsed.success) return parsed.response;

  const rate = checkRateLimit(`order-cancel:${parsed.data.phone}`, 10, 10 * 60 * 1000);
  if (!rate.allowed) {
    return apiError("business_rule", "cancel_rate_limited", "عدد المحاولات كبير، برجاء المحاولة لاحقًا.");
  }

  try {
    const order = await ordersService.cancelTrackedOrder(
      parsed.data.orderNumber,
      parsed.data.phone,
      parsed.data.reason ?? DEFAULT_REASON,
    );
    return apiSuccess({ order });
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
