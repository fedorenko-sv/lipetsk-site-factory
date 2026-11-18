import { test, expect } from "@playwright/test";

test("SG01 two houses have distinct catalog images and correct detail context", async ({ page }) => {
  await page.goto("/demo/stay/houses");
  const houses = page.locator(".prototype-service-card");
  const pictures = houses.locator("img");
  await expect(pictures).toHaveCount(2);
  expect(await pictures.nth(0).getAttribute("src")).not.toBe(await pictures.nth(1).getAttribute("src"));
  await houses.nth(1).getByRole("link", { name: /Подробнее/ }).click();
  await expect(page).toHaveURL(/houses\/forest-house$/);
  await expect(page.locator(".prototype-subhero img")).toHaveAttribute("alt", /Панорамный дом/);
  await page.getByTestId("offer-to-booking").click();
  await expect(page).toHaveURL(/booking\?service=forest-house$/);
  await expect(page.getByTestId("preferred-date")).toBeVisible();
  await expect(page.getByLabel("Выбранная услуга")).toHaveValue("forest-house");
});

test("SG02 gallery opens selected frame, wraps with arrows and restores focus after Escape", async ({ page }) => {
  await page.goto("/demo/stay/houses/pine-house");
  const trigger = page.getByRole("button", { name: "Открыть фото 2: Интерьер A-frame" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Фотогалерея: Дом у сосен" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Закрыть галерею" })).toBeFocused();
  await expect(dialog.getByRole("status")).toHaveText("2 / 2 · Интерьер A-frame");
  await expect(dialog.locator("img")).toHaveAttribute("alt", /Треугольное/);
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("status")).toHaveText("1 / 2 · Снаружи");
  await dialog.getByRole("button", { name: "Предыдущее фото" }).click();
  await expect(dialog.getByRole("status")).toHaveText("2 / 2 · Интерьер A-frame");
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.getByRole("status")).toHaveText("1 / 2 · Снаружи");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("SG03 mobile gallery fits, closes by button and respects reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/demo/stay/houses/forest-house");
  await page.getByRole("button", { name: "Открыть фото 1: Снаружи" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => el.getBoundingClientRect().width)).toBeLessThanOrEqual(360);
  await dialog.getByRole("button", { name: "Следующее фото" }).click();
  await expect(dialog.getByRole("status")).toHaveText("2 / 2 · Панорамная гостиная");
  const photoBox = await dialog.locator("img").boundingBox();
  expect(photoBox!.height).toBeLessThan(photoBox!.width * 0.8);
  const transition = await dialog.locator("img").evaluate(el => getComputedStyle(el).transitionDuration);
  expect(transition).toBe("0s");
  await dialog.getByRole("button", { name: "Закрыть галерею" }).click();
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("SG04 image failure gives a useful fallback and leaves request path available", async ({ page }) => {
  await page.route("**/_next/image?**", route => route.abort());
  await page.goto("/demo/stay/houses/forest-house");
  await page.getByRole("button", { name: "Открыть фото 2: Панорамная гостиная" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Изображение не загрузилось. Выберите другой кадр или закройте галерею.")).toBeVisible();
  await dialog.getByRole("button", { name: "Закрыть галерею" }).click();
  await page.getByTestId("offer-to-booking").click();
  await expect(page).toHaveURL(/booking\?service=forest-house$/);
  await expect(page.getByTestId("preferred-date")).toBeVisible();
});
