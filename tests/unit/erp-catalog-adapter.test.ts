import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 9.4 — ERP catalog adapter tests. Mirrors erp-client.test.ts's
 * exact pattern (env mocked per test via vi.doMock + fresh dynamic
 * import, fetch stubbed globally, no real network call). Reuses Phase
 * 8's `callErpIntegrationApi` unmodified underneath — these tests exist
 * to prove the two things this phase's adapter layer adds on top of it:
 * correct query-string construction, and response-schema validation.
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
  return import("@/modules/erp-integration/catalog");
}

function stubFetchOnce(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status }))
  );
}

const VALID_PRODUCTS_RESPONSE = {
  products: [
    {
      id: "prod-1",
      name: "تمر مجدول",
      status: "active",
      categoryId: "cat-1",
      categoryName: "تمور",
      baseUnitCode: "kg",
      updatedAt: "2026-01-01T00:00:00.000Z",
      variants: [
        { id: "v1", sku: "SKU-1", barcode: null, status: "active", sellingPrice: "185.0000", packQuantity: "0.5000" },
      ],
    },
  ],
  pagination: { limit: 50, skip: 0, total: 1, hasMore: false },
  requestId: "rid-1",
};

const VALID_CATEGORIES_RESPONSE = {
  categories: [{ id: "cat-1", name: "تمور", parentCategoryId: null }],
  requestId: "rid-2",
};

describe("erpCatalogAdapter.listProducts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("@/lib/env");
  });

  it("returns validated products on a well-formed 200 response", async () => {
    stubFetchOnce(VALID_PRODUCTS_RESPONSE);
    const { erpCatalogAdapter } = await loadAdapterWithEnv();

    const result = await erpCatalogAdapter.listProducts();
    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.id).toBe("prod-1");
    expect(result.pagination.hasMore).toBe(false);
  });

  it("builds the query string from limit/skip/status/updatedSince", async () => {
    let capturedUrl: string | URL | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        capturedUrl = url;
        return new Response(JSON.stringify(VALID_PRODUCTS_RESPONSE), { status: 200 });
      })
    );
    const { erpCatalogAdapter } = await loadAdapterWithEnv();

    await erpCatalogAdapter.listProducts({
      limit: 25,
      skip: 50,
      status: "active",
      updatedSince: new Date("2026-01-01T00:00:00.000Z"),
    });

    const url = new URL(String(capturedUrl));
    expect(url.pathname).toBe("/api/v1/integrations/website/catalog/products");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.get("skip")).toBe("50");
    expect(url.searchParams.get("status")).toBe("active");
    expect(url.searchParams.get("updatedSince")).toBe("2026-01-01T00:00:00.000Z");
  });

  it("omits query params that were not provided, rather than sending empty/undefined values", async () => {
    let capturedUrl: string | URL | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        capturedUrl = url;
        return new Response(JSON.stringify(VALID_PRODUCTS_RESPONSE), { status: 200 });
      })
    );
    const { erpCatalogAdapter } = await loadAdapterWithEnv();

    await erpCatalogAdapter.listProducts();

    const url = new URL(String(capturedUrl));
    expect(url.search).toBe("");
  });

  it("throws ErpInvalidResponseError when the response is missing required fields", async () => {
    stubFetchOnce({ products: [{ id: "prod-1" }], pagination: { limit: 50, skip: 0, total: 1, hasMore: false } });
    const { erpCatalogAdapter, ErpInvalidResponseError } = await loadAdapterWithEnv();

    await expect(erpCatalogAdapter.listProducts()).rejects.toBeInstanceOf(ErpInvalidResponseError);
  });

  it("throws ErpInvalidResponseError when a field has the wrong type entirely", async () => {
    stubFetchOnce({ products: "not-an-array", pagination: { limit: 50, skip: 0, total: 0, hasMore: false } });
    const { erpCatalogAdapter, ErpInvalidResponseError } = await loadAdapterWithEnv();

    await expect(erpCatalogAdapter.listProducts()).rejects.toBeInstanceOf(ErpInvalidResponseError);
  });

  it("propagates ErpAuthenticationError from the underlying client on a 401", async () => {
    stubFetchOnce(null, 401);
    const { erpCatalogAdapter } = await loadAdapterWithEnv();
    const { ErpAuthenticationError } = await import("@/modules/erp-integration/client");

    await expect(erpCatalogAdapter.listProducts()).rejects.toBeInstanceOf(ErpAuthenticationError);
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
    const { erpCatalogAdapter } = await loadAdapterWithEnv({ ERP_REQUEST_TIMEOUT_MS: 10 });
    const { ErpTimeoutError } = await import("@/modules/erp-integration/client");

    await expect(erpCatalogAdapter.listProducts()).rejects.toBeInstanceOf(ErpTimeoutError);
  });

  it("propagates ErpUnavailableError from the underlying client on a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );
    const { erpCatalogAdapter } = await loadAdapterWithEnv();
    const { ErpUnavailableError } = await import("@/modules/erp-integration/client");

    await expect(erpCatalogAdapter.listProducts()).rejects.toBeInstanceOf(ErpUnavailableError);
  });

  it("propagates ErpNotConfiguredError when ERP env vars are missing, without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { erpCatalogAdapter } = await loadAdapterWithEnv({ ERP_API_KEY: undefined });
    const { ErpNotConfiguredError } = await import("@/modules/erp-integration/client");

    await expect(erpCatalogAdapter.listProducts()).rejects.toBeInstanceOf(ErpNotConfiguredError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("erpCatalogAdapter.listCategories", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("@/lib/env");
  });

  it("returns validated categories on a well-formed 200 response", async () => {
    stubFetchOnce(VALID_CATEGORIES_RESPONSE);
    const { erpCatalogAdapter } = await loadAdapterWithEnv();

    const result = await erpCatalogAdapter.listCategories();
    expect(result.categories).toEqual([{ id: "cat-1", name: "تمور", parentCategoryId: null }]);
  });

  it("requests the categories endpoint with no query string (no pagination for this small, bounded set)", async () => {
    let capturedUrl: string | URL | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        capturedUrl = url;
        return new Response(JSON.stringify(VALID_CATEGORIES_RESPONSE), { status: 200 });
      })
    );
    const { erpCatalogAdapter } = await loadAdapterWithEnv();

    await erpCatalogAdapter.listCategories();
    expect(String(capturedUrl)).toBe("http://localhost:9999/api/v1/integrations/website/catalog/categories");
  });

  it("throws ErpInvalidResponseError on a malformed categories response", async () => {
    stubFetchOnce({ categories: [{ id: "cat-1" }] });
    const { erpCatalogAdapter, ErpInvalidResponseError } = await loadAdapterWithEnv();

    await expect(erpCatalogAdapter.listCategories()).rejects.toBeInstanceOf(ErpInvalidResponseError);
  });
});
