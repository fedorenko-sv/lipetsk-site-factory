import { test, expect } from "@playwright/test";
import type { LeadCreateRequest } from "../../src/shared/contracts";
const receipt={leadId:"d0000000-0000-4000-8000-000000000001",status:"received",replayed:false,message:"Тестовая заявка сохранена."};
const scenarios=[
 {id:"auto",section:"services",service:"storage"},
 {id:"beauty",section:"services",service:"manicure",resource:"master-b"},
 {id:"medical",section:"directions",service:"checkup-info",resource:"doctor-demo"},
 {id:"sports",section:"programs",service:"teens-trial",resource:"coach-teens"},
 {id:"stay",section:"houses",service:"forest-house"},
]as const;
function date(){const day=new Date(Date.now()+2*86400000);while(day.getUTCDay()===0)day.setUTCDate(day.getUTCDate()+1);return day.toISOString().slice(0,10);}
test("DEMO01: шесть независимых каталогов, логотип и подвал внутри своего сайта",async({page})=>{
 for(const [id,section]of [...scenarios.map(s=>[s.id,s.section]),["estimate","windows"]]){
  await page.goto("/demo/"+id+"/"+section);
  await expect(page.locator("h1")).toHaveCount(1);
  const links=await page.locator(".prototype-header a,.prototype-footer a").evaluateAll(nodes=>nodes.map(node=>(node as HTMLAnchorElement).pathname));
  expect(links.every(href=>href.startsWith("/demo/"+id))).toBe(true);
  await expect(page.locator(".prototype-brand")).toHaveAttribute("href","/demo/"+id);
  expect(await page.locator(".prototype-service-card").count()).toBeGreaterThanOrEqual(2);
 }
});
for(const scenario of scenarios)test("DEMO02: "+scenario.id+" каталог → услуга → собственная заявка",async({page})=>{
 let body:LeadCreateRequest|undefined;
 await page.route("**/api/leads",r=>{body=r.request().postDataJSON();return r.fulfill({status:201,json:receipt});});
 await page.goto("/demo/"+scenario.id+"/"+scenario.section);
 await page.locator('a[href="/demo/'+scenario.id+'/'+scenario.section+'/'+scenario.service+'"]').click();
 if("resource"in scenario)await page.locator('a[href*="resource='+scenario.resource+'"]').click();
 else await page.getByTestId("offer-to-booking").click();
 await expect(page).toHaveURL(new RegExp("/demo/"+scenario.id+"/booking"));
 await expect(page.getByLabel("Выбранная услуга")).toHaveValue(scenario.service);
 if("resource"in scenario)await expect(page.getByTestId("resource-select")).toHaveValue(scenario.resource);
 if(scenario.id==="stay")await expect(page.getByTestId("preference-step")).toContainText("обратной связи");
 await page.getByTestId("preferred-date").fill(date());await page.getByTestId("preferred-time").selectOption("11:00");
 await page.getByTestId("next-to-contact").click();await page.getByTestId("customer-phone").fill("+70000000000");await page.getByTestId("consent").check();
 await page.getByTestId("lead-submit").click();await expect(page.getByTestId("lead-id")).toHaveText(receipt.leadId);
 const payload=body as unknown as LeadCreateRequest;
 expect(payload.siteKey).toBe(scenario.id);expect(payload.serviceId).toBe(scenario.service);
 if("resource"in scenario)expect(payload.resourceId).toBe(scenario.resource);
 expect(payload).not.toHaveProperty("price");
});
test("DEMO03: конструкция из каталога переходит в отдельный калькулятор",async({page})=>{
 await page.goto("/demo/estimate/windows");
 await page.locator('a[href="/demo/estimate/windows/balcony-door"]').click();
 await page.getByTestId("offer-to-calculator").click();
 await expect(page.getByLabel("Тип конструкции")).toHaveValue("balcony-door");
 await page.getByTestId("estimate-calculate").click();
 await expect(page.getByTestId("estimate-quote-total")).toHaveText(/29.?700/);
});
test("DEMO04: чужие и неоднозначные параметры не создают выбранную заявку",async({page})=>{
 for(const path of [
 "/demo/beauty/booking?service=manicure&resource=master-a",
 "/demo/beauty/booking?resource=master-b",
 "/demo/beauty/booking?service=haircut&service=manicure",
 "/demo/medical/directions/manicure",
 "/demo/stay/houses/constructor",
 "/demo/estimate/calculator?product=constructor",
 "/demo/sports/services",
 ]){
  expect((await page.goto(path))?.status(),path).toBe(404);
  await expect(page.getByTestId("preference-step")).toHaveCount(0);
 }
});
test("DEMO05: мобильное меню каждого демо — Escape, фокус и собственные переходы",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 for(const id of ["auto","beauty","medical","sports","stay","estimate"]){
  await page.goto("/demo/"+id);
  const trigger=page.getByRole("button",{name:"Открыть меню демо"});
  await trigger.click();await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).not.toBeVisible();await expect(trigger).toBeFocused();
  await trigger.click();
  const section=id==="medical"?"directions":id==="sports"?"programs":id==="stay"?"houses":id==="estimate"?"windows":"services";
  await page.getByRole("dialog").locator('a[href="/demo/'+id+'/'+section+'"]').click();
  await expect(page).toHaveURL(new RegExp("/demo/"+id+"/"+section+"$"));
  await expect(page.locator(".prototype-page-catalog")).toBeVisible();
  await expect(page.getByRole("dialog")).not.toBeVisible();
 }
});
test("DEMO06: информационные страницы и профили доступны без переполнения",async({page})=>{
 const routes=["beauty/team","beauty/studio","beauty/visit","medical/specialists","medical/patients","medical/information","sports/coaches","sports/first-visit","sports/space","stay/territory","stay/trip","estimate/installation","estimate/measurement","estimate/examples","auto/about","auto/visit"];
 await page.setViewportSize({width:390,height:844});
 for(const path of routes){
  expect((await page.goto("/demo/"+path))?.status(),path).toBe(200);
  await expect(page.locator("h1")).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),path).toBe(true);
 }
});
