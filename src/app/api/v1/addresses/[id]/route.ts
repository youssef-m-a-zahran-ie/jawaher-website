import { z } from "zod";

import { apiError, apiSuccess, parseOrError } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { resolveSession } from "@/lib/session";
import { customersService } from "@/modules/customers";

const patchSchema = z.object({ isDefault: z.literal(true) });

type RouteParams = { params: Promise<{ id: string }> };

/** Only `{ isDefault: true }` is accepted — every other address field is create-once (a new address, not an edit) to keep ownership/validation simple. */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await resolveSession();
  if (!session.customerId) return apiError("authentication", "not_authenticated", "برجاء تسجيل الدخول.");

  const body = await request.json().catch(() => null);
  const parsed = parseOrError(patchSchema, body);
  if (!parsed.success) return parsed.response;

  try {
    const address = await customersService.setDefaultAddress(session.customerId, id);
    return apiSuccess({ address });
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await resolveSession();
  if (!session.customerId) return apiError("authentication", "not_authenticated", "برجاء تسجيل الدخول.");

  try {
    await customersService.deleteAddress(session.customerId, id);
    return apiSuccess({ deleted: true });
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
