import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 13 — `checkInternalRequestAuthorized` gates every
 * `/api/v1/internal/*` sweep endpoint (inventory-reservation expiry,
 * Phase 12's ERP-push retry). Pinned directly because it now accepts two
 * different credential presentations for the same secret (the original
 * `x-internal-api-secret` header, and Vercel Cron's own
 * `Authorization: Bearer $CRON_SECRET` convention) — a mistake in either
 * branch would either lock out a real scheduler or, worse, let an
 * unauthenticated request trigger a production sweep.
 */
describe("checkInternalRequestAuthorized", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  async function loadWithEnv(envOverrides: Record<string, string | undefined>) {
    vi.resetModules();
    vi.doMock("@/lib/env", () => ({
      env: {
        NODE_ENV: "development",
        INTERNAL_API_SECRET: undefined,
        CRON_SECRET: undefined,
        ...envOverrides,
      },
    }));
    return import("@/lib/internal-auth");
  }

  it("allows an unauthenticated request in development when no secret is configured (existing dev convenience, unchanged)", async () => {
    const { checkInternalRequestAuthorized } = await loadWithEnv({ NODE_ENV: "development" });
    const result = checkInternalRequestAuthorized(new Request("http://localhost/x"));
    expect(result).toBeNull();
  });

  it("rejects an unauthenticated request in production", async () => {
    const { checkInternalRequestAuthorized } = await loadWithEnv({ NODE_ENV: "production" });
    const result = checkInternalRequestAuthorized(new Request("http://localhost/x"));
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });

  it("accepts the original x-internal-api-secret header", async () => {
    const { checkInternalRequestAuthorized } = await loadWithEnv({ NODE_ENV: "production", INTERNAL_API_SECRET: "a-real-secret-value" });
    const authorized = checkInternalRequestAuthorized(
      new Request("http://localhost/x", { headers: { "x-internal-api-secret": "a-real-secret-value" } }),
    );
    expect(authorized).toBeNull();

    const wrongSecret = checkInternalRequestAuthorized(
      new Request("http://localhost/x", { headers: { "x-internal-api-secret": "wrong" } }),
    );
    expect(wrongSecret).not.toBeNull();
  });

  it("accepts Vercel Cron's Authorization: Bearer <CRON_SECRET> convention", async () => {
    const { checkInternalRequestAuthorized } = await loadWithEnv({
      NODE_ENV: "production",
      INTERNAL_API_SECRET: "a-real-secret-value",
      CRON_SECRET: "a-real-secret-value",
    });
    const authorized = checkInternalRequestAuthorized(
      new Request("http://localhost/x", { headers: { authorization: "Bearer a-real-secret-value" } }),
    );
    expect(authorized).toBeNull();

    const wrongBearer = checkInternalRequestAuthorized(
      new Request("http://localhost/x", { headers: { authorization: "Bearer wrong" } }),
    );
    expect(wrongBearer).not.toBeNull();
  });

  it("never authorizes via CRON_SECRET if it isn't actually configured, even with a guessed header", async () => {
    const { checkInternalRequestAuthorized } = await loadWithEnv({ NODE_ENV: "production", INTERNAL_API_SECRET: "a-real-secret-value" });
    const result = checkInternalRequestAuthorized(
      new Request("http://localhost/x", { headers: { authorization: "Bearer undefined" } }),
    );
    expect(result).not.toBeNull();
  });
});
