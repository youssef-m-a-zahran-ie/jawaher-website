import { beforeEach, describe, expect, it } from "vitest";

import { _resetRateLimitStateForTests, checkRateLimit } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    _resetRateLimitStateForTests();
  });

  it("allows calls up to the limit", () => {
    const key = "otp-request:0100000000";
    expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
  });

  it("blocks once the limit is exceeded within the window", () => {
    const key = "otp-request:0100000001";
    checkRateLimit(key, 2, 60_000);
    checkRateLimit(key, 2, 60_000);
    const third = checkRateLimit(key, 2, 60_000);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it("tracks separate keys independently", () => {
    checkRateLimit("otp-request:A", 1, 60_000);
    const blocked = checkRateLimit("otp-request:A", 1, 60_000);
    const other = checkRateLimit("otp-request:B", 1, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(other.allowed).toBe(true);
  });
});
