import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 9.6 — ERP order adapter tests. Mirrors erp-catalog-adapter.test.ts's
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
  return import("@/modules/erp-integration/orders");
}

function stubFetchOnce(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status }))
  );
}

const VALID_PUSH_PAYLOAD = {
  websiteOrderId: "33333333-3333-3333-3333-333333333333",
  customer: { phoneE164: "+201001234567", name: "عميل الاختبار" },
  lines: [{ erpVariantId: "erp-v1", quantity: 2, unitPrice: "185.0000" }],
};

describe("erpOrderAdapter.pushOrder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("@/lib/env");
  });

  it("returns the parsed erpOrderReference/primaryStatus/deduplicated on success", async () => {
    stubFetchOnce({ erpOrderReference: "erp-order-1", primaryStatus: "pending_validation", deduplicated: false, requestId: "rid" });
    const { erpOrderAdapter } = await loadAdapterWithEnv();

    const result = await erpOrderAdapter.pushOrder(VALID_PUSH_PAYLOAD);
    expect(result.erpOrderReference).toBe("erp-order-1");
    expect(result.primaryStatus).toBe("pending_validation");
    expect(result.deduplicated).toBe(false);
  });

  it("sends a POST with the exact payload as the JSON body", async () => {
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL, init?: RequestInit) => {
        capturedInit = init;
        return new Response(JSON.stringify({ erpOrderReference: "e1", primaryStatus: "pending_validation", deduplicated: false }), { status: 200 });
      })
    );
    const { erpOrderAdapter } = await loadAdapterWithEnv();

    await erpOrderAdapter.pushOrder(VALID_PUSH_PAYLOAD);

    expect(capturedInit?.method).toBe("POST");
    expect(JSON.parse(String(capturedInit?.body))).toEqual(VALID_PUSH_PAYLOAD);
  });

  it("throws ErpOrderRejectedError (not a generic failure) when ERP returns business_rule_violation", async () => {
    stubFetchOnce({ error: { code: "business_rule_violation", message: "No active warehouse exists for this company." } }, 422);
    const { erpOrderAdapter, ErpOrderRejectedError } = await loadAdapterWithEnv();

    await expect(erpOrderAdapter.pushOrder(VALID_PUSH_PAYLOAD)).rejects.toBeInstanceOf(ErpOrderRejectedError);
  });

  it("throws ErpInvalidOrderResponseError on a malformed success response", async () => {
    stubFetchOnce({ erpOrderReference: "e1" }); // missing primaryStatus/deduplicated
    const { erpOrderAdapter, ErpInvalidOrderResponseError } = await loadAdapterWithEnv();

    await expect(erpOrderAdapter.pushOrder(VALID_PUSH_PAYLOAD)).rejects.toBeInstanceOf(ErpInvalidOrderResponseError);
  });

  it("propagates ErpAuthenticationError from the underlying client on a 401", async () => {
    stubFetchOnce(null, 401);
    const { erpOrderAdapter } = await loadAdapterWithEnv();
    const { ErpAuthenticationError } = await import("@/modules/erp-integration/client");

    await expect(erpOrderAdapter.pushOrder(VALID_PUSH_PAYLOAD)).rejects.toBeInstanceOf(ErpAuthenticationError);
  });

  it("propagates ErpUnavailableError from the underlying client on a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );
    const { erpOrderAdapter } = await loadAdapterWithEnv();
    const { ErpUnavailableError } = await import("@/modules/erp-integration/client");

    await expect(erpOrderAdapter.pushOrder(VALID_PUSH_PAYLOAD)).rejects.toBeInstanceOf(ErpUnavailableError);
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
    const { erpOrderAdapter } = await loadAdapterWithEnv({ ERP_REQUEST_TIMEOUT_MS: 10 });
    const { ErpTimeoutError } = await import("@/modules/erp-integration/client");

    await expect(erpOrderAdapter.pushOrder(VALID_PUSH_PAYLOAD)).rejects.toBeInstanceOf(ErpTimeoutError);
  });
});

describe("erpOrderAdapter.getOrderStatus", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("@/lib/env");
  });

  it("returns the parsed status on success", async () => {
    stubFetchOnce({ primaryStatus: "confirmed", subStatus: "ready_to_confirm", paymentStatus: "unpaid", cancelledAt: null });
    const { erpOrderAdapter } = await loadAdapterWithEnv();

    const status = await erpOrderAdapter.getOrderStatus("website-order-1");
    expect(status).toEqual({ primaryStatus: "confirmed", subStatus: "ready_to_confirm", paymentStatus: "unpaid", cancelledAt: null });
  });

  it("returns null (not a thrown error) on a 404 — no ERP order exists yet", async () => {
    stubFetchOnce({ error: { code: "not_found", message: "No ERP order found." } }, 404);
    const { erpOrderAdapter } = await loadAdapterWithEnv();

    const status = await erpOrderAdapter.getOrderStatus("website-order-1");
    expect(status).toBeNull();
  });

  it("requests the status by the website order id in the URL path", async () => {
    let capturedUrl: string | URL | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ primaryStatus: "confirmed", subStatus: null, paymentStatus: "unpaid", cancelledAt: null }), { status: 200 });
      })
    );
    const { erpOrderAdapter } = await loadAdapterWithEnv();

    await erpOrderAdapter.getOrderStatus("website-order-1");
    expect(String(capturedUrl)).toBe("http://localhost:9999/api/v1/integrations/website/orders/website-order-1");
  });
});

describe("erpOrderAdapter.cancelOrder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("@/lib/env");
  });

  it("returns the updated status on success", async () => {
    stubFetchOnce({ primaryStatus: "cancelled", subStatus: null, paymentStatus: "unpaid", cancelledAt: "2026-01-01T00:00:00.000Z" });
    const { erpOrderAdapter } = await loadAdapterWithEnv();

    const status = await erpOrderAdapter.cancelOrder("website-order-1", "customer_requested");
    expect(status?.primaryStatus).toBe("cancelled");
  });

  it("returns null on a 404", async () => {
    stubFetchOnce({ error: { code: "not_found", message: "No ERP order found." } }, 404);
    const { erpOrderAdapter } = await loadAdapterWithEnv();

    expect(await erpOrderAdapter.cancelOrder("website-order-1", "reason")).toBeNull();
  });

  it("throws ErpOrderRejectedError when ERP blocks the cancellation", async () => {
    stubFetchOnce({ error: { code: "business_rule_violation", message: "Cannot cancel — payment has already been allocated." } }, 422);
    const { erpOrderAdapter, ErpOrderRejectedError } = await loadAdapterWithEnv();

    await expect(erpOrderAdapter.cancelOrder("website-order-1", "reason")).rejects.toBeInstanceOf(ErpOrderRejectedError);
  });
});
