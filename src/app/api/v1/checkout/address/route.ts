import { z } from "zod";

import { apiSuccess, parseOrError } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
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
    const { checkoutSessionId, ...address } = parsed.data;
    const updated = await checkoutService.setAddress(checkoutSessionId, address);
    return apiSuccess({ checkoutSession: updated });
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
