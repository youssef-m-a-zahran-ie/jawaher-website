import { describe, expect, it } from "vitest";

import { resolveListingAvailability, resolveFreshnessWindowMs } from "@/modules/availability-snapshot";

describe("resolveFreshnessWindowMs", () => {
  it("defaults to 15 minutes when unconfigured", () => {
    expect(resolveFreshnessWindowMs(undefined)).toBe(15 * 60 * 1000);
  });

  it("honors a configured override", () => {
    expect(resolveFreshnessWindowMs(30)).toBe(30 * 60 * 1000);
  });
});

describe("resolveListingAvailability", () => {
  const freshnessWindowMs = 15 * 60 * 1000;

  it("returns unknown/unknown when no snapshot row exists at all", () => {
    expect(resolveListingAvailability(undefined, new Date(), freshnessWindowMs)).toEqual({ status: "unknown", freshness: "unknown" });
  });

  it("returns fresh when the snapshot is within the freshness window", () => {
    const now = new Date("2026-09-23T12:15:00.000Z");
    const lastSuccessAt = new Date("2026-09-23T12:05:00.000Z"); // 10 min ago
    const result = resolveListingAvailability({ presentationStatus: "in_stock", lastSuccessAt }, now, freshnessWindowMs);
    expect(result).toEqual({ status: "in_stock", freshness: "fresh" });
  });

  it("returns exactly fresh at the boundary (age == window)", () => {
    const now = new Date("2026-09-23T12:15:00.000Z");
    const lastSuccessAt = new Date("2026-09-23T12:00:00.000Z"); // exactly 15 min ago
    const result = resolveListingAvailability({ presentationStatus: "out_of_stock", lastSuccessAt }, now, freshnessWindowMs);
    expect(result.freshness).toBe("fresh");
  });

  it("returns stale once the snapshot is older than the freshness window, but still reports the last known status", () => {
    const now = new Date("2026-09-23T12:16:00.000Z");
    const lastSuccessAt = new Date("2026-09-23T12:00:00.000Z"); // 16 min ago
    const result = resolveListingAvailability({ presentationStatus: "low_stock", lastSuccessAt }, now, freshnessWindowMs);
    expect(result).toEqual({ status: "low_stock", freshness: "stale" });
  });

  it("never upgrades a stale snapshot to look verified — freshness and status stay separate fields", () => {
    const now = new Date("2026-09-23T15:00:00.000Z");
    const lastSuccessAt = new Date("2026-09-23T10:00:00.000Z"); // hours stale
    const result = resolveListingAvailability({ presentationStatus: "in_stock", lastSuccessAt }, now, freshnessWindowMs);
    expect(result.freshness).toBe("stale");
    expect(result.status).toBe("in_stock"); // the hint is still surfaced, just explicitly labeled stale
  });

  it("falls back to unknown for a defensively unexpected stored status value, never trusting an unrecognized string", () => {
    const now = new Date();
    const result = resolveListingAvailability({ presentationStatus: "not_a_real_status", lastSuccessAt: now }, now, freshnessWindowMs);
    expect(result.status).toBe("unknown");
  });
});
