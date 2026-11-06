import { test, expect, type Page } from "@playwright/test";
import type { LeadCreateRequest } from "../../src/shared/contracts";

const path = "/demo/detailing";
const receipt = {
  leadId: "00000000-0000-4000-8000-000000000031",
  status: "received",
  replayed: false,
  message: "Демо-заявка сохранена. Это пожелание по времени.",
};

async function contactStep(page: Page) {
  const date = new Date(Date.now() + 2 * 86400000);
  while (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  await page.getByTestId("preferred-date").fill(date.toISOString().slice(0, 10));
  await page.getByTestId("preferred-time").selectOption("11:00");
  await page.getByTestId("next-to-contact").click();
  await page.getByTestId("customer-phone").fill("+70000000000");
  await page.getByTestId("consent").check();
}

test("DT01: silent inline video plays, pauses, resumes and stops offscreen", async ({ page }) => {
  // WebKit on Windows can spend several seconds hydrating and opening H.264.
  // Require actual advancing playback; allow startup without a fixed sleep.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(path);
  const video = page.locator(".dt-hero video");
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => !el.paused && el.currentTime > 0), {
      timeout: 20_000,
    })
    .toBe(true);
  expect(
    await video.evaluate((el: HTMLVideoElement) => el.muted && el.loop && el.playsInline),
  ).toBe(true);
  await page.getByRole("button", { name: "Остановить видео" }).click();
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
  await page.getByRole("button", { name: "Включить видео" }).click();
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(false);
  await page.locator("#services").scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
});

test("DT02: reduced motion uses poster without downloading video", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const videos: string[] = [];
  page.on("request", (req) => {
    if (req.url().endsWith(".mp4")) videos.push(req.url());
  });
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Сохраняемхарактер.");
  expect(await page.locator("video").getAttribute("src")).toBeNull();
  expect(videos).toEqual([]);
  await page.getByRole("button", { name: "Остановить видео" }).click();
  expect(await page.locator("video").evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
});

test("DT03: hotpots, price, chosen service, return and new selection agree", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(path);
  await page.getByRole("button", { name: "Выбрать зону: Диски", exact: true }).click();
  await page.getByRole("button", { name: "Крупный план" }).click();
  await expect(page.getByRole("img", { name: "Крупный план: Диски", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Общий план" }).click();
  await expect(page.locator(".dt-programs")).toContainText(/6\s?000\s?₽/);
  await page.getByRole("button", { name: "Выбрать время" }).click();
  await expect(page.getByLabel("Выбранная услуга")).toHaveValue("wheel-care");
  await page.getByTestId("back-to-offer").click();
  await expect(page.getByTestId("preference-step")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Выбрать время" })).toBeFocused();
  await page.getByRole("button", { name: "Выбрать зону: Весь кузов", exact: true }).click();
  await page
    .locator(".dt-programs")
    .getByRole("button", { name: /Керамическое/ })
    .click();
  await page.getByRole("button", { name: "Выбрать время" }).click();
  await expect(page.getByLabel("Выбранная услуга")).toHaveValue("ceramic");
  await page.getByRole("button", { name: "Выбрать зону: Салон", exact: true }).click();
  await expect(page.getByTestId("preference-step")).toHaveCount(0);
  await page.getByRole("button", { name: "Выбрать время" }).click();
  await expect(page.getByLabel("Выбранная услуга")).toHaveValue("interior-care");
});

test("DT04: selected programme reaches transport and receipt; another request returns to landing", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let body: LeadCreateRequest | undefined;
  await page.route("**/api/leads", async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: receipt });
  });
  await page.goto(path);
  await page.getByRole("button", { name: "Выбрать зону: Салон", exact: true }).click();
  await page.getByRole("button", { name: "Выбрать время" }).click();
  await contactStep(page);
  await page.getByTestId("lead-submit").click();
  await expect(page.getByTestId("lead-id")).toHaveText(receipt.leadId);
  expect(body?.siteKey).toBe("detailing");
  expect(body?.serviceId).toBe("interior-care");
  expect(body?.consent.accepted).toBe(true);
  expect(body).not.toHaveProperty("price");
  await page.getByRole("button", { name: "Оставить ещё одну заявку" }).click();
  await expect(page.getByTestId("lead-success")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Выбрать время" })).toBeFocused();
});

test("DT05: 503 does not show success, retry preserves idempotency", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const keys: string[] = [];
  await page.route("**/api/leads", async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    await route.fulfill(
      keys.length === 1
        ? { status: 503, json: { code: "SERVICE_UNAVAILABLE", message: "Попробуйте позже" } }
        : { status: 201, json: receipt },
    );
  });
  await page.goto(path);
  await page.getByRole("button", { name: "Оставить тестовую заявку" }).click();
  await contactStep(page);
  await page.getByTestId("lead-submit").click();
  await expect(page.getByTestId("lead-error")).toBeVisible();
  await expect(page.getByTestId("lead-success")).toHaveCount(0);
  await page.getByTestId("lead-retry").click();
  await expect(page.getByTestId("lead-id")).toHaveText(receipt.leadId);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[0]).toBe(keys[1]);
});

test("DT06: mobile framing has no overflow; images and privacy resolve", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const failed: string[] = [];
  page.on("response", (res) => {
    if (res.status() >= 400) failed.push(res.url());
  });
  await page.goto(path);
  for (const section of await page.locator("section, footer").all())
    await section.scrollIntoViewIfNeeded();
  await page.evaluate(() =>
    Promise.all([...document.images].map((img) => img.decode().catch(() => {}))),
  );
  await page.evaluate(() => document.fonts.ready);
  const size = await page.evaluate(() => ({
    w: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.w);
  expect(
    await page
      .locator("img")
      .evaluateAll((images: HTMLImageElement[]) =>
        images.every((img) => img.complete && img.naturalWidth > 0),
      ),
  ).toBe(true);
  await page.locator("summary").filter({ hasText: "Плёнка или керамика?" }).click();
  await expect(page.locator("details[open]")).toContainText("механического воздействия");
  await page.getByRole("link", { name: "Политика демо", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Демонстрационная");
  expect(failed).toEqual([]);
});
