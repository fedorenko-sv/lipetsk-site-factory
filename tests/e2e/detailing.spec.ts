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
  await page.getByRole("button", { name: "Показать кадр: Линия крыла" }).click();
  await expect(page.locator(".dt-film-still")).toHaveAttribute("src", /reverse\.webp$/);
  await expect(page.getByRole("button", { name: "Показать кадр: Линия крыла" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(videos).toEqual([]);
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

test("DT07: editing the film on pause seeks to the actual plate without resuming", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(path);
  const video = page.locator(".dt-hero video");
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime > 0), { timeout: 20_000 })
    .toBe(true);
  await page.getByRole("button", { name: "Остановить видео" }).click();
  for (const [title, second] of [
    ["Поверхность", 10],
    ["Линия крыла", 5],
  ] as const) {
    const button = page.getByRole("button", { name: "Показать кадр: " + title });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() =>
        video.evaluate(
          (el: HTMLVideoElement, at) =>
            el.paused && !el.seeking && Math.abs(el.currentTime - at) < 0.12,
          second,
        ),
      )
      .toBe(true);
  }
  await page.getByRole("button", { name: "Включить видео" }).click();
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => !el.paused && el.currentTime > 5.2))
    .toBe(true);
});

test("DT08: mobile hotspot and highlighted panel share one plate; detail matches selected part", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(path);
  const stage = page.locator(".dt-car-registration");
  await stage.scrollIntoViewIfNeeded();
  const plate = await stage.locator(":scope > img").boundingBox();
  const overlay = await stage.locator("svg").boundingBox();
  expect(overlay).toEqual(plate);
  const target = page.getByRole("button", { name: "Выбрать зону: Диски", exact: true });
  await target.click();
  await expect(stage.locator('[data-panel][data-selected="true"]')).toHaveAttribute(
    "data-panel",
    "wheels",
  );
  await page.getByRole("button", { name: "Крупный план" }).click();
  await expect(page.getByRole("img", { name: "Крупный план: Диски" })).toHaveAttribute(
    "src",
    /wheel\.webp$/,
  );
  await page.getByRole("button", { name: "Передняя часть", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("img", { name: "Крупный план: Передняя часть" })).toHaveAttribute(
    "src",
    /craft\.webp$/,
  );
  await expect(page.locator(".dt-selection")).toContainText("Защита передней части");
});

test("DT09: data saver offers the complete photo series without requesting MP4", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: Object.assign(new EventTarget(), { saveData: true }),
    }),
  );
  const videos: string[] = [];
  page.on("request", (req) => {
    if (req.url().endsWith(".mp4")) videos.push(req.url());
  });
  await page.goto(path);
  await page.getByRole("button", { name: "Показать кадр: Поверхность" }).click();
  await expect(page.locator(".dt-film-still")).toHaveAttribute("src", /paint\.webp$/);
  await expect(page.getByRole("button", { name: "Остановить видео" })).toHaveCount(0);
  expect(videos).toEqual([]);
});

test("DT10: scrolling moves inspection light; reduced motion restores the static drawing", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(path);
  const study = page.locator("#light-study");
  const beam = study.locator("[data-study-beam]");
  const shift = () =>
    beam.evaluate(
      (el) => (el as unknown as SVGGElement).transform.baseVal.consolidate()?.matrix.e ?? 0,
    );
  await study.evaluate((el) =>
    window.scrollTo({
      top: window.scrollY + el.getBoundingClientRect().top - innerHeight * 0.78,
      behavior: "instant",
    }),
  );
  await expect.poll(shift).toBeLessThan(220);
  await study.evaluate((el) =>
    window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top, behavior: "instant" }),
  );
  await expect.poll(shift).toBeGreaterThan(300);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(shift).toBe(360);
  await expect(study.getByRole("link", { name: "Выбрать зону" })).toBeVisible();
});

test("DT11: autoplay denial keeps every plate usable; user playback resumes at the chosen plate", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    let allowed = false;
    const play = HTMLMediaElement.prototype.play;
    document.addEventListener(
      "click",
      (event) => {
        if ((event.target as Element)?.closest('[aria-label="Включить видео"]')) allowed = true;
      },
      true,
    );
    HTMLMediaElement.prototype.play = function () {
      return allowed
        ? play.call(this)
        : Promise.reject(new DOMException("Autoplay blocked", "NotAllowedError"));
    };
  });
  await page.goto(path);
  const resume = page.getByRole("button", { name: "Включить видео" });
  await expect(resume).toBeVisible();
  await page.getByRole("button", { name: "Показать кадр: Линия крыла" }).click();
  await expect(page.locator(".dt-film-still")).toHaveAttribute("src", /reverse\.webp$/);
  await resume.click();
  await expect
    .poll(
      () =>
        page
          .locator("video")
          .evaluate((el: HTMLVideoElement) => !el.paused && el.currentTime > 5.05),
      { timeout: 20_000 },
    )
    .toBe(true);
  await expect(page.locator(".dt-film-still")).toHaveCount(0);
});
