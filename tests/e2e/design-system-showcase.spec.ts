import { expect, test } from "@playwright/test";

test("the design-system showcase is not reachable in production", async ({ request }) => {
  // playwright.config.ts's webServer runs `npm run build && npm run start`
  // (a real production build) — this is the regression test for the
  // NODE_ENV guard in src/app/dev/design-system/page.tsx: the dev-only
  // showcase must never accidentally ship to a real visitor.
  const response = await request.get("/dev/design-system");
  expect(response.status()).toBe(404);
});
