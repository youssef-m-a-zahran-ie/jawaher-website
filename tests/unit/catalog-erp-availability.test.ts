import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Phase 9.5, corrected in Phase 9.5R — `fetchErpAvailability`
 * (src/modules/catalog/inventory.ts): ERP is the ONLY inventory
 * authority (no `min()` blending with Website-local data anywhere in
 * this function). `@/modules/erp-integration` is mocked so this tests
 * the re-keying/fallback logic in isolation, independent of the
 * adapter's own (separately tested) HTTP behavior. The adapter is called
 * with ERP's own variant ids directly (never SKU, never the Website's
 * own `Variant.id`) — `fetchErpAvailability` re-keys the response back
 * to the Website's own id for its caller.
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
      { id: "v1", erpVariantId: null },
      { id: "v2", erpVariantId: null },
    ]);
    expect(result).toEqual({ availableById: new Map(), failed: false });
    expect(getAvailability).not.toHaveBeenCalled();
  });

  it("calls ERP with ERP's own variant ids, and re-keys the response back to the Website's own id", async () => {
    getAvailability.mockResolvedValue({ availableById: new Map([["erp-v1", 5]]), requestId: "rid" });

    const result = await fetchErpAvailability([
      { id: "v1", erpVariantId: "erp-v1" },
      { id: "v2", erpVariantId: null },
    ]);

    expect(getAvailability).toHaveBeenCalledWith(["erp-v1"]);
    expect(result.availableById.get("v1")).toBe(5);
    expect(result.failed).toBe(false);
  });

  it("returns failed: true (not thrown, not silently 'available') when the ERP adapter throws", async () => {
    getAvailability.mockRejectedValue(new Error("ERP unavailable"));

    const result = await fetchErpAvailability([{ id: "v1", erpVariantId: "erp-v1" }]);

    expect(result.failed).toBe(true);
    expect(result.availableById.size).toBe(0);
  });

  it("ERP's answer is used alone — never averaged/minimized against anything else (there is no local number in this function's inputs/outputs at all)", async () => {
    // ERP reports 50 for a variant; this function has no local number to
    // combine it with — its own contract proves ERP-authority by
    // construction (no `min()`, no second parameter for a local value).
    getAvailability.mockResolvedValue({ availableById: new Map([["erp-v1", 50]]), requestId: "rid" });

    const result = await fetchErpAvailability([{ id: "v1", erpVariantId: "erp-v1" }]);
    expect(result.availableById.get("v1")).toBe(50);
  });
});
