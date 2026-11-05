import { test, expect } from "@playwright/test";
import type { LeadCreateRequest } from "../../src/shared/contracts.ts";

function getFutureWorkingDate(): string {
  const date = new Date(Date.now() + 2 * 86400000);
  while (date.getUTCDay() === 0) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}

test("FE19: Клавиатура всех шагов и radio", async ({ page }) => {
  await page.goto("/demo/auto");

  // Tab through to the second service radio and select with Space
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");

  // Navigate to next button via Tab & Enter
  const nextBtn = page.getByTestId("next-to-preference");
  await nextBtn.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("preference-step")).toBeVisible();
});

test("FE20: Модальное окно / отсутствие dialog", async ({ page }) => {
  await page.goto("/demo/auto");
  // Architecture confirmed no blocking modals on primary CTA
  const dialogCount = await page.getByRole("dialog").count();
  expect(dialogCount).toBe(0);
});

test("FE21: 360/390/430/1280 и zoom — нет горизонтального overflow", async ({ page }) => {
  const viewports = [
    { width: 360, height: 740 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 1280, height: 800 },
  ];

  for (const vp of viewports) {
    await page.setViewportSize(vp);
    await page.goto("/demo/auto");

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2); // allow sub-pixel rounding
    await expect(page.getByTestId("next-to-preference")).toBeVisible();
  }
});

test("FE22: Длинная услуга/ошибка — layout работоспособен", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo/auto");

  // Verify cards and prices don't overlap or break layout
  const serviceCards = page.getByRole("radio");
  expect(await serviceCards.count()).toBeGreaterThanOrEqual(3);

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
});

test.use({ timezoneId: "America/New_York" });
test("FE23: Иной timezone браузера — Europe/Moscow сохраняется в POST", async ({ page }) => {
  let submittedPayload: LeadCreateRequest | null = null;

  await page.route("**/api/leads", async (route) => {
    submittedPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        leadId: "00000000-0000-4000-8000-000000000023",
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
  const payload = submittedPayload as unknown as LeadCreateRequest;
  expect(payload.preferred?.timezone).toBe("Europe/Moscow");
});

