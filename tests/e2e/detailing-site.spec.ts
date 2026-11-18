import { test, expect, type Page } from "@playwright/test";
const base = "/demo/detailing";
const receipt = {
  leadId: "00000000-0000-4000-8000-000000000055",
  status: "received",
  replayed: false,
  message: "Демо-заявка сохранена. Это пожелание по времени.",
};
async function contact(page: Page) {
  const d = new Date(Date.now() + 2 * 86400000);
  while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  await page.getByTestId("preferred-date").fill(d.toISOString().slice(0, 10));
  await page.getByTestId("preferred-time").selectOption("11:00");
  await page.getByTestId("next-to-contact").click();
  await page.getByTestId("customer-phone").fill("+70000000000");
  await page.getByTestId("consent").check();
}
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});
test("SITE01: filter and browser Back restore catalog; chosen service reaches booking and API", async ({
  page,
}) => {
  await page.goto(base + "/services");
  const cards = page.locator(".site-program-grid .site-program");
  await expect(cards).toHaveCount(6);
  await page
    .getByRole("navigation", { name: "Фильтр программ" })
    .getByRole("link", { name: "Защита", exact: true })
    .click();
  await expect(page).toHaveURL(/category=protection/);
  await expect(cards).toHaveCount(3);
  await page
    .getByRole("navigation", { name: "Фильтр программ" })
    .getByRole("link", { name: "Восстановление", exact: true })
    .click();
  await expect(cards).toHaveCount(1);
  await page.goBack();
  await expect(cards).toHaveCount(3);
  await page.getByRole("link", { name: "Об услуге: Керамическое покрытие" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Керамическое покрытие");
  await expect(page.locator(".site-service-price")).toContainText(/18\s?000/);
  await page.locator(".site-service-hero").getByRole("link", { name: "Выбрать время" }).click();
  await expect(page).toHaveURL(/booking\?service=ceramic$/);
  await expect(page.getByLabel("Выбранная услуга")).toHaveValue("ceramic");
  let sent: Record<string, unknown> | undefined;
  await page.route("**/api/leads", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: receipt });
  });
  await contact(page);
  await page.getByTestId("lead-submit").click();
  await expect(page.getByTestId("lead-id")).toHaveText(receipt.leadId);
  expect(sent?.serviceId).toBe("ceramic");
  expect(sent?.siteKey).toBe("detailing");
  expect(sent).not.toHaveProperty("price");
  await page.getByRole("button", { name: "Оставить ещё одну заявку" }).click();
  await expect(page).toHaveURL(base + "/services");
});
test("SITE02: mobile menu has native focus containment, Escape and closes after navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(base + "/services");
  const trigger = page.getByRole("button", { name: "Открыть меню" });
  await trigger.click();
  const menu = page.getByRole("dialog", { name: "Навигация по ателье" });
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await menu.getByRole("link", { name: "Ателье", exact: true }).click();
  await expect(page).toHaveURL(base + "/atelier");
  await expect(menu).not.toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe("hidden");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
test("SITE03: all informational routes have content, working local images and demo metadata", async ({
  page,
}) => {
  test.setTimeout(90_000);
  for (const route of [
    "/services",
    "/services/ppf-front",
    "/services/ppf-full",
    "/services/ceramic",
    "/services/polish",
    "/services/wheel-care",
    "/services/interior-care",
    "/prices",
    "/atelier",
    "/care",
    "/visit",
    "/booking",
    "/privacy",
  ]) {
    const result = await page.goto(base + route);
    expect(result?.status(), route).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page).toHaveTitle(/OBLIK/);
    expect((await page.locator("main").innerText()).length).toBeGreaterThan(200);
    for (const image of await page.locator("main img").all()) {
      await image.scrollIntoViewIfNeeded();
      await expect
        .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
        .toBe(true);
    }
  }
});
test("SITE04: unknown paths give HTTP 404, invalid booking query offers a safe programme choice", async ({
  page,
}) => {
  const result = await page.goto(base + "/services/not-a-service");
  expect(result?.status()).toBe(404);
  for (const query of ["service=__proto__", "service=ceramic&service=wheel-care"]) {
    await page.goto(base + "/booking?" + query);
    await expect(page.getByRole("status")).toContainText("не найдена");
    await expect(page.locator(".site-program-choice a")).toHaveCount(6);
    await expect(page.getByTestId("preference-step")).toHaveCount(0);
  }
  await page.goto(base + "/services?category=not-real");
  await expect(page.locator(".site-program-grid .site-program")).toHaveCount(6);
});
test("SITE05: price links, direct booking and changing service keep the current programme", async ({
  page,
}) => {
  await page.goto(base + "/prices");
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: /Очистка и защита дисков/ }) });
  await expect(row).toContainText(/6\s?000/);
  await row.getByRole("link", { name: "Выбрать время: Очистка и защита дисков" }).click();
  await expect(page.getByLabel("Выбранная услуга")).toHaveValue("wheel-care");
  await page.getByLabel("Выбранная услуга").selectOption("interior-care");
  await expect(page.getByLabel("Выбранная услуга")).toHaveValue("interior-care");
  await page.getByTestId("back-to-offer").click();
  await expect(page).toHaveURL(base + "/services");
  await page.goto(base + "/booking?service=ppf-full");
  await expect(page.getByLabel("Выбранная услуга")).toHaveValue("ppf-full");
});
test("SITE06: the mobile site connects the film, catalogue, care questions and privacy", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.getByRole("link", { name: "Все шесть программ" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Программы");
  await page.getByRole("button", { name: "Открыть меню" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Уход", exact: true }).click();
  const question = page.locator("summary").filter({ hasText: "Время на сайте" });
  await question.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("details[open]")).toContainText("пожелание");
  await page.getByRole("link", { name: "Политика демо", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Демонстрационная");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("SITE07: photographic entrances stop immediately when reduced motion is enabled", async ({
  page,
}) => {
  // Hold only entrance animations in this test: WebKit may finish 440 ms
  // before the automation poll reaches the card. Cancellation must remove
  // the real native animation rather than pass because its timer elapsed.
  await page.addInitScript(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element["animate"]>) {
      const animation = animate.apply(this, args);
      if (this.classList.contains("site-program-reveal")) animation.pause();
      return animation;
    };
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(base + "/services");
  const last = page.locator(".site-program-reveal").last();
  await last.scrollIntoViewIfNeeded();
  await expect
    .poll(() => last.evaluate((el) => el.getAnimations().some((a) => a.playState === "paused")))
    .toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => last.evaluate((el) => el.getAnimations().length)).toBe(0);
  await expect(last.getByRole("heading", { name: "Деликатный уход за салоном" })).toBeVisible();
});
