import { z } from "zod";

import { apiSuccess, parseOrError } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { resolveSession, withSessionCookie } from "@/lib/session";
import { customersService } from "@/modules/customers";

const bodySchema = z.object({ phone: z.string().min(8).max(20), code: z.string().min(4).max(6) });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = parseOrError(bodySchema, body);
  if (!parsed.success) return parsed.response;

  try {
    const session = await resolveSession();
    const customer = await customersService.verifyPhoneAndAuthenticate(session.token, parsed.data.phone, parsed.data.code);

    const response = apiSuccess({ customerId: customer.id });
    // Session is now authenticated (or was already new) — the cookie must be (re-)set either way here.
    return withSessionCookie(response, session.token);
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
