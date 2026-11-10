import { test, expect } from "@playwright/test";

function getFutureWorkingDate(): string {
  const date = new Date(Date.now() + 2 * 86400000);
  while (date.getUTCDay() === 0) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}

test("FE24: Unknown site и prototype keys — 404 в browser", async ({ page }) => {
  const routes = [
    "/demo/nonexistent-site-xyz",
    "/demo/constructor",
    "/demo/toString",
    "/demo/__proto__",
    "/demo/constructor/privacy",
    "/demo/toString/privacy",
    "/demo/__proto__/privacy",
  ];

  for (const r of routes) {
    const response = await page.goto(r);
    expect(response?.status()).toBe(404);
  }
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

test("FE26: Console/Storage/URL — подписка до ввода, нет утечки телефона", async ({ page }) => {
  const consoleMessages: string[] = [];

  // Subscribe to all console events BEFORE opening page or filling form
  page.on("console", (msg) => {
    consoleMessages.push(msg.text());
  });

  await page.route("**/api/leads", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        leadId: "00000000-0000-4000-8000-000000000026",
        status: "received",
        replayed: false,
        message: "Заявка сохранена.",
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

  const secretPhone = "+70000000000";
  await page.getByTestId("customer-phone").fill(secretPhone);
  await page.getByTestId("customer-name").fill("ТестовыйКлиент");
  await page.getByTestId("consent").check();

  await page.getByTestId("lead-submit").click();
  await expect(page.getByTestId("lead-success")).toBeVisible();

  // 1. Verify phone is not in localStorage or sessionStorage
  const localData = await page.evaluate(() => JSON.stringify(window.localStorage));
  const sessionData = await page.evaluate(() => JSON.stringify(window.sessionStorage));
  const currentUrl = page.url();

  expect(localData).not.toContain(secretPhone);
  expect(sessionData).not.toContain(secretPhone);
  expect(currentUrl).not.toContain(secretPhone);

  // 2. Verify phone was never output to console logs
  const leakedConsoleLog = consoleMessages.find((m) => m.includes(secretPhone));
  expect(leakedConsoleLog).toBeUndefined();
});

test("FE27: Новая заявка после успеха — разные UUID idempotency-key и очистка ввода", async ({ page }) => {
  const idempotencyKeys: string[] = [];

  await page.route("**/api/leads", async (route) => {
    const key = route.request().headers()["idempotency-key"];
    if (key) idempotencyKeys.push(key);

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        leadId: `00000000-0000-4000-8000-00000000002${idempotencyKeys.length}`,
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
  expect(idempotencyKeys).toHaveLength(1);

  // Click "Оставить ещё одну заявку"
  await page.getByRole("button", { name: "Оставить ещё одну заявку" }).click();

  await expect(page.getByTestId("offer-step")).toBeVisible();
  await page.getByTestId("next-to-preference").click();

  // On step 2, provide date & time to proceed to contact step
  await page.getByTestId("preferred-date").fill(futureDate);
  await page.getByTestId("preferred-time").selectOption("10:30");
  await page.getByTestId("next-to-contact").click();

  // Contact and consent must be completely cleared
  await expect(page.getByTestId("contact-step")).toBeVisible();
  await expect(page.getByTestId("customer-phone")).toHaveValue("");
  await expect(page.getByTestId("consent")).not.toBeChecked();

  // Fill second lead and submit
  await page.getByTestId("customer-phone").fill("+70000000000");
  await page.getByTestId("consent").check();
  await page.getByTestId("lead-submit").click();

  await expect(page.getByTestId("lead-success")).toBeVisible();
  expect(idempotencyKeys).toHaveLength(2);

  // Assert both keys are valid UUIDs and are distinct
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  expect(uuidRegex.test(idempotencyKeys[0])).toBe(true);
  expect(uuidRegex.test(idempotencyKeys[1])).toBe(true);
  expect(idempotencyKeys[0]).not.toBe(idempotencyKeys[1]);
});

test("FE28: Без backend и без route mock — честная ошибка, не успех", async ({ page }) => {
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

test("FE29: FR2 — Невалидная квитанция (not-a-uuid) отклоняется и показывает ошибку", async ({ page }) => {
  await page.route("**/api/leads", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        leadId: "not-a-uuid",
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

  // Must NOT show success, must show lead-error
  await expect(page.getByTestId("lead-success")).not.toBeVisible();
  await expect(page.getByTestId("lead-error")).toBeVisible();
  await expect(page.getByText("Ответ сервера не соответствует квитанции заявки")).toBeVisible();
});

test("FE30: FR3 — 422 preferred.time показывает понятную сводку и позволяет исправить", async ({ page }) => {
  await page.route("**/api/leads", async (route) => {
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "VALIDATION_FAILED",
          message: "Пожалуйста, выберите другое время",
          requestId: "req-fe30-pref-time",
          fieldErrors: {
            "preferred.time": "Выбранное время уже занято другим клиентом",
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

  // Verify step2 error summary is visible on step 3
  await expect(page.getByTestId("step2-error-summary")).toBeVisible();
  await expect(page.getByText("Выбранное время уже занято другим клиентом")).toBeVisible();

  // Jump to step 2 to fix
  await page.getByTestId("fix-step2-errors").click();
  await expect(page.getByTestId("preference-step")).toBeVisible();

  // Select another slot
  await page.getByTestId("preferred-time").selectOption("11:00");

  // Move to step 3 again — contact data is preserved!
  await page.getByTestId("next-to-contact").click();
  await expect(page.getByTestId("contact-step")).toBeVisible();
  await expect(page.getByTestId("customer-phone")).toHaveValue("+70000000000");
  await expect(page.getByTestId("consent")).toBeChecked();
});
