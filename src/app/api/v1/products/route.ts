import { z } from "zod";

import { apiSuccess, parseOrError } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { catalogService } from "@/modules/catalog";

const querySchema = z.object({
  category: z.string().min(1).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = parseOrError(querySchema, { category: url.searchParams.get("category") ?? undefined });
  if (!parsed.success) return parsed.response;

  try {
    const products = parsed.data.category
      ? await catalogService.listProductsByCategory(parsed.data.category)
      : await catalogService.listAllProducts();
    return apiSuccess({ products });
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
