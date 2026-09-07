import { z } from "zod";

import { apiSuccess, parseOrError } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { checkoutService } from "@/modules/checkout";

const querySchema = z.object({ checkoutSessionId: z.string().uuid() });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = parseOrError(querySchema, { checkoutSessionId: url.searchParams.get("checkoutSessionId") });
  if (!parsed.success) return parsed.response;

  try {
    const rates = await checkoutService.getShippingRates(parsed.data.checkoutSessionId);
    return apiSuccess({ rates });
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
