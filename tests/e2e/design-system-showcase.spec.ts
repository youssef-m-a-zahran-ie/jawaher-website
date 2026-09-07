import { expect, test } from "@playwright/test";

/**
 * playwright.config.ts's webServer runs a real production build/server —
 * this is the regression test for the NODE_ENV guard in
 * src/app/dev/design-system/page.tsx: the dev-only showcase must never
 * accidentally ship to a real visitor.
 *
 * Status code is 200-or-404 rather than strictly 404: this route sits
 * under the root src/app/loading.tsx, whose implicit Suspense boundary
 * makes notFound() a documented Next.js 16 "soft 404" (200 + noindex)
 * instead of a hard one — see tests/e2e/not-found.spec.ts's comment and
 * docs/architecture/technical-decisions.md's Phase 3 section for the full
 * explanation. What actually matters — no showcase content ships, and
 * search engines are told not to index it — is what's asserted here.
 */
test("the design-system showcase never ships its real content in production", async ({ page }) => {
  const response = await page.goto("/dev/design-system");
  expect([200, 404]).toContain(response?.status());
  await expect(page.getByText("الصفحة غير موجودة")).toBeVisible();
  await expect(page.getByText("Phase 2 — Development Only")).toHaveCount(0);
  await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();
});
