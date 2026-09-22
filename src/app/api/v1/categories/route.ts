import { apiSuccess } from "@/lib/api-response";
import { mapDomainErrorToApiResponse } from "@/lib/api-error-mapping";
import { catalogService } from "@/modules/catalog";

/**
 * Category Catalog Reconnection — the categories counterpart to
 * `/api/v1/products`, same conventions exactly: thin route, all real
 * logic in `catalogService`, errors mapped through the same
 * `mapDomainErrorToApiResponse` every other API route uses so a database
 * failure here never leaks internal details.
 *
 * `export const dynamic = "force-dynamic"` is not optional — found the
 * hard way elsewhere in this project (robots.ts, Phase 14): a GET Route
 * Handler with no dynamic API usage of its own can otherwise be
 * statically evaluated once at build time, baking in whatever the
 * database returned during that build rather than the real, current
 * catalog on every request.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const categories = await catalogService.listCategories();
    return apiSuccess({ categories });
  } catch (error) {
    return mapDomainErrorToApiResponse(error);
  }
}
