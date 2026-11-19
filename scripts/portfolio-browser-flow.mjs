import assert from "node:assert/strict";

/** Genuine synthetic UI submission, shared by portfolio and isolated-profile acceptance. */
export async function submitDemoViaBrowser(page,base,key) {
  await page.goto(base+"/demo/"+key);
  let endpoint;
  if(key==="estimate"){
    endpoint="/api/estimates";
    await page.getByLabel("Количество конструкций").fill("2");
    await page.getByLabel("Цвет профиля").selectOption("graphite");
    await page.getByLabel("Стеклопакет").selectOption("triple");
    await page.getByTestId("estimate-calculate").click();
    assert.match(await page.getByTestId("estimate-quote-total").textContent(),/67.?060,80/);
    await page.getByTestId("estimate-to-contact").click();
    await page.getByTestId("estimate-phone").fill("+7"+"0".repeat(10));
    await page.getByTestId("estimate-consent").check();
  }else{
    endpoint="/api/leads";
    await page.getByTestId("next-to-preference").click();
    if(key==="auto")await page.getByTestId("service-option-wheel-size").selectOption("R16");
    if(key==="beauty")await page.getByTestId("resource-select").selectOption("master-b");
    if(key==="medical")await page.getByTestId("resource-select").selectOption("doctor-demo");
    if(key==="sports")await page.getByTestId("resource-select").selectOption("coach-kids");
    const day=new Date(Date.now()+2*86400000);
    while(day.getUTCDay()===0)day.setUTCDate(day.getUTCDate()+1);
    await page.getByTestId("preferred-date").fill(day.toISOString().slice(0,10));
    await page.getByTestId("preferred-time").selectOption("11:00");
    await page.getByTestId("next-to-contact").click();
    await page.getByTestId("customer-phone").fill("+7"+"0".repeat(10));
    await page.getByTestId("consent").check();
  }
  const waiting=page.waitForResponse(r=>r.url().endsWith(endpoint)&&r.request().method()==="POST");
  await page.getByTestId(key==="estimate"?"estimate-submit":"lead-submit").click();
  const response=await waiting;
  assert.equal(response.status(),201,key+" actual POST");
  const receipt=await response.json();
  const id=page.getByTestId(key==="estimate"?"estimate-lead-id":"lead-id");
  await id.waitFor();assert.equal(await id.textContent(),receipt.leadId);
  const request=response.request();

  return {endpoint,receipt,request};
}
