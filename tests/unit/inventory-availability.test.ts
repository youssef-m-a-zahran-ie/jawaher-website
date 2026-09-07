import { describe, expect, it } from "vitest";

import { deriveAvailability, LOW_STOCK_THRESHOLD } from "@/modules/catalog";

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
