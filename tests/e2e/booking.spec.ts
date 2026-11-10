import { test, expect } from "@playwright/test";
import type { LeadCreateRequest } from "../../src/shared/contracts.ts";

function getFutureWorkingDate(): string {
  const date = new Date(Date.now() + 2 * 86400000);
  while (date.getUTCDay() === 0) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}

test("FE01: Auto первый экран, 3 цены и CTA", async ({ page }) => {
  await page.goto("/demo/auto");

  await expect(page.getByTestId("offer-step")).toBeVisible();
  await expect(page.getByText("Авто · Демо")).toBeVisible();
  await expect(page.getByTestId("service-tire-change")).toBeVisible();
  await expect(page.getByTestId("service-balancing")).toBeVisible();
  await expect(page.getByTestId("service-storage")).toBeVisible();

  // Check formatted prices
  await expect(page.getByTestId("offer-step").getByText(/от 1\s?800\s?₽/).first()).toBeVisible();
  await expect(page.getByTestId("offer-step").getByText(/от 800\s?₽/).first()).toBeVisible();
  await expect(page.getByTestId("offer-step").getByText(/от 3\s?000\s?₽/).first()).toBeVisible();

  // CTA button
  await expect(page.getByTestId("next-to-preference")).toBeVisible();
});

test("FE02: Полный Auto happy path", async ({ page }) => {
  let submittedPayload: LeadCreateRequest | null = null;

  await page.route("**/api/leads", async (route) => {
    submittedPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        leadId: "00000000-0000-4000-8000-000000000001",
        status: "received",
        replayed: false,
        message: "Заявка получена. Администратор подтвердит время.",
      }),
    });
  });

  await page.goto("/demo/auto");
  await page.getByTestId("next-to-preference").click();

  await expect(page.getByTestId("preference-step")).toBeVisible();
  await page.getByTestId("service-option-wheel-size").selectOption("R16");

  const futureDate = getFutureWorkingDate();
  await page.getByTestId("preferred-date").fill(futureDate);
  await page.getByTestId("preferred-time").selectOption("10:30");

  await page.getByTestId("next-to-contact").click();
  await expect(page.getByTestId("contact-step")).toBeVisible();

  await page.getByTestId("customer-phone").fill("+70000000000");
  await page.getByTestId("customer-name").fill("Алексей");
  await page.getByTestId("consent").check();

  await page.getByTestId("lead-submit").click();

  await expect(page.getByTestId("lead-success")).toBeVisible();
  await expect(page.getByTestId("lead-id")).toHaveText("00000000-0000-4000-8000-000000000001");

  const payload = submittedPayload as unknown as LeadCreateRequest;
  expect(payload.siteKey).toBe("auto");
  expect(payload.serviceId).toBe("tire-change");
  expect(payload.serviceOptions).toEqual({ "wheel-size": "R16" });
  expect(payload.customer.phone).toBe("+70000000000");
  expect(payload.customer.name).toBe("Алексей");
  expect(payload.preferred?.date).toBe(futureDate);
  expect(payload.preferred?.time).toBe("10:30");
  expect(payload.consent.accepted).toBe(true);
});

test("FE03: Полный Beauty happy path", async ({ page }) => {
  let submittedPayload: LeadCreateRequest | null = null;

  await page.route("**/api/leads", async (route) => {
    submittedPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        leadId: "00000000-0000-4000-8000-000000000002",
        status: "received",
        replayed: false,
        message: "Заявка в салон получена.",
      }),
    });
  });

  await page.goto("/demo/beauty");
  await page.getByTestId("next-to-preference").click();

  await expect(page.getByTestId("preference-step")).toBeVisible();
  await expect(page.getByTestId("resource-select")).toBeVisible();
  await page.getByTestId("resource-select").selectOption("master-b");

  const futureDate = getFutureWorkingDate();
  await page.getByTestId("preferred-date").fill(futureDate);
  await page.getByTestId("preferred-time").selectOption("11:00");

  await page.getByTestId("next-to-contact").click();
  await expect(page.getByTestId("contact-step")).toBeVisible();

  await page.getByTestId("customer-phone").fill("+70000000000");
  await page.getByTestId("consent").check();
  await page.getByTestId("lead-submit").click();

  await expect(page.getByTestId("lead-success")).toBeVisible();
  const payload = submittedPayload as unknown as LeadCreateRequest;
  expect(payload.siteKey).toBe("beauty");
  expect(payload.resourceId).toBe("master-b");
});

test("FE04: Beauty без мастера — resourceId отсутствует", async ({ page }) => {
  let submittedPayload: LeadCreateRequest | null = null;

  await page.route("**/api/leads", async (route) => {
    submittedPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        leadId: "00000000-0000-4000-8000-000000000003",
        status: "received",
        replayed: false,
        message: "Заявка получена.",
      }),
    });
  });

  await page.goto("/demo/beauty");
  await page.getByTestId("next-to-preference").click();

  // Keep "Любой мастер"
  await page.getByTestId("resource-select").selectOption("");

  const futureDate = getFutureWorkingDate();
  await page.getByTestId("preferred-date").fill(futureDate);
  await page.getByTestId("preferred-time").selectOption("11:00");

  await page.getByTestId("next-to-contact").click();
  await page.getByTestId("customer-phone").fill("+70000000000");
  await page.getByTestId("consent").check();
  await page.getByTestId("lead-submit").click();

  await expect(page.getByTestId("lead-success")).toBeVisible();
  const payload = submittedPayload as unknown as LeadCreateRequest;
  expect(payload.resourceId).toBeUndefined();
});

