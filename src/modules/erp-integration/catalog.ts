import { z } from "zod";

import { callErpIntegrationApi } from "./client";

/**
 * ============================================================================
 * ERP CATALOG ADAPTER — Phase 9.4
 * ============================================================================
 * Typed methods for the two approved, read-only ERP Catalog API endpoints
 * (erp-catalog-inventory-api.md §5/§7) — `getProducts`/`getCategories` from
 * blueprint.md §9's planned adapter interface. `getPrices` is not a
 * separate method: price is already part of each product's variant DTO.
 * `getInventory` is deliberately NOT implemented here — inventory sync is
 * a strict non-goal of this phase (website-erp-catalog-sync.md §17).
 *
 * Reuses Phase 8's `callErpIntegrationApi` exactly — no second ERP
 * client/auth mechanism. This file adds exactly two things on top of it:
 * (1) typed query-string construction for the two catalog endpoints, and
 * (2) response-shape validation (Zod) so a malformed/unexpected ERP
 * response fails loudly (`ErpInvalidResponseError`) instead of silently
 * flowing bad data into the Website projection.
 * ============================================================================
 */

export class ErpInvalidResponseError extends Error {
  constructor(public readonly requestId: string, public readonly issues: string) {
    super(`ERP catalog response failed schema validation (requestId=${requestId}): ${issues}`);
    this.name = "ErpInvalidResponseError";
  }
}

// Mirrors erp-catalog-inventory-api.md §7 exactly — never widened with
// fields the approved contract doesn't define, per that document's own
// "nothing fabricated" rule.
const erpVariantSchema = z.object({
  id: z.string(),
  sku: z.string(),
  barcode: z.string().nullable(),
  status: z.string(),
  sellingPrice: z.string().nullable(),
  packQuantity: z.string(),
});

const erpProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  categoryId: z.string(),
  categoryName: z.string(),
  baseUnitCode: z.string(),
  updatedAt: z.string(),
  variants: z.array(erpVariantSchema),
});

const erpProductsResponseSchema = z.object({
  products: z.array(erpProductSchema),
  pagination: z.object({
    limit: z.number(),
    skip: z.number(),
    total: z.number(),
    hasMore: z.boolean(),
  }),
});

const erpCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  parentCategoryId: z.string().nullable(),
});

const erpCategoriesResponseSchema = z.object({
  categories: z.array(erpCategorySchema),
});

export type ErpCatalogVariant = z.infer<typeof erpVariantSchema>;
export type ErpCatalogProduct = z.infer<typeof erpProductSchema>;
export type ErpCatalogCategory = z.infer<typeof erpCategorySchema>;

export interface ListErpProductsParams {
  limit?: number;
  skip?: number;
  /** Never pass "draft" from this phase's sync — see website-erp-catalog-sync.md §9. */
  status?: "active" | "discontinued" | "archived";
  updatedSince?: Date;
}

export interface ListErpProductsResult {
  products: ErpCatalogProduct[];
  pagination: { limit: number; skip: number; total: number; hasMore: boolean };
  requestId: string;
}

export interface ListErpCategoriesResult {
  categories: ErpCatalogCategory[];
  requestId: string;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export const erpCatalogAdapter = {
  async listProducts(params: ListErpProductsParams = {}, requestId?: string): Promise<ListErpProductsResult> {
    const query = buildQuery({
      limit: params.limit,
      skip: params.skip,
      status: params.status,
      updatedSince: params.updatedSince?.toISOString(),
    });
    const { data, requestId: rid } = await callErpIntegrationApi<unknown>({
      path: `/api/v1/integrations/website/catalog/products${query}`,
      requestId,
    });
    const parsed = erpProductsResponseSchema.safeParse(data);
    if (!parsed.success) {
      throw new ErpInvalidResponseError(rid, parsed.error.issues.map((i) => i.message).join("; "));
    }
    return { ...parsed.data, requestId: rid };
  },

  async listCategories(requestId?: string): Promise<ListErpCategoriesResult> {
    const { data, requestId: rid } = await callErpIntegrationApi<unknown>({
      path: "/api/v1/integrations/website/catalog/categories",
      requestId,
    });
    const parsed = erpCategoriesResponseSchema.safeParse(data);
    if (!parsed.success) {
      throw new ErpInvalidResponseError(rid, parsed.error.issues.map((i) => i.message).join("; "));
    }
    return { ...parsed.data, requestId: rid };
  },
};
