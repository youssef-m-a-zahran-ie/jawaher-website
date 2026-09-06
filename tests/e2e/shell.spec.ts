import { expect, test } from "@playwright/test";

test("renders the RTL Arabic shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("heading", { name: "جواهر الخير" })).toBeVisible();
});
