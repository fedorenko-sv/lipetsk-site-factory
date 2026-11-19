import { test, expect } from "@playwright/test";

test("PX01: витрина открывает ровно шесть разных направлений", async ({page}) => {
  await page.goto("/");
  const cards=page.getByTestId("prototype-card");
  await expect(cards).toHaveCount(6);
  const urls=await cards.locator("a.factory-card-image").evaluateAll(nodes=>nodes.map(node=>(node as HTMLAnchorElement).pathname));
  expect(new Set(urls).size).toBe(6);
  expect(urls).toEqual(["/demo/auto","/demo/beauty","/demo/medical","/demo/sports","/demo/stay","/demo/estimate"]);
  await cards.nth(5).locator("h3 a").click();
  await expect(page.getByTestId("estimate-flow")).toBeVisible();
});

test("PX02: мобильные первые экраны, изображения и честные 404", async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  for(const key of ["auto","beauty","medical","sports","stay","estimate"]) {
    await page.goto("/demo/"+key);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator(".prototype-hero img")).toBeVisible();
    await expect.poll(()=>page.locator(".prototype-hero img").evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),key+" overflow").toBe(true);
    expect(await page.evaluate(()=>scrollY),key+" must start at the hero").toBe(0);
    if(key!=="estimate")await expect(page.getByTestId("next-to-preference")).not.toBeInViewport();
    await page.getByRole("button",{name:"Открыть меню демо"}).click();
    await page.getByRole("dialog").locator("a[href=\"/demo/"+key+"/"+(key==="estimate"?"calculator":"booking")+"\"]").click();
    await expect(key==="estimate"?page.getByTestId("estimate-flow"):page.getByTestId("offer-step")).toBeVisible();
  }
  expect((await page.goto("/demo/not-a-prototype"))?.status()).toBe(404);
  expect((await page.goto("/demo/estimate/not-a-page"))?.status()).toBe(404);
});

for(const key of ["medical","sports","stay"]) test("PX03: "+key+" передаёт свой конфиг в общий Booking",async ({page})=>{
  let body: Record<string, unknown> | undefined;
  await page.route("**/api/leads", async r=>{
    body=r.request().postDataJSON();
    await r.fulfill({status:201,json:{leadId:"f0000000-0000-4000-8000-000000000001",status:"received",replayed:false,message:"Тестовая заявка сохранена."}});
  });
  await page.goto("/demo/"+key);
  await page.getByTestId("next-to-preference").click();
  if(key==="stay")await expect(page.getByTestId("preference-step")).toContainText("обратной связи");
  const date=new Date(Date.now()+2*86400000);
  while(date.getUTCDay()===0)date.setUTCDate(date.getUTCDate()+1);
  await page.getByTestId("preferred-date").fill(date.toISOString().slice(0,10));
  await page.getByTestId("preferred-time").selectOption("11:00");
  await page.getByTestId("next-to-contact").click();
  await page.getByTestId("customer-phone").fill("+70000000000");
  await page.getByTestId("consent").check();
  await page.getByTestId("lead-submit").click();
  await expect(page.getByTestId("lead-id")).toBeVisible();
  expect(body?.siteKey).toBe(key);
  expect(body?.configVersion).toBe("demo-2026-11-18");
  expect(body).not.toHaveProperty("symptoms");
});

test("PX04: все политики доступны и предупреждают о синтетических данных",async ({page})=>{
  for(const key of ["auto","beauty","medical","sports","stay","estimate"]) {
    const response=await page.goto("/demo/"+key+"/privacy");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Данные в демо" })).toBeVisible();
    await expect(page.locator("main")).toContainText("+70000000000");
  }
});
