import { describe, expect, it } from "vitest";

import { deriveAvailability, LOW_STOCK_THRESHOLD, resolveErpReservationGateQuantity } from "@/modules/catalog";

describe("deriveAvailability", () => {
  it("is out_of_stock at zero", () => {
    expect(deriveAvailability(0)).toBe("out_of_stock");
  });

  it("is out_of_stock for a negative available quantity (over-reserved edge case)", () => {
    expect(deriveAvailability(-1)).toBe("out_of_stock");
  });

  it("is low_stock at exactly the threshold", () => {
    expect(deriveAvailability(LOW_STOCK_THRESHOLD)).toBe("low_stock");
  });

  it("is low_stock just above zero", () => {
    expect(deriveAvailability(1)).toBe("low_stock");
  });

  it("is in_stock just above the threshold", () => {
    expect(deriveAvailability(LOW_STOCK_THRESHOLD + 1)).toBe("in_stock");
  });

  it("is in_stock for a large quantity", () => {
    expect(deriveAvailability(1000)).toBe("in_stock");
  });
});

/**
 * Regression coverage for a real bug the Inventory Integration milestone
 * found: `reserveInventoryForItems` used to gate every variant (ERP-synced
 * included) on the local `inventoryQuantity` column, which is always 0 for
 * an ERP-synced product (catalog-sync never writes it — an explicit,
 * documented non-goal) — so checkout could never actually succeed for a
 * single real ERP-backed product, even immediately after the ERP
 * pre-check confirmed real stock. This function is the fix's own
 * arithmetic: ERP's pre-checked number minus already-active local
 * reservations, never the local column.
 */
describe("resolveErpReservationGateQuantity", () => {
  it("subtracts already-active local reservations from ERP's pre-checked number", () => {
    expect(resolveErpReservationGateQuantity(10, 3)).toBe(7);
  });

  it("returns the full ERP number when nothing is currently reserved locally", () => {
    expect(resolveErpReservationGateQuantity(5, 0)).toBe(5);
  });

  it("can go negative when local reservations exceed ERP's number (caller's `< quantity` check still rejects it correctly)", () => {
    expect(resolveErpReservationGateQuantity(2, 5)).toBe(-3);
  });

  it("never silently substitutes a local inventoryQuantity-derived number — this function has no such input at all", () => {
    // The whole point: this function's signature makes it structurally
    // impossible to gate on the local `inventoryQuantity` column by
    // accident — it only ever sees ERP's own number.
    expect(resolveErpReservationGateQuantity(0, 0)).toBe(0);
  });
});
