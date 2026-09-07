import { expect, test } from "@playwright/test";

test.describe("desktop navigation", () => {
  test("shows the five categories and Shop as direct links, and they navigate correctly", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "التنقل الرئيسي" });
    await expect(nav.getByRole("link", { name: "تمور" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "عسل" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "زيوت" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "مكسرات" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "سمن" })).toBeVisible();

    await nav.getByRole("link", { name: "تمور" }).click();
    await expect(page).toHaveURL(/\/shop\/dates$/);
    await expect(page.getByRole("heading", { name: "تمور", exact: true })).toBeVisible();
  });

  test("skip-to-content link is the first focusable element", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "تخطي إلى المحتوى" })).toBeFocused();
  });
});

test.describe("cart drawer", () => {
  test("opens from the header, shows the empty state, and closes", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "السلة، لا عناصر" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("السلة فارغة")).toBeVisible();

    await dialog.getByRole("button", { name: "إغلاق" }).click();
    await expect(dialog).toBeHidden();
  });
});

test.describe("mobile navigation", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("hamburger opens a drawer with categories under an accordion, and Escape closes it", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "فتح قائمة التنقل" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: "المتجر" })).toBeVisible();

    await dialog.getByRole("button", { name: "الفئات" }).click();
    await expect(dialog.getByRole("link", { name: "تمور" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
