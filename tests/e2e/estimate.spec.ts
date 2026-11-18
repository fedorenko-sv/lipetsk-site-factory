import { test, expect } from "@playwright/test";

const receipt = { leadId: "e0000000-0000-4000-8000-000000000001", status: "received", replayed: false, message: "Демонстрационная заявка сохранена." };
async function contact(page: import("@playwright/test").Page) {
  await page.goto("/demo/estimate");
  await page.getByTestId("estimate-calculate").click();
  await expect(page.getByTestId("estimate-quote-total")).toHaveText(/24.?660/);
  await page.getByTestId("estimate-to-contact").click();
  await page.getByTestId("estimate-phone").fill("+70000000000");
  await page.getByTestId("estimate-consent").check();
}

test("EBF01: расчёт опций и количества, возврат сохраняет параметры", async ({page}) => {
  await page.goto("/demo/estimate");
  await page.getByLabel("Стеклопакет").selectOption("triple");
  await page.getByLabel("Цвет профиля").selectOption("graphite");
  await page.getByLabel("Количество конструкций").fill("2");
  await page.getByTestId("estimate-calculate").click();
  await expect(page.getByTestId("estimate-quote-total")).toHaveText(/67.?060,80/);
  await page.getByTestId("estimate-edit").click();
  await expect(page.getByLabel("Количество конструкций")).toHaveValue("2");
  await page.getByLabel("Ширина, мм").fill("500");
  await page.getByTestId("estimate-calculate").click();
  await expect(page.getByTestId("estimate-parameters-error")).toContainText("600");
  await expect(page.getByTestId("estimate-quote-total")).toHaveCount(0);
});

test("EBF02: квитанция только по валидному 201; в запросе нет цены", async ({page}) => {
  let body: Record<string, unknown> | undefined;
  await page.route("**/api/estimates", async r => { body=r.request().postDataJSON(); await r.fulfill({status:201,json:receipt}); });
  await contact(page);
  await page.getByTestId("estimate-submit").click();
  await expect(page.getByTestId("estimate-lead-id")).toHaveText(receipt.leadId);
  expect(body?.kind).toBe("estimate");
  expect(body?.siteKey).toBe("estimate");
  expect(body).not.toHaveProperty("price");
  expect(body).not.toHaveProperty("quote");
  expect(body).not.toHaveProperty("preferred");
});

test("EBF03: повтор после сети сохраняет ключ; изменение создаёт новый", async ({page}) => {
  const keys: string[] = [];
  await page.route("**/api/estimates", async r => {
    keys.push(r.request().headers()["idempotency-key"]);
    if(keys.length===1) await r.abort("failed");
    else if(keys.length===2) await r.fulfill({status:503,json:{error:{code:"DATABASE_UNAVAILABLE",message:"Unavailable"}}});
    else await r.fulfill({status:201,json:receipt});
  });
  await contact(page);
  await page.getByTestId("estimate-submit").click();
  await expect(page.getByTestId("estimate-error")).toBeVisible();
  await page.getByTestId("estimate-submit").click();
  await expect(page.getByTestId("estimate-error")).toContainText("попробуйте");
  await page.getByTestId("estimate-name").fill("Демо");
  await page.getByTestId("estimate-submit").click();
  await expect(page.getByTestId("estimate-lead-id")).toBeVisible();
  expect(keys[0]).toBe(keys[1]);
  expect(keys[2]).not.toBe(keys[1]);
});

test("EBF04: HTML или неправильная квитанция не создаёт успех", async ({page}) => {
  await page.route("**/api/estimates", r => r.fulfill({status:201,contentType:"text/html",body:"<h1>Error</h1>"}));
  await contact(page);
  await page.getByTestId("estimate-submit").click();
  await expect(page.getByTestId("estimate-error")).toBeVisible();
  await expect(page.getByTestId("estimate-lead-id")).toHaveCount(0);
});

test("EBF05: 429 блокирует повтор на Retry-After", async ({page}) => {
  let calls=0;
  await page.route("**/api/estimates", r => { calls++; return r.fulfill({status:429,headers:{"retry-after":"2"},json:{error:{code:"RATE_LIMITED",message:"Limited"}}}); });
  await contact(page);
  await page.getByTestId("estimate-submit").click();
  await expect(page.getByTestId("estimate-submit")).toBeDisabled();
  await expect(page.getByTestId("estimate-submit")).toBeEnabled({timeout:6000});
  expect(calls).toBe(1);
});

test("EBF06: 409 требует обновления конфигурации", async ({page}) => {
  await page.route("**/api/estimates", r => r.fulfill({status:409,json:{error:{code:"CONFIG_CHANGED",message:"Changed"}}}));
  await contact(page);
  await page.getByTestId("estimate-submit").click();
  await expect(page.getByTestId("estimate-error")).toContainText("обновите страницу");
  await expect(page.getByTestId("estimate-submit")).toBeDisabled();
});

test("EBF07: согласие, 422 и новый ключ после исправления", async ({page}) => {
  let calls=0;const keys:string[]=[];
  await page.route("**/api/estimates", r => { calls++;keys.push(r.request().headers()["idempotency-key"]); return calls===1?r.fulfill({status:422,json:{error:{code:"VALIDATION_FAILED",message:"Проверьте данные",fieldErrors:{"customer.phone":"Проверьте тестовый телефон"}}}}):r.fulfill({status:201,json:receipt}); });
  await contact(page);
  await page.getByTestId("estimate-consent").uncheck();
  await page.getByTestId("estimate-submit").click();
  await expect(page.getByTestId("estimate-error")).toContainText("согласие");
  expect(calls).toBe(0);
  await page.getByTestId("estimate-consent").check();
  await page.getByTestId("estimate-submit").click();
  await expect(page.getByTestId("estimate-phone-error")).toContainText("тестовый");
  expect(calls).toBe(1);
  await page.getByTestId("estimate-submit").click();
  await expect(page.getByTestId("estimate-lead-id")).toBeVisible();
  expect(keys[0]).not.toBe(keys[1]);
});
