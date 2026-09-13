import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 9.5, corrected in Phase 9.5R — ERP inventory adapter tests.
 * Mirrors erp-catalog-adapter.test.ts's exact pattern (env mocked per
 * test, fetch stubbed globally, no real network call, no real ERP
 * touched). Uses the `variantIds` request shape exclusively — SKU is
 * never sent by this adapter (Phase 9.5R correction; ERP's own stable
 * variant id is the identity, never a mutable business field).
 */
const BASE_ENV = {
  ERP_BASE_URL: "http://localhost:9999",
  ERP_API_KEY: "test-api-key",
  ERP_CONNECTION_ID: "test-connection-id",
  ERP_REQUEST_TIMEOUT_MS: undefined as number | undefined,
};

async function loadAdapterWithEnv(overrides: Partial<typeof BASE_ENV> = {}) {
  vi.resetModules();
  vi.doMock("@/lib/env", () => ({ env: { ...BASE_ENV, ...overrides } }));
  return import("@/modules/erp-integration/inventory");
}

function stubFetchOnce(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status }))
  );
}

describe("erpInventoryAdapter.getAvailability", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("@/lib/env");
  });

  it("returns availability keyed by ERP's own variant id", async () => {
    stubFetchOnce({ items: [{ variantId: "erp-v1", available: 17 }], notFoundVariantIds: [] });
    const { erpInventoryAdapter } = await loadAdapterWithEnv();

    const result = await erpInventoryAdapter.getAvailability(["erp-v1"]);
    expect(result.availableById.get("erp-v1")).toBe(17);
  });

  it("sends a POST with a JSON body containing exactly { variantIds }, never a sku field", async () => {
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL, init?: RequestInit) => {
        capturedInit = init;
        return new Response(JSON.stringify({ items: [], notFoundVariantIds: [] }), { status: 200 });
      })
    );
    const { erpInventoryAdapter } = await loadAdapterWithEnv();

    await erpInventoryAdapter.getAvailability(["v1", "v2"]);

    expect(capturedInit?.method).toBe("POST");
    const body = JSON.parse(String(capturedInit?.body));
    expect(body).toEqual({ variantIds: ["v1", "v2"] });
    expect(Object.keys(body)).not.toContain("skus");
    expect(Object.keys(body)).not.toContain("sku");
  });

  it("returns an empty map without calling fetch when given no ids", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { erpInventoryAdapter } = await loadAdapterWithEnv();

    const result = await erpInventoryAdapter.getAvailability([]);
    expect(result.availableById.size).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("omits a variant id ERP reports as not found from the result map, rather than defaulting it to a number", async () => {
    stubFetchOnce({ items: [], notFoundVariantIds: ["v1"] });
    const { erpInventoryAdapter } = await loadAdapterWithEnv();

    const result = await erpInventoryAdapter.getAvailability(["v1"]);
    expect(result.availableById.has("v1")).toBe(false);
  });

  it("throws ErpInvalidInventoryResponseError on a malformed response", async () => {
    stubFetchOnce({ items: [{ variantId: "v1" }], notFoundVariantIds: [] }); // missing `available`
    const { erpInventoryAdapter, ErpInvalidInventoryResponseError } = await loadAdapterWithEnv();

    await expect(erpInventoryAdapter.getAvailability(["v1"])).rejects.toBeInstanceOf(ErpInvalidInventoryResponseError);
  });

  it("propagates ErpAuthenticationError from the underlying client on a 401", async () => {
    stubFetchOnce(null, 401);
    const { erpInventoryAdapter } = await loadAdapterWithEnv();
    const { ErpAuthenticationError } = await import("@/modules/erp-integration/client");

    await expect(erpInventoryAdapter.getAvailability(["v1"])).rejects.toBeInstanceOf(ErpAuthenticationError);
  });

  it("propagates ErpTimeoutError from the underlying client", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string | URL, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            });
          })
      )
    );
    const { erpInventoryAdapter } = await loadAdapterWithEnv({ ERP_REQUEST_TIMEOUT_MS: 10 });
    const { ErpTimeoutError } = await import("@/modules/erp-integration/client");

    await expect(erpInventoryAdapter.getAvailability(["v1"])).rejects.toBeInstanceOf(ErpTimeoutError);
  });

  it("propagates ErpUnavailableError from the underlying client on a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );
    const { erpInventoryAdapter } = await loadAdapterWithEnv();
    const { ErpUnavailableError } = await import("@/modules/erp-integration/client");

    await expect(erpInventoryAdapter.getAvailability(["v1"])).rejects.toBeInstanceOf(ErpUnavailableError);
  });

  it("batches requests beyond the per-request id limit into multiple calls", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL, init?: RequestInit) => {
        callCount++;
        const { variantIds } = JSON.parse(String(init?.body)) as { variantIds: string[] };
        return new Response(
          JSON.stringify({ items: variantIds.map((variantId) => ({ variantId, available: 1 })), notFoundVariantIds: [] }),
          { status: 200 }
        );
      })
    );
    const { erpInventoryAdapter } = await loadAdapterWithEnv();

    const ids = Array.from({ length: 250 }, (_, i) => `v${i}`);
    const result = await erpInventoryAdapter.getAvailability(ids);

    expect(callCount).toBe(2); // 200 + 50, matching the endpoint's own 200-id limit
    expect(result.availableById.get("v0")).toBe(1);
    expect(result.availableById.get("v249")).toBe(1);
  });
});
