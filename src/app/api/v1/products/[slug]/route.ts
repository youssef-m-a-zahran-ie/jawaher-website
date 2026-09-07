import { apiError, apiSuccess } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { catalogService } from "@/modules/catalog";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const product = await catalogService.getProduct(slug);
    if (!product) return apiError("not_found", "product_not_found", "لم يتم العثور على المنتج.");
    return apiSuccess({ product });
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
