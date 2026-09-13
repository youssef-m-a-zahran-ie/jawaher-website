import { describe, expect, it } from "vitest";

import { mapErpStatusToFulfillmentStage, deriveCustomerFacingStatus } from "@/modules/orders/service";

/**
 * Phase 9.6 — pure status-mapping logic. No DB, no ERP call — the
 * combining/collapsing rules in isolation. Mapping table verified
 * directly against sales-order.service.ts's real transitions (see
 * docs/integration/order-erp-integration-audit.md §7).
 */
describe("mapErpStatusToFulfillmentStage", () => {
  it("collapses the pre-dispatch statuses onto 'being_prepared'", () => {
    for (const status of ["pending_validation", "confirmed", "picking", "packing", "ready_for_delivery"]) {
      expect(mapErpStatusToFulfillmentStage(status)).toBe("being_prepared");
    }
  });

  it("maps out_for_delivery/delivered/returned to their own distinct stages", () => {
    expect(mapErpStatusToFulfillmentStage("out_for_delivery")).toBe("out_for_delivery");
    expect(mapErpStatusToFulfillmentStage("delivered")).toBe("delivered");
    expect(mapErpStatusToFulfillmentStage("returned")).toBe("returned");
  });

  it("maps cancelled/rejected to 'cancelled'", () => {
    expect(mapErpStatusToFulfillmentStage("cancelled")).toBe("cancelled");
    expect(mapErpStatusToFulfillmentStage("rejected")).toBe("cancelled");
  });

  it("defensively maps the dead qc/failed_delivery values (never actually reachable today) rather than throwing", () => {
    expect(mapErpStatusToFulfillmentStage("qc")).toBe("being_prepared");
    expect(mapErpStatusToFulfillmentStage("failed_delivery")).toBe("being_prepared");
  });
});

describe("deriveCustomerFacingStatus — three independent dimensions, never conflated", () => {
  it("Website-local CANCELLED always wins, regardless of ERP's own status", () => {
    expect(deriveCustomerFacingStatus({ status: "CANCELLED" }, undefined, "out_for_delivery")).toBe("cancelled");
  });

  it("a refund in progress/completed is reported from Payment.status, independent of ERP fulfillment stage", () => {
    expect(deriveCustomerFacingStatus({ status: "CONFIRMED" }, "REFUND_COMPLETED", "delivered")).toBe("refunded");
    expect(deriveCustomerFacingStatus({ status: "CONFIRMED" }, "REFUND_INITIATED", "delivered")).toBe("refund_in_progress");
  });

  it("a payment-state change never accidentally reads as 'shipped' — ERP fulfillment stage is reported independently of payment status", () => {
    expect(deriveCustomerFacingStatus({ status: "CONFIRMED" }, "AWAITING_COD_COLLECTION", "out_for_delivery")).toBe("out_for_delivery");
  });

  it("falls back to 'confirmed' when no ERP status is available yet (not pushed, or ERP unreachable)", () => {
    expect(deriveCustomerFacingStatus({ status: "CONFIRMED" }, "AWAITING_COD_COLLECTION", null)).toBe("confirmed");
  });

  it("an ERP-side cancellation the Website hasn't locally reconciled is still surfaced honestly", () => {
    expect(deriveCustomerFacingStatus({ status: "CONFIRMED" }, undefined, "cancelled")).toBe("cancelled");
  });
});
