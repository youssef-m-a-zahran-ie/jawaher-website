import { z } from "zod";

import { callErpIntegrationApi, ErpUnexpectedResponseError } from "./client";

/**
 * ============================================================================
 * ERP ORDER ADAPTER — Phase 9.6
 * ============================================================================
 * Wraps the three new Website-integration order endpoints (ERP JAW,
 * `src/app/api/v1/integrations/website/orders/*`): create/ingest, status
 * pull-back, cancel — the `pushOrder()`/`getOrderStatus()` methods
 * blueprint.md §9 already named as part of the ERP Adapter's target
 * interface, plus cancellation.
 *
 * IDENTITY: every call is keyed by the Website's own `Order.id`
 * (`websiteOrderId`) — this IS the idempotency key ERP uses to dedupe a
 * retried push (blueprint.md §8: "the website order id is the
 * idempotency key used when pushing to the ERP, so a retried push can
 * never double-create the order"). ERP's own internal SalesOrder id
 * comes back as `erpOrderReference` — stored (Order.erpOrderReference)
 * but never exposed to the customer (docs/integration/
 * order-erp-integration-audit.md §18).
 *
 * Server-only, reuses Phase 8's `callErpIntegrationApi` exactly — no
 * second ERP client/auth mechanism.
 * ============================================================================
 */

export class ErpInvalidOrderResponseError extends Error {
  constructor(public readonly requestId: string, public readonly issues: string) {
    super(`ERP order response failed schema validation (requestId=${requestId}): ${issues}`);
    this.name = "ErpInvalidOrderResponseError";
  }
}

/** ERP rejected the order for a real, explainable business reason (e.g. no active warehouse, unknown variant id) — distinct from a generic/unexpected failure. */
export class ErpOrderRejectedError extends Error {
  constructor(public readonly requestId: string, public readonly erpMessage: string) {
    super(`ERP rejected the order (requestId=${requestId}): ${erpMessage}`);
    this.name = "ErpOrderRejectedError";
  }
}

const pushOrderResponseSchema = z.object({
  erpOrderReference: z.string(),
  primaryStatus: z.string(),
  deduplicated: z.boolean(),
});

const orderStatusResponseSchema = z.object({
  primaryStatus: z.string(),
  subStatus: z.string().nullable(),
  paymentStatus: z.string(),
  cancelledAt: z.string().nullable(),
});

export interface PushOrderLine {
  erpVariantId: string;
  quantity: number;
  /** A decimal string (e.g. "185.0000") — never a raw float. See mapper.ts for the conversion. */
  unitPrice: string;
}

export interface PushOrderPayload {
  websiteOrderId: string;
  customer: { phoneE164: string; name?: string };
  lines: PushOrderLine[];
  contactPhone?: string;
  shippingAddress?: string;
  paymentMethod?: string;
}

export interface PushOrderResult {
  erpOrderReference: string;
  primaryStatus: string;
  deduplicated: boolean;
  requestId: string;
}

export interface ErpOrderStatus {
  primaryStatus: string;
  subStatus: string | null;
  paymentStatus: string;
  cancelledAt: string | null;
}

export const erpOrderAdapter = {
  async pushOrder(payload: PushOrderPayload, requestId?: string): Promise<PushOrderResult> {
    try {
      const { data, requestId: rid } = await callErpIntegrationApi<unknown>({
        path: "/api/v1/integrations/website/orders",
        method: "POST",
        requestId,
        body: payload,
      });
      const parsed = pushOrderResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ErpInvalidOrderResponseError(rid, parsed.error.issues.map((i) => i.message).join("; "));
      }
      return { ...parsed.data, requestId: rid };
    } catch (err) {
      if (err instanceof ErpUnexpectedResponseError && err.erpErrorCode === "business_rule_violation") {
        throw new ErpOrderRejectedError(err.requestId, err.erpErrorMessage ?? "ERP rejected the order.");
      }
      throw err;
    }
  },

  /** Returns `null` when ERP has no order for this website order id yet (never pushed, or the push hasn't been recorded) — not an error. */
  async getOrderStatus(websiteOrderId: string, requestId?: string): Promise<ErpOrderStatus | null> {
    try {
      const { data } = await callErpIntegrationApi<unknown>({
        path: `/api/v1/integrations/website/orders/${encodeURIComponent(websiteOrderId)}`,
        requestId,
      });
      const parsed = orderStatusResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ErpInvalidOrderResponseError(requestId ?? "", parsed.error.issues.map((i) => i.message).join("; "));
      }
      return parsed.data;
    } catch (err) {
      if (err instanceof ErpUnexpectedResponseError && err.status === 404) return null;
      throw err;
    }
  },

  /** Returns `null` when ERP has no order for this website order id at all (never pushed) — nothing to cancel there. */
  async cancelOrder(websiteOrderId: string, reason: string, requestId?: string): Promise<ErpOrderStatus | null> {
    try {
      const { data } = await callErpIntegrationApi<unknown>({
        path: `/api/v1/integrations/website/orders/${encodeURIComponent(websiteOrderId)}/cancel`,
        method: "POST",
        requestId,
        body: { reason },
      });
      const parsed = orderStatusResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ErpInvalidOrderResponseError(requestId ?? "", parsed.error.issues.map((i) => i.message).join("; "));
      }
      return parsed.data;
    } catch (err) {
      if (err instanceof ErpUnexpectedResponseError && err.status === 404) return null;
      if (err instanceof ErpUnexpectedResponseError && err.erpErrorCode === "business_rule_violation") {
        throw new ErpOrderRejectedError(err.requestId, err.erpErrorMessage ?? "ERP rejected the cancellation.");
      }
      throw err;
    }
  },
};
