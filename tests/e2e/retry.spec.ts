import { test, expect } from "@playwright/test";

function getFutureWorkingDate(): string {
  const date = new Date(Date.now() + 2 * 86400000);
  while (date.getUTCDay() === 0) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}

test("FE11: Network abort → ручной retry — ввод и key прежние", async ({ page }) => {
  const attempts: Array<{ key: string | undefined; body: unknown }> = [];

  await page.route("**/api/leads", async (route) => {
    const req = route.request();
    attempts.push({ key: req.headers()["idempotency-key"], body: req.postDataJSON() });
    if (attempts.length === 1) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        leadId: "00000000-0000-4000-8000-000000000011",
        status: "received",
        replayed: false,
        message: "Заявка получена. Администратор подтвердит время.",
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

  await expect(page.getByTestId("lead-error")).toBeVisible();
  await expect(page.getByTestId("customer-phone")).toHaveValue("+70000000000");

  await page.getByTestId("lead-retry").click();
  await expect(page.getByTestId("lead-success")).toBeVisible();

  expect(attempts).toHaveLength(2);
  expect(attempts[0].key).toBeTruthy();
  expect(attempts[1].key).toBe(attempts[0].key);
  expect(attempts[1].body).toEqual(attempts[0].body);
});

test("FE12: Timeout → retry — ввод и key прежние, нет ложного успеха", async ({ page }) => {
  const attempts: Array<{ key: string | undefined }> = [];

  await page.route("**/api/leads", async (route) => {
    attempts.push({ key: route.request().headers()["idempotency-key"] });
    if (attempts.length === 1) {
      await route.abort("timedout");
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        leadId: "00000000-0000-4000-8000-000000000012",
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

  await expect(page.getByTestId("lead-error")).toBeVisible();
  await page.getByTestId("lead-retry").click();
  await expect(page.getByTestId("lead-success")).toBeVisible();

  expect(attempts).toHaveLength(2);
  expect(attempts[0].key).toBe(attempts[1].key);
});

test("FE13: 422 fieldErrors — у соответствующих полей", async ({ page }) => {
  await page.route("**/api/leads", async (route) => {
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "VALIDATION_FAILED",
          message: "Проверьте поля формы.",
          requestId: "00000000-0000-4000-8000-000000000422",
          fieldErrors: { "customer.phone": "Телефон заблокирован оператором" },
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

  await expect(page.getByTestId("lead-error")).toBeVisible();
  await expect(page.getByText("Телефон заблокирован оператором")).toBeVisible();
});

test("FE14: 409 config/consent — нет автоповтора/автосогласия", async ({ page }) => {
  let callCount = 0;
  await page.route("**/api/leads", async (route) => {
    callCount++;
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "CONFIG_CHANGED",
          message: "Конфигурация изменилась. Пожалуйста, обновите страницу.",
          requestId: "00000000-0000-4000-8000-000000000409",
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

  await expect(page.getByTestId("lead-error")).toBeVisible();
  await expect(page.getByText("Конфигурация изменилась")).toBeVisible();

  // Verify no automatic retry occurred
  await page.waitForTimeout(500);
  expect(callCount).toBe(1);
});

test("FE15: 429 Retry-After — кнопка/статус согласно cooldown", async ({ page }) => {
  await page.route("**/api/leads", async (route) => {
    await route.fulfill({
      status: 429,
      headers: { "Retry-After": "2" },
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "RATE_LIMITED",
          message: "Слишком много запросов. Подождите немного.",
          requestId: "00000000-0000-4000-8000-000000000429",
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

  await expect(page.getByTestId("lead-error")).toBeVisible();
  await expect(page.getByTestId("lead-retry")).toBeDisabled();

  // Wait for cooldown countdown (2s)
  await expect(page.getByTestId("lead-retry")).toBeEnabled({ timeout: 5000 });
});

test("FE16: 500/503 — поля сохранены, повтор возможен", async ({ page }) => {
  await page.route("**/api/leads", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "STORAGE_UNAVAILABLE",
          message: "База данных временно недоступна.",
          requestId: "00000000-0000-4000-8000-000000000503",
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

  await expect(page.getByTestId("lead-error")).toBeVisible();
  await expect(page.getByTestId("customer-phone")).toHaveValue("+70000000000");
  await expect(page.getByTestId("lead-retry")).toBeEnabled();
});

test("FE17: 200 с HTML/битым JSON/неверным receipt — не показывает успех", async ({ page }) => {
  await page.route("**/api/leads", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body>Proxy error</body></html>",
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

  await expect(page.getByTestId("lead-error")).toBeVisible();
  await expect(page.getByTestId("lead-success")).not.toBeVisible();
});

test("FE18: Повтор receipt 200 replayed — тот же результат", async ({ page }) => {
  await page.route("**/api/leads", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        leadId: "00000000-0000-4000-8000-000000000018",
        status: "received",
        replayed: true,
        message: "Заявка уже была сохранена ранее.",
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
  await expect(page.getByTestId("lead-id")).toHaveText("00000000-0000-4000-8000-000000000018");
});

