import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { assertSafeTestDatabaseUrl } from "../../src/server/config/guards";

const base=process.env.TEST_SYSTEM_BASE_URL??"http://127.0.0.1:3023";
if(!process.env.TEST_DATABASE_URL||!process.env.TEST_OUTBOX_SECRET)throw new Error("Use npm run test:system");
const dsn=assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL);
const cases=[
 {key:"auto",offer:"services/storage",service:"storage"},
 {key:"beauty",offer:"services/manicure",service:"manicure",resource:"master-b"},
 {key:"medical",offer:"directions/checkup-info",service:"checkup-info",resource:"doctor-demo"},
 {key:"sports",offer:"programs/teens-trial",service:"teens-trial",resource:"coach-teens"},
 {key:"stay",offer:"houses/forest-house",service:"forest-house"},
 {key:"estimate",offer:"windows/balcony-door",service:"balcony-door"},
];
for(const scenario of cases){ const key=scenario.key;test("PS: "+key+" → real lead, replay, server snapshot and recording",async({page})=>{
  const db=new Client({connectionString:dsn});await db.connect();
  let leadId:string|undefined;
  const highWater=Number((await db.query("SELECT coalesce(max(id),0) AS n FROM rate_limits")).rows[0].n);
  try {
    await page.setExtraHTTPHeaders({"X-Test-Client":"portfolio-"+randomUUID()});
    await page.goto(base+"/demo/"+key+"/"+scenario.offer);
    let endpoint="/api/leads";
    if(key==="estimate") {
      endpoint="/api/estimates";
      await page.getByTestId("offer-to-calculator").click();
      await expect(page.getByLabel("Тип конструкции")).toHaveValue("balcony-door");
      await page.getByLabel("Количество конструкций").fill("2");
      await page.getByLabel("Стеклопакет").selectOption("triple");
      await page.getByLabel("Цвет профиля").selectOption("graphite");
      await page.getByTestId("estimate-calculate").click();
      await expect(page.getByTestId("estimate-quote-total")).toHaveText(/79.?156,80/);
      await page.getByTestId("estimate-to-contact").click();
      await page.getByTestId("estimate-phone").fill("+70000000000");
      await page.getByTestId("estimate-consent").check();
    }else{
      if(scenario.resource)await page.locator('a[href*="resource='+scenario.resource+'"]').click();
      else await page.getByTestId("offer-to-booking").click();
      await expect(page.getByLabel("Выбранная услуга")).toHaveValue(scenario.service);
      if(scenario.resource)await expect(page.getByTestId("resource-select")).toHaveValue(scenario.resource);
      const date=new Date(Date.now()+2*86400000);while(date.getUTCDay()===0)date.setUTCDate(date.getUTCDate()+1);
      await page.getByTestId("preferred-date").fill(date.toISOString().slice(0,10));
      await page.getByTestId("preferred-time").selectOption("11:00");
      await page.getByTestId("next-to-contact").click();
      await page.getByTestId("customer-phone").fill("+70000000000");await page.getByTestId("consent").check();
    }
    const waiting=page.waitForResponse(r=>r.url().endsWith(endpoint)&&r.request().method()==="POST");
    await page.getByTestId(key==="estimate"?"estimate-submit":"lead-submit").click();
    const response=await waiting;expect(response.status()).toBe(201);
    const receipt=await response.json();leadId=receipt.leadId;
    await expect(page.getByTestId(key==="estimate"?"estimate-lead-id":"lead-id")).toHaveText(leadId!);
    const request=response.request();
    const replay=await fetch(base+endpoint,{method:"POST",headers:{"Content-Type":"application/json",Origin:base,"Idempotency-Key":request.headers()["idempotency-key"],"X-Test-Client":request.headers()["x-test-client"]},body:request.postData()});
    expect(replay.status).toBe(200);expect((await replay.json()).leadId).toBe(leadId);
    const saved=(await db.query("SELECT site_key,service_id,resource_id,kind,preferred_at,price_snapshot,(SELECT count(*)::int FROM notification_outbox o WHERE o.lead_id=l.id) AS outbox_count FROM leads l WHERE id=$1",[leadId])).rows[0];
    expect(saved.site_key).toBe(key);expect(saved.service_id).toBe(scenario.service);
    expect(saved.resource_id).toBe(scenario.resource??null);expect(saved.outbox_count).toBe(1);
    expect(saved.kind).toBe(key==="estimate"?"estimate":"booking");
    if(key==="estimate"){expect(saved.preferred_at).toBe(null);expect(saved.price_snapshot.amountMinor).toBe(7915680);expect(saved.price_snapshot.estimate.parameters.quantity).toBe(2);}
    await expect.poll(async()=>{
      const work=await fetch(base+"/api/internal/outbox",{method:"POST",headers:{Authorization:"Bearer "+process.env.TEST_OUTBOX_SECRET}});
      expect(work.status).toBe(200);
      const result=await db.query("SELECT payload FROM notification_receipts WHERE lead_id=$1",[leadId]);
      return result.rowCount;
    },{timeout:15000}).toBe(1);
    const recorded=(await db.query("SELECT r.payload,o.status FROM notification_receipts r JOIN notification_outbox o ON o.id=r.outbox_id WHERE r.lead_id=$1",[leadId])).rows;
    expect(recorded).toHaveLength(1);expect(recorded[0].status).toBe("sent");
    if(key==="estimate")expect(recorded[0].payload.estimate.totalMinor).toBe(7915680);
  }finally{
    if(leadId)await db.query("DELETE FROM leads WHERE id=$1",[leadId]);
    await db.query("DELETE FROM rate_limits WHERE id>$1",[highWater]);
    await db.end();
  }
});}
