import { z } from "zod";

import { apiSuccess, parseOrError } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { customersService } from "@/modules/customers";

const bodySchema = z.object({ phone: z.string().min(8).max(20) });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = parseOrError(bodySchema, body);
  if (!parsed.success) return parsed.response;

  try {
    const { expiresAt, devCode } = await customersService.requestPhoneVerification(parsed.data.phone);
    // devCode is only ever populated outside production — see customersService's own comment.
    return apiSuccess({ expiresAt, devCode });
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
