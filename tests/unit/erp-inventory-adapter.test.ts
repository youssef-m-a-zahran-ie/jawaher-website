import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 9.5 — ERP inventory adapter tests. Mirrors erp-catalog-adapter.test.ts's
 * exact pattern (env mocked per test, fetch stubbed globally, no real
 * network call, no real ERP touched).
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

  it("returns availability keyed by the caller's own id, never by sku", async () => {
    stubFetchOnce({ items: [{ sku: "SKU-1", available: 17 }], notFoundSkus: [] });
    const { erpInventoryAdapter } = await loadAdapterWithEnv();

    const result = await erpInventoryAdapter.getAvailability([{ id: "website-variant-id-1", sku: "SKU-1" }]);
    expect(result.availableById.get("website-variant-id-1")).toBe(17);
    expect(result.availableById.has("SKU-1")).toBe(false);
  });

  it("sends a POST with a JSON body containing exactly the requested SKUs, never the Website's internal ids", async () => {
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL, init?: RequestInit) => {
        capturedInit = init;
        return new Response(JSON.stringify({ items: [], notFoundSkus: [] }), { status: 200 });
      })
    );
    const { erpInventoryAdapter } = await loadAdapterWithEnv();

    await erpInventoryAdapter.getAvailability([
      { id: "v1", sku: "SKU-1" },
      { id: "v2", sku: "SKU-2" },
    ]);

    expect(capturedInit?.method).toBe("POST");
    const body = JSON.parse(String(capturedInit?.body));
    expect(body).toEqual({ skus: ["SKU-1", "SKU-2"] });
    expect(JSON.stringify(body)).not.toContain("v1");
    expect(JSON.stringify(body)).not.toContain("v2");
  });

  it("returns an empty map without calling fetch when given no variants", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { erpInventoryAdapter } = await loadAdapterWithEnv();

    const result = await erpInventoryAdapter.getAvailability([]);
    expect(result.availableById.size).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("omits a SKU ERP reports as not found from the result map, rather than defaulting it to a number", async () => {
    stubFetchOnce({ items: [], notFoundSkus: ["SKU-1"] });
    const { erpInventoryAdapter } = await loadAdapterWithEnv();

    const result = await erpInventoryAdapter.getAvailability([{ id: "v1", sku: "SKU-1" }]);
    expect(result.availableById.has("v1")).toBe(false);
  });

  it("throws ErpInvalidInventoryResponseError on a malformed response", async () => {
    stubFetchOnce({ items: [{ sku: "SKU-1" }], notFoundSkus: [] }); // missing `available`
    const { erpInventoryAdapter, ErpInvalidInventoryResponseError } = await loadAdapterWithEnv();

    await expect(erpInventoryAdapter.getAvailability([{ id: "v1", sku: "SKU-1" }])).rejects.toBeInstanceOf(
      ErpInvalidInventoryResponseError
    );
  });

  it("propagates ErpAuthenticationError from the underlying client on a 401", async () => {
    stubFetchOnce(null, 401);
    const { erpInventoryAdapter } = await loadAdapterWithEnv();
    const { ErpAuthenticationError } = await import("@/modules/erp-integration/client");

    await expect(erpInventoryAdapter.getAvailability([{ id: "v1", sku: "SKU-1" }])).rejects.toBeInstanceOf(
      ErpAuthenticationError
    );
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

    await expect(erpInventoryAdapter.getAvailability([{ id: "v1", sku: "SKU-1" }])).rejects.toBeInstanceOf(ErpTimeoutError);
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

    await expect(erpInventoryAdapter.getAvailability([{ id: "v1", sku: "SKU-1" }])).rejects.toBeInstanceOf(ErpUnavailableError);
  });

  it("batches requests beyond the per-request SKU limit into multiple calls, still keyed by id", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL, init?: RequestInit) => {
        callCount++;
        const { skus } = JSON.parse(String(init?.body)) as { skus: string[] };
        return new Response(
          JSON.stringify({ items: skus.map((sku) => ({ sku, available: 1 })), notFoundSkus: [] }),
          { status: 200 }
        );
      })
    );
    const { erpInventoryAdapter } = await loadAdapterWithEnv();

    const variants = Array.from({ length: 250 }, (_, i) => ({ id: `v${i}`, sku: `SKU-${i}` }));
    const result = await erpInventoryAdapter.getAvailability(variants);

    expect(callCount).toBe(2); // 200 + 50, matching the endpoint's own 200-SKU limit
    expect(result.availableById.get("v0")).toBe(1);
    expect(result.availableById.get("v249")).toBe(1);
  });
});
