import { expect, test } from "@playwright/test";

test("health check responds with the standard envelope and never crashes, even without a database", async ({
  request,
}) => {
  const response = await request.get("/api/v1/health");

  // Phase 12 — this is a READINESS check: 200 when able to serve traffic,
  // 503 when not (a database outage), never a raw 500 crash. Previously
  // always returned 200 even when degraded, which a status-code-only
  // infrastructure health check would have misread as healthy — see
  // this route's own comment. Both outcomes below are equally "did not
  // crash"; only the specific status code differs by design.
  expect([200, 503]).toContain(response.status());
  expect(response.headers()["x-request-id"]).toBeTruthy();

  const body = await response.json();
  expect(body.error).toBeNull();
  expect(["ok", "degraded"]).toContain(body.data.status);
  expect(["ok", "error"]).toContain(body.data.checks.database);
  expect(response.status()).toBe(body.data.status === "ok" ? 200 : 503);
});
