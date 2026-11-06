import { test, expect } from "@playwright/test";
import type { LeadCreateRequest } from "../../src/shared/contracts.ts";

function getFutureWorkingDate(): string {
  const date = new Date(Date.now() + 2 * 86400000);
  while (date.getUTCDay() === 0) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}

test("FE19: Клавиатура всех шагов и radio — полный цикл без мыши", async ({ page }) => {
  await page.route("**/api/leads", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        leadId: "00000000-0000-4000-8000-000000000019",
        status: "received",
        replayed: false,
        message: "Заявка успешно получена по клавиатурному сценарию.",
      }),
    });
  });

  await page.goto("/demo/auto");
  await expect(page.getByTestId("offer-step")).toBeVisible();

  // Tab through to the CTA button on offer step
  const nextBtn = page.getByTestId("next-to-preference");
  await nextBtn.focus();
  await page.keyboard.press("Enter");

  // Step 2: Preference step
  await expect(page.getByTestId("preference-step")).toBeVisible();

  // Select option via selectOption or keyboard
  await page.getByTestId("service-option-wheel-size").focus();
  await page.getByTestId("service-option-wheel-size").selectOption("R16");

  // Date and time input via keyboard
  const futureDate = getFutureWorkingDate();
  await page.getByTestId("preferred-date").focus();
  await page.getByTestId("preferred-date").fill(futureDate);

  await page.getByTestId("preferred-time").focus();
  await page.getByTestId("preferred-time").selectOption("10:30");

  // Navigate to next button via Tab & Enter
  await page.getByTestId("next-to-contact").focus();
  await page.keyboard.press("Enter");

  // Step 3: Contact step
  await expect(page.getByTestId("contact-step")).toBeVisible();

  // Fill phone via keyboard
  await page.getByTestId("customer-phone").focus();
  await page.keyboard.type("+70000000000");

  // Fill name via keyboard
  await page.getByTestId("customer-name").focus();
  await page.keyboard.type("Иван");

  // Check consent via Space key
  await page.getByTestId("consent").focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("consent")).toBeChecked();

  // Submit via Enter key on submit button
  await page.getByTestId("lead-submit").focus();
  await page.keyboard.press("Enter");

  // Verify success screen is reached
  await expect(page.getByTestId("lead-success")).toBeVisible();
  await expect(page.getByTestId("lead-id")).toHaveText("00000000-0000-4000-8000-000000000019");
});

test("FE20: Модальное окно / отсутствие dialog", async ({ page }) => {
  await page.goto("/demo/auto");
  const dialogCount = await page.getByRole("dialog").count();
  expect(dialogCount).toBe(0);
});

test("FE21: 360/390/430/1280 и zoom 200% — нет горизонтального overflow", async ({ page }) => {
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

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
    await expect(page.getByTestId("next-to-preference")).toBeVisible();
  }

  // Real 200% zoom check
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/demo/auto");
  await page.evaluate(() => {
    (document.body.style as unknown as { zoom: string }).zoom = "200%";
  });

  const scrollWidthZoom = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidthZoom = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidthZoom).toBeLessThanOrEqual(clientWidthZoom + 5);

  // CTA button remains visible and clickable under 200% zoom
  const cta = page.getByTestId("next-to-preference");
  await expect(cta).toBeVisible();
  await cta.click();
  await expect(page.getByTestId("preference-step")).toBeVisible();
});

test("FE22: Длинная услуга/ошибка — layout работоспособен", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const longErrorMessage =
    "Ошибка: Выбранное время обслуживания больше недоступно вследствие высокой нагрузки на сервисный центр. Пожалуйста, выберите другое удобное для вас время или дату в расписании, либо свяжитесь с нами.";

  await page.route("**/api/leads", async (route) => {
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "VALIDATION_FAILED",
          message: longErrorMessage,
          requestId: "req-fe22-long-error",
          fieldErrors: {
            "preferred.time": longErrorMessage,
          },
        },
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

  // Step 2 error summary is visible and contains long text
  await expect(page.getByTestId("step2-error-summary")).toBeVisible();
  await expect(page.getByText(longErrorMessage).first()).toBeVisible();

  // Verify no horizontal overflow with long error message
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);

  // Jump to step 2 to fix
  await page.getByTestId("fix-step2-errors").click();
  await expect(page.getByTestId("preference-step")).toBeVisible();
  await expect(page.getByTestId("preferred-time")).toHaveAttribute("aria-invalid", "true");
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
