/**
 * Rate-limit foundation — establishes the interface every future auth/OTP
 * and checkout endpoint will call, per
 * docs/architecture/technical-architecture.md §12/§18.
 *
 * IMPORTANT: this in-memory implementation is single-instance only. It is
 * correct for local development and for a single running instance, but it
 * is NOT safe once the app runs as more than one instance (each instance
 * would count independently, silently multiplying the effective limit) —
 * per ADR-015, that is exactly the trigger for introducing Redis. Swap this
 * module's internals for a Redis-backed store at that point; the
 * `checkRateLimit` call sites should not need to change.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * @param key A caller-defined identity for the thing being limited, e.g. `otp-request:${phone}`.
 * @param limit Maximum allowed calls within the window.
 * @param windowMs Window size in milliseconds.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: limit - existing.count,
    resetAt: existing.resetAt,
  };
}

/** Test-only: clears all buckets so tests don't leak state into each other. */
export function _resetRateLimitStateForTests(): void {
  buckets.clear();
}
