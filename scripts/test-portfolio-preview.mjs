// End-to-end checks for the already running local synthetic preview, without HTTP mocks.
import assert from "node:assert/strict";
import {submitDemoViaBrowser} from "./portfolio-browser-flow.mjs";
import { chromium } from "@playwright/test";
import { Client } from "pg";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { assertSafeTestDatabaseUrl } from "../src/server/config/guards.ts";
import { base, database } from "./detailing-preview-address.mjs";

const keys=["auto","beauty","medical","sports","stay","estimate"];
const dir="work/portfolio";
await mkdir(dir+"/screenshots",{recursive:true});
const dsn=assertSafeTestDatabaseUrl("postgresql://lsf_test:lsf_test_only@127.0.0.1:55543/"+database);
const db=new Client({connectionString:dsn});
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:"reduce"});
const page=await context.newPage();
const browserErrors=[];
page.on("pageerror",error=>browserErrors.push(error.name));
const leads=[];
const visuals=[];
try {
  await db.connect();
  for(const width of [390,768,1440]) {
    await page.setViewportSize({width,height:width===390?844:1000});
    for(const key of ["hub",...keys]) {
      const response=await page.goto(base+(key==="hub"?"/":"/demo/"+key));
      assert.equal(response.status(),200);
      await page.evaluate(()=>document.fonts.ready);
      await page.locator("h1").waitFor();
      assert.equal(await page.locator("h1").count(),1);
      const checks=await page.evaluate(()=>({
        overflow:document.documentElement.scrollWidth>innerWidth+1,
        missing:[...document.images].filter(i=>i.loading!=="lazy"&&(!i.complete||!i.naturalWidth)).length,
        atTop:scrollY===0,
      }));
      assert.equal(checks.overflow,false,key+"/"+width+" overflows");
      assert.equal(checks.missing,0,key+"/"+width+" missing image");
      assert.equal(checks.atTop,true,key+"/"+width+" stole focus on mount");
      await page.screenshot({path:dir+"/screenshots/"+key+"-"+width+".png",fullPage:false});
      visuals.push({key,width,...checks});
    }
  }
  await page.setViewportSize({width:1280,height:960});
  for(const key of keys) {
    const {endpoint,receipt,request}=await submitDemoViaBrowser(page,base,key);
    const replay=await context.request.post(base+endpoint,{headers:{Origin:base,"Content-Type":"application/json","Idempotency-Key":request.headers()["idempotency-key"]},data:request.postDataJSON()});
    assert.equal(replay.status(),200);assert.equal((await replay.json()).leadId,receipt.leadId);
    const saved=(await db.query("SELECT site_key,kind,service_id,preferred_at,price_snapshot,(SELECT count(*)::int FROM notification_outbox o WHERE o.lead_id=l.id) AS outbox_count FROM leads l WHERE id=$1",[receipt.leadId])).rows[0];
    assert.equal(saved.site_key,key);assert.equal(saved.outbox_count,1);
    if(key==="estimate") {
      assert.equal(saved.kind,"estimate");assert.equal(saved.preferred_at,null);assert.equal(saved.price_snapshot.amountMinor,6706080);
      assert.equal(saved.price_snapshot.estimate.parameters.quantity,2);
    }else assert.equal(saved.kind,"booking");
    await page.screenshot({path:dir+"/screenshots/"+key+"-receipt.png"});
    leads.push({site:key,leadId:receipt.leadId,http:201,replay:200,uiMatches:true,kind:saved.kind,amountMinor:saved.price_snapshot.amountMinor});
  }
  for(const result of leads){
    let status;
    for(let i=0;i<60;i++){
      status=(await db.query("SELECT o.status,(SELECT count(*)::int FROM notification_receipts r WHERE r.lead_id=o.lead_id) AS receipts FROM notification_outbox o WHERE o.lead_id=$1",[result.leadId])).rows[0];
      if(status?.status==="sent")break;
      await delay(500);
    }
    assert.equal(status.status,"sent",result.site+" outbox");
    assert.equal(status.receipts,1);result.outbox="sent";result.recordingReceipts=1;
  }
  assert.deepEqual(browserErrors,[]);
  await writeFile(dir+"/system-results.json",JSON.stringify({base,transportMocked:false,visuals,leads,browserErrors},null,2));
  console.log("Portfolio: 21 viewport checks; 6 real UI → API → PostgreSQL → outbox/recording paths; 6 idempotent replays: PASS");
}finally{
  // Remove only this run's synthetic leads; preview data from the owner remains.
  if(leads.length)await db.query("DELETE FROM leads WHERE id=ANY($1::uuid[])",[leads.map(l=>l.leadId)]).catch(()=>{});
  await db.end();await browser.close();
}