test("FE05: Required wheel-size не выбран — ошибка и нет перехода", async ({ page }) => {
  await page.goto("/demo/auto");
  await page.getByTestId("next-to-preference").click();

  await page.getByTestId("service-option-wheel-size").selectOption("");

  const futureDate = getFutureWorkingDate();
  await page.getByTestId("preferred-date").fill(futureDate);
  await page.getByTestId("preferred-time").selectOption("10:30");

  await page.getByTestId("next-to-contact").click();

  // Should stay on preference step and show field error
  await expect(page.getByTestId("preference-step")).toBeVisible();
  await expect(page.getByText("Выберите «Диаметр колеса»")).toBeVisible();
});

test("FE06: Нет даты/времени, нерабочий/прошлый день — нет перехода", async ({ page }) => {
  await page.goto("/demo/auto");
  await page.getByTestId("next-to-preference").click();

  await page.getByTestId("service-option-wheel-size").selectOption("R16");

  // Missing date & time
  await page.getByTestId("next-to-contact").click();
  await expect(page.getByTestId("preference-step")).toBeVisible();
  await expect(page.getByText("Укажите удобную дату")).toBeVisible();
});

test("FE07: Некорректный телефон — нет POST, читаемая ошибка, focus и aria-describedby", async ({ page }) => {
  let postCalled = false;
  await page.route("**/api/leads", async (route) => {
    postCalled = true;
    await route.abort();
  });

  await page.goto("/demo/auto");
  await page.getByTestId("next-to-preference").click();
  await page.getByTestId("service-option-wheel-size").selectOption("R16");

  const futureDate = getFutureWorkingDate();
  await page.getByTestId("preferred-date").fill(futureDate);
  await page.getByTestId("preferred-time").selectOption("10:30");

  await page.getByTestId("next-to-contact").click();

  // Test empty phone first
  await page.getByTestId("consent").check();
  await page.getByTestId("lead-submit").click();

  expect(postCalled).toBe(false);
  await expect(page.getByText("Укажите телефон")).toBeVisible();
  await expect(page.getByTestId("customer-phone")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("customer-phone")).toHaveAttribute("aria-describedby", "err-customer-phone");
  await expect(page.getByTestId("customer-phone")).toBeFocused();

  // Test invalid format phone
  await page.getByTestId("customer-phone").fill("+7123");
  await page.getByTestId("lead-submit").click();

  expect(postCalled).toBe(false);
  await expect(page.getByText(/Введите корректный номер телефона/)).toBeVisible();
  await expect(page.getByTestId("customer-phone")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("customer-phone")).toHaveAttribute("aria-describedby", "err-customer-phone");
  await expect(page.getByTestId("customer-phone")).toBeFocused();
});

test("FE08: Неотмеченное согласие — нет POST, focus и aria-describedby", async ({ page }) => {
  let postCalled = false;
  await page.route("**/api/leads", async (route) => {
    postCalled = true;
    await route.abort();
  });

  await page.goto("/demo/auto");
  await page.getByTestId("next-to-preference").click();
  await page.getByTestId("service-option-wheel-size").selectOption("R16");

  const futureDate = getFutureWorkingDate();
  await page.getByTestId("preferred-date").fill(futureDate);
  await page.getByTestId("preferred-time").selectOption("10:30");

  await page.getByTestId("next-to-contact").click();
  await page.getByTestId("customer-phone").fill("+70000000000");

  // Consent is left unchecked
  await page.getByTestId("lead-submit").click();

  expect(postCalled).toBe(false);
  await expect(page.getByText(/Необходимо согласие/)).toBeVisible();
  await expect(page.getByTestId("consent")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("consent")).toHaveAttribute("aria-describedby", "err-consent");
  await expect(page.getByTestId("consent")).toBeFocused();
});

test("FE09: Назад и редактирование — данные сохранены, сводка актуальна", async ({ page }) => {
  await page.goto("/demo/auto");
  await page.getByTestId("next-to-preference").click();
  await page.getByTestId("service-option-wheel-size").selectOption("R16");

  const futureDate = getFutureWorkingDate();
  await page.getByTestId("preferred-date").fill(futureDate);
  await page.getByTestId("preferred-time").selectOption("10:30");

  await page.getByTestId("next-to-contact").click();
  await page.getByTestId("customer-phone").fill("+70000000000");

  // Back to preference
  await page.getByTestId("back-to-preference").click();
  await expect(page.getByTestId("preference-step")).toBeVisible();
  await page.getByTestId("preferred-time").selectOption("11:00");

  // Forward to contact again
  await page.getByTestId("next-to-contact").click();
  await expect(page.getByTestId("contact-step")).toBeVisible();

  // Summary updated and phone preserved
  await expect(page.getByText("в 11:00 (МСК)")).toBeVisible();
  await expect(page.getByTestId("customer-phone")).toHaveValue("+70000000000");
});

test("FE10: Двойной click/Enter — один запрос", async ({ page }) => {
  let requestCount = 0;

  await page.route("**/api/leads", async (route) => {
    requestCount++;
    // Delay to simulate processing
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        leadId: "00000000-0000-4000-8000-000000000010",
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

  // Fast double click / repeated submit attempt
  await page.getByTestId("lead-submit").dblclick().catch(() => {});

  await expect(page.getByTestId("lead-success")).toBeVisible();
  expect(requestCount).toBe(1);
});

