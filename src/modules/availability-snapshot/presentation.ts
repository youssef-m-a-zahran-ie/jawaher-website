/**
 * Shop/Search presentation availability — pure, dependency-free logic,
 * deliberately kept in its own file with zero Prisma/DB imports (same
 * reasoning as this repo's own inventory-availability.test.ts-covered
 * pure functions). Turns a snapshot row (or its absence) into a
 * customer-facing status + an explicit freshness label — never lets
 * "stale" or "no data at all" be mistaken for a guaranteed-current answer.
 */

export type SnapshotFreshness = "fresh" | "stale" | "unknown";

export type PresentationAvailabilityStatus = "in_stock" | "low_stock" | "out_of_stock" | "unknown";

export interface ListingAvailabilityResult {
  status: PresentationAvailabilityStatus;
  freshness: SnapshotFreshness;
}

export interface SnapshotForResolution {
  presentationStatus: string;
  lastSuccessAt: Date;
}

const DEFAULT_FRESHNESS_MINUTES = 15;

/** Reads the approved default (15 min) unless overridden — see env.ts's own doc comment for why this is a presentation freshness target, not a sales guarantee. */
export function resolveFreshnessWindowMs(configuredMinutes?: number): number {
  return (configuredMinutes ?? DEFAULT_FRESHNESS_MINUTES) * 60 * 1000;
}

/**
 * No snapshot row at all -> "unknown", exactly like ERP-unreachable
 * already means "unknown" everywhere else in this integration — never
 * invented as "out_of_stock" (which would misrepresent a real, possibly
 * in-stock item) and never "in_stock" (which would misrepresent a
 * possibly out-of-stock one). A row that exists but is older than the
 * freshness window is still returned (a stale hint is still a real,
 * ERP-derived signal, more useful than nothing) — but tagged "stale" so
 * the caller always knows the difference; it is never silently presented
 * as verified-current.
 */
export function resolveListingAvailability(snapshot: SnapshotForResolution | undefined, now: Date, freshnessWindowMs: number): ListingAvailabilityResult {
  if (!snapshot) return { status: "unknown", freshness: "unknown" };

  const ageMs = now.getTime() - snapshot.lastSuccessAt.getTime();
  const freshness: SnapshotFreshness = ageMs <= freshnessWindowMs ? "fresh" : "stale";

  const status = snapshot.presentationStatus;
  if (status !== "in_stock" && status !== "low_stock" && status !== "out_of_stock") {
    // Defensive: a row should never contain anything else by construction
    // (the repository only ever writes these three values) — fail to
    // "unknown" rather than trust an unrecognized stored string.
    return { status: "unknown", freshness };
  }
  return { status, freshness };
}
