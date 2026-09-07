import { describe, expect, it } from "vitest";

import { clampQuantity } from "@/lib/quantity";

describe("clampQuantity", () => {
  it("keeps an in-range value unchanged", () => {
    expect(clampQuantity(3, 1, 10)).toBe(3);
  });

  it("clamps below the minimum up to the minimum", () => {
    expect(clampQuantity(0, 1, 10)).toBe(1);
    expect(clampQuantity(-5, 1, 10)).toBe(1);
  });

  it("clamps above the maximum down to the maximum", () => {
    expect(clampQuantity(999, 1, 10)).toBe(10);
  });

  it("rounds a non-integer value before clamping", () => {
    expect(clampQuantity(3.7, 1, 10)).toBe(4);
  });

  it("rejects a max lower than min", () => {
    expect(() => clampQuantity(5, 10, 1)).toThrow(RangeError);
  });
});
