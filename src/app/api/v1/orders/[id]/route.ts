import { apiSuccess } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { resolveSession } from "@/lib/session";
import { ordersService } from "@/modules/orders";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const session = await resolveSession();
    const order = await ordersService.getOrderForCustomer(id, {
      sessionId: session.sessionId,
      customerId: session.customerId,
    });
    return apiSuccess({ order });
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
