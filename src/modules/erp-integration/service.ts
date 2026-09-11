import { callErpIntegrationApi } from "./client";

/**
 * Public surface of the ERP Adapter — Phase 8 (integration foundation)
 * only. Business operations (`getProducts`/`getPrices`/`getInventory`/
 * `pushOrder`/`getOrderStatus`/`reconcileCustomer` — blueprint.md §9) are
 * deliberately NOT implemented here yet; each is a future, separately-
 * reviewed phase, per this phase's explicit scope boundary
 * (erp-integration-implementation-plan.md §10, Phase B).
 *
 * `checkConnection()` exists only to prove the boundary (auth, timeout,
 * error mapping, request-id propagation) actually works end to end against
 * the real ERP's minimal health endpoint — it is not itself a business
 * capability.
 */
export interface ErpConnectionCheckResult {
  ok: boolean;
  requestId: string;
}

export const erpIntegrationService = {
  async checkConnection(requestId?: string): Promise<ErpConnectionCheckResult> {
    const result = await callErpIntegrationApi<{ status: string }>({
      path: "/api/v1/integrations/website/health",
      requestId,
    });
    return { ok: result.data.status === "ok", requestId: result.requestId };
  },
};
