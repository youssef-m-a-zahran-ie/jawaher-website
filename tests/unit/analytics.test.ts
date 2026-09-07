import { describe, expect, it, vi } from "vitest";

import { track } from "@/lib/analytics";

describe("track", () => {
  it("never throws, even with no params", () => {
    expect(() => track("page_view")).not.toThrow();
  });

  it("never throws when the console call itself fails", () => {
    const original = console.debug;
    console.debug = () => {
      throw new Error("console unavailable");
    };
    try {
      expect(() => track("add_to_cart", { item_id: "mock-1" })).not.toThrow();
    } finally {
      console.debug = original;
    }
  });

  it("accepts the documented event names without a type error", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    track("search", { search_term: "تمر" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
