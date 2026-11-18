import { test, expect } from "@playwright/test";

test("EBF08: серверная 422 по параметрам возвращает к нужному этапу",async({page})=>{
  await page.route("**/api/estimates",r=>r.fulfill({status:422,json:{error:{code:"VALIDATION_FAILED",message:"Параметры требуют исправления",fieldErrors:{"parameters.widthMm":"Уточните ширину конструкции."}}}}));
  await page.goto("/demo/estimate");
  await page.getByTestId("estimate-calculate").click();
  await page.getByTestId("estimate-to-contact").click();
  await page.getByTestId("estimate-phone").fill("+70000000000");await page.getByTestId("estimate-consent").check();
  await page.getByTestId("estimate-submit").click();
  await expect(page.getByTestId("estimate-parameters-error")).toHaveText("Уточните ширину конструкции.");
  await expect(page.getByLabel("Ширина, мм")).toHaveAttribute("aria-invalid","true");
  await expect(page.getByTestId("estimate-lead-id")).toHaveCount(0);
});
