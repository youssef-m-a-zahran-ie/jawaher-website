import { expect, test } from "@playwright/test";

test("health check responds with the standard envelope and never crashes, even without a database", async ({
  request,
}) => {
  const response = await request.get("/api/v1/health");

  // Must always be a well-formed response — a database outage degrades the
  // status field, it must never 500 the whole endpoint.
  expect(response.ok()).toBe(true);
  expect(response.headers()["x-request-id"]).toBeTruthy();

  const body = await response.json();
  expect(body.error).toBeNull();
  expect(["ok", "degraded"]).toContain(body.data.status);
  expect(["ok", "error"]).toContain(body.data.checks.database);
});
