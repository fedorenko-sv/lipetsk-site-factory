import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { assertSafeTestDatabaseUrl } from "../../src/server/config/guards";

const base=process.env.TEST_SYSTEM_BASE_URL??"http://127.0.0.1:3023";
if(!process.env.TEST_DATABASE_URL||!process.env.TEST_OUTBOX_SECRET)throw new Error("Use npm run test:system");
const dsn=assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL);
for(const key of ["auto","beauty","medical","sports","stay","estimate"])test("PS: "+key+" → real lead, replay, server snapshot and recording",async({page})=>{
  const db=new Client({connectionString:dsn});await db.connect();
  let leadId:string|undefined;
  try {
    await page.setExtraHTTPHeaders({"X-Test-Client":"portfolio-"+randomUUID()});
    await page.goto(base+"/demo/"+key);
    let endpoint="/api/leads";
    if(key==="estimate") {
      endpoint="/api/estimates";
      await page.getByLabel("Количество конструкций").fill("2");
      await page.getByLabel("Стеклопакет").selectOption("triple");
      await page.getByLabel("Цвет профиля").selectOption("graphite");
      await page.getByTestId("estimate-calculate").click();
      await expect(page.getByTestId("estimate-quote-total")).toHaveText(/67.?060,80/);
      await page.getByTestId("estimate-to-contact").click();
      await page.getByTestId("estimate-phone").fill("+70000000000");
      await page.getByTestId("estimate-consent").check();
    }else{
      await page.getByTestId("next-to-preference").click();
      if(key==="auto")await page.getByTestId("service-option-wheel-size").selectOption("R16");
      if(key==="beauty")await page.getByTestId("resource-select").selectOption("master-b");
      if(key==="medical")await page.getByTestId("resource-select").selectOption("doctor-demo");
      if(key==="sports")await page.getByTestId("resource-select").selectOption("coach-kids");
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
    const saved=(await db.query("SELECT site_key,kind,preferred_at,price_snapshot,(SELECT count(*)::int FROM notification_outbox o WHERE o.lead_id=l.id) AS outbox_count FROM leads l WHERE id=$1",[leadId])).rows[0];
    expect(saved.site_key).toBe(key);expect(saved.outbox_count).toBe(1);
    expect(saved.kind).toBe(key==="estimate"?"estimate":"booking");
    if(key==="estimate"){expect(saved.preferred_at).toBe(null);expect(saved.price_snapshot.amountMinor).toBe(6706080);expect(saved.price_snapshot.estimate.parameters.quantity).toBe(2);}
    await expect.poll(async()=>{
      const work=await fetch(base+"/api/internal/outbox",{method:"POST",headers:{Authorization:"Bearer "+process.env.TEST_OUTBOX_SECRET}});
      expect(work.status).toBe(200);
      const result=await db.query("SELECT payload FROM notification_receipts WHERE lead_id=$1",[leadId]);
      return result.rowCount;
    },{timeout:15000}).toBe(1);
    const recorded=(await db.query("SELECT r.payload,o.status FROM notification_receipts r JOIN notification_outbox o ON o.id=r.outbox_id WHERE r.lead_id=$1",[leadId])).rows;
    expect(recorded).toHaveLength(1);expect(recorded[0].status).toBe("sent");
    if(key==="estimate")expect(recorded[0].payload.estimate.totalMinor).toBe(6706080);
  }finally{
    if(leadId)await db.query("DELETE FROM leads WHERE id=$1",[leadId]);
    await db.end();
  }
});
