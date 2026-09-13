import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Phase 9.5 — `fetchErpAvailability` (src/modules/catalog/inventory.ts):
 * the combining/fallback logic between the Website-local number and a
 * live ERP read. `@/modules/erp-integration` is mocked so this tests the
 * combining logic in isolation, independent of the adapter's own
 * (separately tested) HTTP behavior.
 */
const getAvailability = vi.fn();

vi.mock("@/modules/erp-integration", () => ({
  erpInventoryAdapter: { getAvailability },
}));

const { fetchErpAvailability } = await import("@/modules/catalog/inventory");

beforeEach(() => {
  getAvailability.mockReset();
});

describe("fetchErpAvailability", () => {
  it("returns an empty, non-failed result without calling ERP when no variant has an erpVariantId", async () => {
    const result = await fetchErpAvailability([
      { id: "v1", sku: "SKU-1", erpVariantId: null },
      { id: "v2", sku: "SKU-2", erpVariantId: null },
    ]);
    expect(result).toEqual({ availableById: new Map(), failed: false });
    expect(getAvailability).not.toHaveBeenCalled();
  });

  it("calls ERP only for variants that have an erpVariantId, keyed by the Website's own id", async () => {
    getAvailability.mockResolvedValue({ availableById: new Map([["v1", 5]]), requestId: "rid" });

    const result = await fetchErpAvailability([
      { id: "v1", sku: "SKU-1", erpVariantId: "erp-v1" },
      { id: "v2", sku: "SKU-2", erpVariantId: null },
    ]);

    expect(getAvailability).toHaveBeenCalledWith([{ id: "v1", sku: "SKU-1" }]);
    expect(result.availableById.get("v1")).toBe(5);
    expect(result.failed).toBe(false);
  });

  it("returns failed: true (not thrown, not silently 'available') when the ERP adapter throws", async () => {
    getAvailability.mockRejectedValue(new Error("ERP unavailable"));

    const result = await fetchErpAvailability([{ id: "v1", sku: "SKU-1", erpVariantId: "erp-v1" }]);

    expect(result.failed).toBe(true);
    expect(result.availableById.size).toBe(0);
  });
});
