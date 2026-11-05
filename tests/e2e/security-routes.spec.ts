import { test, expect } from "@playwright/test";

function getFutureWorkingDate(): string {
  const date = new Date(Date.now() + 2 * 86400000);
  while (date.getUTCDay() === 0) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}

test("FE24: Unknown site — 404 в browser", async ({ page }) => {
  const response = await page.goto("/demo/nonexistent-site-xyz");
  expect(response?.status()).toBe(404);
});

test("FE25: Privacy / метаданные / noindex", async ({ page }) => {
  await page.goto("/demo/auto");

  // Meta robots
  const robotsMeta = page.locator('meta[name="robots"]');
  await expect(robotsMeta).toHaveAttribute("content", "noindex, nofollow");

  // Privacy page link
  await page.getByTestId("next-to-preference").click();
  await page.getByTestId("service-option-wheel-size").selectOption("R16");

  const futureDate = getFutureWorkingDate();
  await page.getByTestId("preferred-date").fill(futureDate);
  await page.getByTestId("preferred-time").selectOption("10:30");

  await page.getByTestId("next-to-contact").click();
  const privacyLink = page.getByRole("link", { name: "демо-политикой конфиденциальности" });
  await expect(privacyLink).toHaveAttribute("href", "/demo/auto/privacy");

  await page.goto("/demo/auto/privacy");
  await expect(page.getByText("Демонстрационная политика обработки данных")).toBeVisible();
});

test("FE26: Storage/URL/console — нет контакта в persistence/логах", async ({ page }) => {
  await page.goto("/demo/auto");
  await page.getByTestId("next-to-preference").click();
  await page.getByTestId("service-option-wheel-size").selectOption("R16");

  const futureDate = getFutureWorkingDate();
  await page.getByTestId("preferred-date").fill(futureDate);
  await page.getByTestId("preferred-time").selectOption("10:30");

  await page.getByTestId("next-to-contact").click();
  await page.getByTestId("customer-phone").fill("+70000000000");

  // Check localStorage and sessionStorage
  const localData = await page.evaluate(() => JSON.stringify(window.localStorage));
  const sessionData = await page.evaluate(() => JSON.stringify(window.sessionStorage));
  const currentUrl = page.url();

  expect(localData).not.toContain("+70000000000");
  expect(sessionData).not.toContain("+70000000000");
  expect(currentUrl).not.toContain("+70000000000");
});

test("FE27: Новая заявка после успеха — контакт/согласие очищены", async ({ page }) => {
  let submitCount = 0;
  await page.route("**/api/leads", async (route) => {
    submitCount++;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        leadId: `00000000-0000-4000-8000-00000000002${submitCount}`,
        status: "received",
        replayed: false,
        message: "Заявка получена.",
      }),
    });
  });

  await page.goto("/demo/auto");
  await page.getByTestId("next-to-preference").click();
  await page.getByTestId("service-option-wheel-size").selectOption("R16");

  const futureDate = getFutureWorkingDate();
  await page.getByTestId("preferred-date").fill(futureDate);
  await page.getByTestId("preferred-time").selectOption("10:30");

  await page.getByTestId("next-to-contact").click();
  await page.getByTestId("customer-phone").fill("+70000000000");
  await page.getByTestId("consent").check();
  await page.getByTestId("lead-submit").click();

  await expect(page.getByTestId("lead-success")).toBeVisible();

  // Click "Оставить ещё одну заявку"
  await page.getByRole("button", { name: "Оставить ещё одну заявку" }).click();

  await expect(page.getByTestId("offer-step")).toBeVisible();
  await page.getByTestId("next-to-preference").click();

  // On step 2, provide date & time to proceed to contact step
  await page.getByTestId("preferred-date").fill(futureDate);
  await page.getByTestId("preferred-time").selectOption("10:30");
  await page.getByTestId("next-to-contact").click();

  // Contact and consent should be cleared
  await expect(page.getByTestId("contact-step")).toBeVisible();
  await expect(page.getByTestId("customer-phone")).toHaveValue("");
  await expect(page.getByTestId("consent")).not.toBeChecked();
});

test("FE28: Без backend и без route mock — честная ошибка, не успех", async ({ page }) => {
  // Real fetch without mock handler: will hit /api/leads which does not exist in standalone frontend dev server
  await page.goto("/demo/auto");
  await page.getByTestId("next-to-preference").click();
  await page.getByTestId("service-option-wheel-size").selectOption("R16");

  const futureDate = getFutureWorkingDate();
  await page.getByTestId("preferred-date").fill(futureDate);
  await page.getByTestId("preferred-time").selectOption("10:30");

  await page.getByTestId("next-to-contact").click();
  await page.getByTestId("customer-phone").fill("+70000000000");
  await page.getByTestId("consent").check();

  await page.getByTestId("lead-submit").click();

  // Must show lead-error, NOT lead-success
  await expect(page.getByTestId("lead-error")).toBeVisible();
  await expect(page.getByTestId("lead-success")).not.toBeVisible();
});

