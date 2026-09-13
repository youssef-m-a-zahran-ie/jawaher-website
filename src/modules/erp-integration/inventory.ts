import { z } from "zod";

import { callErpIntegrationApi } from "./client";

/**
 * ============================================================================
 * ERP INVENTORY ADAPTER — Phase 9.5 (read-only foundation)
 * ============================================================================
 * Wraps the existing, unmodified `POST /api/v1/integrations/website/
 * inventory/availability` endpoint (Phase 9.3/9.3R) — no ERP change was
 * needed or made; that endpoint already returns exactly what this phase
 * requires (a single, bundle/component-resolved, floored-at-zero sellable
 * count per SKU — see docs/integration/inventory-integration-audit.md §9/§13/§14).
 *
 * IDENTITY: the wire contract is unavoidably SKU-keyed (a Phase 9.3
 * decision, unchanged) — this file's public function honors "ERP Variant
 * ID as identity, not SKU" at the call-convention layer instead: callers
 * pass `{ id, sku }` pairs (the Website's own Variant identity plus the
 * ERP-owned SKU needed only as this one endpoint's wire parameter), and
 * results come back keyed by the caller's own `id`, never by raw SKU.
 * `sku` here is round-tripped ERP-owned data (Phase 9.4/9.4R), not a
 * Website-invented identity choice.
 *
 * Reuses Phase 8's `callErpIntegrationApi` exactly — no second ERP
 * client/auth mechanism, matching `erp-integration/catalog.ts`'s own
 * precedent.
 * ============================================================================
 */

export class ErpInvalidInventoryResponseError extends Error {
  constructor(public readonly requestId: string, public readonly issues: string) {
    super(`ERP inventory response failed schema validation (requestId=${requestId}): ${issues}`);
    this.name = "ErpInvalidInventoryResponseError";
  }
}

const erpAvailabilityResponseSchema = z.object({
  items: z.array(z.object({ sku: z.string(), available: z.number() })),
  notFoundSkus: z.array(z.string()),
});

export interface VariantIdentity {
  /** The Website's own internal identity for this variant — what every result is keyed by. */
  id: string;
  /** ERP-owned, round-tripped SKU — used only as this endpoint's wire parameter, never as identity. */
  sku: string;
}

export interface ErpAvailabilityResult {
  /** Keyed by the caller's own `id` (never by `sku`). A missing entry means ERP reported the SKU as not found. */
  availableById: Map<string, number>;
  requestId: string;
}

const MAX_SKUS_PER_REQUEST = 200; // matches the ERP endpoint's own documented limit (erp-catalog-inventory-api.md §6)

export const erpInventoryAdapter = {
  /**
   * Batches internally at the ERP endpoint's own limit — a cart or a
   * checkout's line count is always far below this in practice, so no
   * caller of this function needs to think about batching itself.
   */
  async getAvailability(variants: VariantIdentity[], requestId?: string): Promise<ErpAvailabilityResult> {
    const availableById = new Map<string, number>();
    if (variants.length === 0) return { availableById, requestId: requestId ?? "" };

    const idBySku = new Map(variants.map((v) => [v.sku, v.id]));
    let lastRequestId = requestId ?? "";

    for (let i = 0; i < variants.length; i += MAX_SKUS_PER_REQUEST) {
      const batch = variants.slice(i, i + MAX_SKUS_PER_REQUEST);
      const { data, requestId: rid } = await callErpIntegrationApi<unknown>({
        path: "/api/v1/integrations/website/inventory/availability",
        method: "POST",
        requestId,
        body: { skus: batch.map((v) => v.sku) },
      });
      lastRequestId = rid;
      const parsed = erpAvailabilityResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ErpInvalidInventoryResponseError(rid, parsed.error.issues.map((issue) => issue.message).join("; "));
      }
      for (const item of parsed.data.items) {
        const id = idBySku.get(item.sku);
        if (id !== undefined) availableById.set(id, item.available);
      }
    }

    return { availableById, requestId: lastRequestId };
  },
};
