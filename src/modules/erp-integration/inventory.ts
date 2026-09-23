import { z } from "zod";

import { callErpIntegrationApi } from "./client";

/**
 * ============================================================================
 * ERP INVENTORY ADAPTER — Phase 9.5, corrected in Phase 9.5R
 * ============================================================================
 * Wraps `POST /api/v1/integrations/website/inventory/availability`.
 *
 * IDENTITY (Phase 9.5R): the endpoint's `variantIds` request shape,
 * added specifically for this correction (erp-catalog-inventory-api.md
 * §18), is used here — ERP's own stable internal variant id, keyed the
 * same way on the way out. SKU is never sent or reasoned about anywhere
 * in this file. The Website's Phase 9.5 first draft used the SKU-keyed
 * shape (the only one the endpoint had at the time) with a client-side
 * re-keying trick; the ERP-side fix is the real one — see
 * docs/integration/inventory-integration-audit.md §for the identity
 * section for the full history.
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
  items: z.array(z.object({ variantId: z.string(), available: z.number() })),
  notFoundVariantIds: z.array(z.string()),
});

export interface ErpAvailabilityResult {
  /** Keyed by ERP's own variant id (== the Website's `Variant.erpVariantId`). A missing entry means ERP reported it not found, or that id was never requested. */
  availableById: Map<string, number>;
  requestId: string;
}

// Exported so any caller batching its OWN calls to this adapter (e.g. the
// availability-snapshot refresh job) can align its chunk size exactly,
// rather than hand-duplicating this number — matches the ERP endpoint's
// own documented limit (erp-catalog-inventory-api.md §6).
export const MAX_IDS_PER_REQUEST = 200;

export const erpInventoryAdapter = {
  /**
   * `erpVariantIds` — ERP's own internal variant ids
   * (`Variant.erpVariantId` on the Website side, Phase 9.4R). Batches
   * internally at the ERP endpoint's own limit — a cart or a checkout's
   * line count is always far below this in practice, so no caller of
   * this function needs to think about batching itself.
   */
  async getAvailability(erpVariantIds: string[], requestId?: string): Promise<ErpAvailabilityResult> {
    const availableById = new Map<string, number>();
    if (erpVariantIds.length === 0) return { availableById, requestId: requestId ?? "" };

    let lastRequestId = requestId ?? "";

    for (let i = 0; i < erpVariantIds.length; i += MAX_IDS_PER_REQUEST) {
      const batch = erpVariantIds.slice(i, i + MAX_IDS_PER_REQUEST);
      const { data, requestId: rid } = await callErpIntegrationApi<unknown>({
        path: "/api/v1/integrations/website/inventory/availability",
        method: "POST",
        requestId,
        body: { variantIds: batch },
      });
      lastRequestId = rid;
      const parsed = erpAvailabilityResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ErpInvalidInventoryResponseError(rid, parsed.error.issues.map((issue) => issue.message).join("; "));
      }
      for (const item of parsed.data.items) {
        availableById.set(item.variantId, item.available);
      }
    }

    return { availableById, requestId: lastRequestId };
  },
};
