import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 8 — ERP client foundation tests. `@/lib/env` is mocked per test
 * (via vi.doMock + a fresh dynamic import) so "configured" vs. "not
 * configured" scenarios don't depend on whatever the real local .env
 * happens to contain. `fetch` is stubbed globally per test — no real
 * network call is ever made, and the ERP itself is never touched.
 */
const BASE_ENV = {
  ERP_BASE_URL: "http://localhost:9999",
  ERP_API_KEY: "test-api-key",
  ERP_CONNECTION_ID: "test-connection-id",
  ERP_REQUEST_TIMEOUT_MS: undefined as number | undefined,
};

async function loadClientWithEnv(overrides: Partial<typeof BASE_ENV>) {
  vi.resetModules();
  vi.doMock("@/lib/env", () => ({ env: { ...BASE_ENV, ...overrides } }));
  return import("@/modules/erp-integration/client");
}

describe("callErpIntegrationApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("@/lib/env");
  });

  it("throws ErpNotConfiguredError when ERP_API_KEY is missing, without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { callErpIntegrationApi, ErpNotConfiguredError } = await loadClientWithEnv({ ERP_API_KEY: undefined });

    await expect(callErpIntegrationApi({ path: "/x" })).rejects.toBeInstanceOf(ErpNotConfiguredError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws ErpNotConfiguredError when ERP_BASE_URL is missing", async () => {
    const { callErpIntegrationApi, ErpNotConfiguredError } = await loadClientWithEnv({ ERP_BASE_URL: undefined });
    await expect(callErpIntegrationApi({ path: "/x" })).rejects.toBeInstanceOf(ErpNotConfiguredError);
  });

  it("throws ErpNotConfiguredError when ERP_CONNECTION_ID is missing", async () => {
    const { callErpIntegrationApi, ErpNotConfiguredError } = await loadClientWithEnv({ ERP_CONNECTION_ID: undefined });
    await expect(callErpIntegrationApi({ path: "/x" })).rejects.toBeInstanceOf(ErpNotConfiguredError);
  });

  it("sends the API key as a Bearer header, the connection id header, and the request id header — never as a query string", async () => {
    let capturedUrl: string | URL | undefined;
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        capturedUrl = url;
        capturedInit = init;
        return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      })
    );
    const { callErpIntegrationApi } = await loadClientWithEnv({});

    const result = await callErpIntegrationApi<{ status: string }>({
      path: "/api/v1/integrations/website/health",
      requestId: "rid-1",
    });

    expect(String(capturedUrl)).toBe("http://localhost:9999/api/v1/integrations/website/health");
    expect(String(capturedUrl)).not.toContain("test-api-key");
    const headers = new Headers(capturedInit?.headers);
    expect(headers.get("authorization")).toBe("Bearer test-api-key");
    expect(headers.get("x-erp-connection-id")).toBe("test-connection-id");
    expect(headers.get("x-request-id")).toBe("rid-1");
    expect(result.data.status).toBe("ok");
    expect(result.requestId).toBe("rid-1");
  });

  it("mints a fresh request id when none is provided and propagates it in the result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 }))
    );
    const { callErpIntegrationApi } = await loadClientWithEnv({});

    const result = await callErpIntegrationApi({ path: "/x" });
    expect(typeof result.requestId).toBe("string");
    expect(result.requestId.length).toBeGreaterThan(0);
  });

  it("maps a 401 response to ErpAuthenticationError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    const { callErpIntegrationApi, ErpAuthenticationError } = await loadClientWithEnv({});
    await expect(callErpIntegrationApi({ path: "/x" })).rejects.toBeInstanceOf(ErpAuthenticationError);
  });

  it("maps a 403 response to ErpAuthenticationError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403 })));
    const { callErpIntegrationApi, ErpAuthenticationError } = await loadClientWithEnv({});
    await expect(callErpIntegrationApi({ path: "/x" })).rejects.toBeInstanceOf(ErpAuthenticationError);
  });

  it("maps a non-ok, non-auth response (e.g. 500) to ErpUnexpectedResponseError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
    const { callErpIntegrationApi, ErpUnexpectedResponseError } = await loadClientWithEnv({});
    await expect(callErpIntegrationApi({ path: "/x" })).rejects.toBeInstanceOf(ErpUnexpectedResponseError);
  });

  it("maps a network-level failure to ErpUnavailableError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );
    const { callErpIntegrationApi, ErpUnavailableError } = await loadClientWithEnv({});
    await expect(callErpIntegrationApi({ path: "/x" })).rejects.toBeInstanceOf(ErpUnavailableError);
  });

  it("maps a request that exceeds the timeout to ErpTimeoutError, via a real AbortController", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string | URL, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const err = new Error("This operation was aborted");
              err.name = "AbortError";
              reject(err);
            });
          })
      )
    );
    const { callErpIntegrationApi, ErpTimeoutError } = await loadClientWithEnv({ ERP_REQUEST_TIMEOUT_MS: 10 });
    await expect(callErpIntegrationApi({ path: "/x" })).rejects.toBeInstanceOf(ErpTimeoutError);
  });
});
