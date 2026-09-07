import { expect, test } from "@playwright/test";

test("submitting the contact form succeeds end-to-end against the real API route", async ({ page }) => {
  await page.goto("/contact");

  await page.getByLabel("الاسم").fill("سارة أحمد");
  await page.getByLabel("رقم الهاتف أو البريد الإلكتروني").fill("01000000000");
  await page.getByLabel("الرسالة").fill("أريد الاستفسار عن أوقات التوصيل، شكرًا لكم.");
  await page.getByRole("button", { name: "إرسال" }).click();

  await expect(page.getByText("تم استلام رسالتك")).toBeVisible();
});

test("rejects a too-short message with a field-level error, without a page crash", async ({ page }) => {
  await page.goto("/contact");

  await page.getByLabel("الاسم").fill("سارة");
  await page.getByLabel("رقم الهاتف أو البريد الإلكتروني").fill("01000000000");
  // Bypass the native minlength constraint so the request actually reaches the API's own validation.
  await page.getByLabel("الرسالة").evaluate((el) => el.removeAttribute("minlength"));
  await page.getByLabel("الرسالة").fill("قصير");
  await page.getByRole("button", { name: "إرسال" }).click();

  await expect(page.getByText("تعذّر إرسال الرسالة")).toBeVisible();
});
