import { expect, test } from "@playwright/test";

/**
 * A route with no matching file at all (no page.tsx anywhere in the tree)
 * gets a real 404 status, since Next.js never starts streaming a shell for
 * it in the first place.
 */
test("GET /this-route-does-not-exist returns a real 404 with the branded not-found page", async ({ page }) => {
  const response = await page.goto("/this-route-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("الصفحة غير موجودة")).toBeVisible();
});

/**
 * These call notFound() from inside a dynamic-segment page that sits under
 * a `loading.tsx` ancestor (the root src/app/loading.tsx, or
 * (storefront)/shop/loading.tsx for the category route) — Next.js streams
 * that loading shell as an immediate 200 before the page (and its
 * notFound() call) resolves, so the status can't change afterward. This is
 * documented Next.js 16 behavior (see notFound()'s own docs: "a soft 404
 * out of search results" via the noindex tag it injects), not a bug — see
 * docs/architecture/technical-decisions.md's Phase 3 section. What
 * actually matters is verified instead: the correct branded not-found UI
 * renders (never real page content) and noindex is set so it's excluded
 * from search results regardless of the status code.
 */
const SOFT_NOT_FOUND_ROUTES = ["/shop/not-a-category", "/product/not-a-product", "/policies/not-a-policy"];

for (const route of SOFT_NOT_FOUND_ROUTES) {
  test(`GET ${route} renders the branded not-found page and is excluded from indexing`, async ({ page }) => {
    const response = await page.goto(route);
    expect([200, 404]).toContain(response?.status());
    await expect(page.getByText("الصفحة غير موجودة")).toBeVisible();
    await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();
  });
}
