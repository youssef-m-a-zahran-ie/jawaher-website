import { expect, test } from "@playwright/test";

/**
 * Smoke test for every route established this phase
 * (docs/planning/feature-completeness-audit.md's Phase 3 section) — proves
 * the route structure resolves, not the full page content.
 */
const ROUTES = [
  "/",
  "/shop",
  "/shop/dates",
  "/shop/honey",
  "/shop/oils",
  "/shop/nuts",
  "/shop/ghee",
  "/product/mock-dates-sample",
  "/search",
  "/search?q=%D8%AA%D9%85%D8%B1",
  "/about",
  "/contact",
  "/policies/shipping",
  "/policies/returns",
  "/policies/payment",
  "/policies/privacy",
  "/policies/terms",
  "/account",
];

for (const route of ROUTES) {
  test(`GET ${route} responds 200`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
  });
}

test("sitemap.xml and robots.txt respond 200", async ({ page }) => {
  const sitemap = await page.goto("/sitemap.xml");
  expect(sitemap?.status()).toBe(200);
  const robots = await page.goto("/robots.txt");
  expect(robots?.status()).toBe(200);
});
