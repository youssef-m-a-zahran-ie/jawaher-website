import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

import { isDatabaseAvailable } from "./helpers/db-availability";
import { createTestVariant, cleanupTestData } from "./helpers/fixtures";

/**
 * Shop/Search Availability Snapshot milestone — real database
 * (skipIf(!dbAvailable), same convention as this repo's other
 * integration tests), mocked ERP HTTP layer (mirroring
 * catalog-sync.test.ts's own fetch-stubbing convention).
 */
const dbAvailable = await isDatabaseAvailable();

function mockErpEnv() {
  vi.resetModules();
  vi.doMock("@/lib/env", () => ({
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.DATABASE_URL,
      ERP_BASE_URL: "http://localhost:9999",
      ERP_API_KEY: "test-api-key",
      ERP_CONNECTION_ID: "test-connection-id",
      ERP_REQUEST_TIMEOUT_MS: undefined,
      AVAILABILITY_SNAPSHOT_FRESHNESS_MINUTES: undefined,
    },
  }));
}

function fakeErpAvailabilityServer(byErpVariantId: Record<string, number>, opts: { fail?: boolean } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      if (u.pathname.endsWith("/inventory/availability")) {
        if (opts.fail) return new Response(null, { status: 500 });
        const body = JSON.parse(String(init?.body ?? "{}")) as { variantIds: string[] };
        const items = body.variantIds
          .filter((id) => id in byErpVariantId)
          .map((id) => ({ variantId: id, available: byErpVariantId[id] }));
        const notFoundVariantIds = body.variantIds.filter((id) => !(id in byErpVariantId));
        return new Response(JSON.stringify({ items, notFoundVariantIds }), { status: 200 });
      }
      return new Response(null, { status: 404 });
    })
  );
}

describe.skipIf(!dbAvailable)("availability snapshot refresh", () => {
  const categoryIds: string[] = [];

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("@/lib/env");
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    await cleanupTestData({ categoryIds });
    await db.availabilitySnapshotRun.deleteMany({}).catch(() => null);
    await db.$disconnect();
  });

  it("persists in_stock/low_stock/out_of_stock correctly, mapped from ERP's own resolved number", async () => {
    mockErpEnv();
    const erpId1 = `test-erp-${randomUUID()}`;
    const erpId2 = `test-erp-${randomUUID()}`;
    const erpId3 = `test-erp-${randomUUID()}`;
    const a = await createTestVariant({ erpVariantId: erpId1 });
    const b = await createTestVariant({ erpVariantId: erpId2 });
    const c = await createTestVariant({ erpVariantId: erpId3 });
    categoryIds.push(a.category.id, b.category.id, c.category.id);

    fakeErpAvailabilityServer({ [erpId1]: 50, [erpId2]: 2, [erpId3]: 0 });

    const { runAvailabilitySnapshotRefresh } = await import("@/modules/availability-snapshot");
    const { db } = await import("@/lib/db");

    const outcome = await runAvailabilitySnapshotRefresh();
    expect(outcome.status).toBe("SUCCEEDED");

    const snap1 = await db.variantAvailabilitySnapshot.findUnique({ where: { variantId: a.variant.id } });
    const snap2 = await db.variantAvailabilitySnapshot.findUnique({ where: { variantId: b.variant.id } });
    const snap3 = await db.variantAvailabilitySnapshot.findUnique({ where: { variantId: c.variant.id } });
    expect(snap1?.presentationStatus).toBe("in_stock");
    expect(snap2?.presentationStatus).toBe("low_stock");
    expect(snap3?.presentationStatus).toBe("out_of_stock");
    expect(snap1?.source).toBe("erp_snapshot");
  });

  it("a failed refresh preserves the previous successful snapshot rather than zeroing it", async () => {
    mockErpEnv();
    const erpId = `test-erp-${randomUUID()}`;
    const { category, variant } = await createTestVariant({ erpVariantId: erpId });
    categoryIds.push(category.id);

    // First: a successful refresh establishes a real snapshot.
    fakeErpAvailabilityServer({ [erpId]: 20 });
    const { runAvailabilitySnapshotRefresh } = await import("@/modules/availability-snapshot");
    const { db } = await import("@/lib/db");
    const first = await runAvailabilitySnapshotRefresh();
    expect(first.status).toBe("SUCCEEDED");
    const beforeFailure = await db.variantAvailabilitySnapshot.findUnique({ where: { variantId: variant.id } });
    expect(beforeFailure?.presentationStatus).toBe("in_stock");

    // Second: ERP fails entirely this cycle.
    vi.unstubAllGlobals();
    fakeErpAvailabilityServer({}, { fail: true });
    const second = await runAvailabilitySnapshotRefresh();
    expect(second.status).toBe("FAILED");
    expect(second.variantsFailed).toBeGreaterThan(0);

    const afterFailure = await db.variantAvailabilitySnapshot.findUnique({ where: { variantId: variant.id } });
    // The presentation status and lastSuccessAt from the FIRST run must
    // survive untouched — this is the milestone's own core safety
    // requirement (never fabricate a false zero on ERP failure).
    expect(afterFailure?.presentationStatus).toBe("in_stock");
    expect(afterFailure?.lastSuccessAt.getTime()).toBe(beforeFailure?.lastSuccessAt.getTime());
    expect(afterFailure?.lastError).toBeTruthy();
  });

  it("repeated refreshes with no ERP data change are idempotent (no duplicate rows, same result)", async () => {
    mockErpEnv();
    const erpId = `test-erp-${randomUUID()}`;
    const { category, variant } = await createTestVariant({ erpVariantId: erpId });
    categoryIds.push(category.id);

    fakeErpAvailabilityServer({ [erpId]: 7 });
    const { runAvailabilitySnapshotRefresh } = await import("@/modules/availability-snapshot");
    const { db } = await import("@/lib/db");

    await runAvailabilitySnapshotRefresh();
    vi.unstubAllGlobals();
    fakeErpAvailabilityServer({ [erpId]: 7 });
    await runAvailabilitySnapshotRefresh();

    const rows = await db.variantAvailabilitySnapshot.findMany({ where: { variantId: variant.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.presentationStatus).toBe("low_stock");
  });
});
