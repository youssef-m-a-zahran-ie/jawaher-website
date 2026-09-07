import { z } from "zod";

import { apiError, apiSuccess, parseOrError } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { resolveSession } from "@/lib/session";
import { customersService } from "@/modules/customers";

const addressSchema = z.object({
  label: z.string().max(60).optional(),
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

export async function GET() {
  const session = await resolveSession();
  if (!session.customerId) return apiError("authentication", "not_authenticated", "برجاء تسجيل الدخول.");

  try {
    const addresses = await customersService.listAddresses(session.customerId);
    return apiSuccess({ addresses });
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}

export async function POST(request: Request) {
  const session = await resolveSession();
  if (!session.customerId) return apiError("authentication", "not_authenticated", "برجاء تسجيل الدخول.");

  const body = await request.json().catch(() => null);
  const parsed = parseOrError(addressSchema, body);
  if (!parsed.success) return parsed.response;

  try {
    const address = await customersService.createAddress(session.customerId, parsed.data);
    return apiSuccess({ address });
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
