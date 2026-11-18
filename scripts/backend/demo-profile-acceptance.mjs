import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import {setTimeout as delay} from "node:timers/promises";
import {getPrototype} from "../../src/features/prototypes/catalog.ts";
import {catalogPage,actionPage} from "../../src/features/prototypes/pages.ts";
import {submitDemoViaBrowser} from "../portfolio-browser-flow.mjs";

const counts=async db=>(await db.query("SELECT (SELECT count(*)::int FROM leads) AS leads,(SELECT count(*)::int FROM notification_outbox) AS outbox,(SELECT count(*)::int FROM rate_limits) AS limits")).rows[0];

export async function checkProfilePages(instance,profile) {
  const root=await fetch(instance.base+"/?source=profile-check",{redirect:"manual"});
  assert.equal(root.status,307);
  const location=new URL(root.headers.get("location"),instance.base);
  assert.equal(location.origin,instance.base);assert.equal(location.pathname,"/demo/"+profile.key);
  assert.equal(location.searchParams.get("source"),"profile-check");
  assert.match(root.headers.get("x-robots-tag"),/noindex/);
  const ownPaths=["/demo/"+profile.key,"/demo/"+profile.key+"/"+catalogPage(profile.key).slug,"/demo/"+profile.key+"/"+actionPage(profile.key).slug,"/demo/"+profile.key+"/privacy"];
  for(const pathname of ownPaths){
    const response=await fetch(instance.base+pathname);
    assert.equal(response.status,200,pathname);
    const html=await response.text();
    assert.match(html,/name="robots" content="[^"]*noindex/);
    assert.equal((html.match(/<h1[\s>]/g)||[]).length,1,pathname);
  }
  for(const key of ["auto","beauty","medical","sports","stay","estimate","detailing"]){
    const response=await fetch(instance.base+"/demo/"+key,{headers:{RSC:"1","Next-Router-Prefetch":"1"}});
    assert.equal(response.status,profile.siteKeys.includes(key)?200:404,key);
    if(!profile.siteKeys.includes(key))assert.match(response.headers.get("x-robots-tag"),/noindex/);
  }
  const foreign=profile.key==="beauty"?"auto":"beauty";
  assert.equal((await fetch(instance.base+"/demo/"+foreign.replace("a","%61"))).status,404);
  assert.equal((await fetch(instance.base+"/demo/"+profile.key+"-other")).status,404);
  assert.equal((await fetch(instance.base+"/demo-assets/detailing/fonts/font-2.woff2")).status,200);
  return {ownPages:ownPaths.length,foreignRoutesBlocked:7-profile.siteKeys.length,root:307};
}

export async function checkProfileRequests(instance,profile,page,db,folder) {
  const foreignKind=profile.key==="estimate"?"booking":"estimate";
  const foreign=JSON.parse(await readFile("examples/http/"+foreignKind+"-request.json","utf8"));
  if(foreign.preferred){const date=new Date(Date.now()+2*86400000);while(date.getUTCDay()===0)date.setUTCDate(date.getUTCDate()+1);foreign.preferred.date=date.toISOString().slice(0,10);}
  const wrongEndpoint=foreignKind==="booking"?"/api/leads":"/api/estimates";
  const post=(origin,body,key=randomUUID())=>fetch(instance.base+wrongEndpoint,{method:"POST",headers:{Origin:origin,"Content-Type":"application/json","Idempotency-Key":key},body:JSON.stringify(body)});
  const denied=await post(instance.base,foreign);
  assert.equal(denied.status,404);assert.equal((await denied.json()).error.code,"SITE_NOT_FOUND");
  const badOrigin=await post("https://outside.invalid",foreign);
  assert.equal(badOrigin.status,403);assert.equal((await badOrigin.json()).error.code,"ORIGIN_NOT_ALLOWED");
  assert.deepEqual(await counts(db),{leads:0,outbox:0,limits:0});
  const {endpoint,receipt,request}=await submitDemoViaBrowser(page,instance.base,profile.key);
  assert.match(await page.locator(".prototype-brand").textContent(),new RegExp(getPrototype(profile.key).brand));
  const replay=await page.context().request.post(instance.base+endpoint,{
    headers:{Origin:instance.base,"Idempotency-Key":request.headers()["idempotency-key"]},data:request.postDataJSON(),
  });
  assert.equal(replay.status(),200);assert.equal((await replay.json()).leadId,receipt.leadId);
  const row=(await db.query("SELECT site_key,kind FROM leads WHERE id=$1",[receipt.leadId])).rows[0];
  assert.equal(row.site_key,profile.key);assert.equal(row.kind,profile.key==="estimate"?"estimate":"booking");
  let delivery;
  for(let i=0;i<40;i++){
    await instance.dispatch();
    delivery=(await db.query("SELECT status,destination_key,(SELECT count(*)::int FROM notification_receipts r WHERE r.lead_id=o.lead_id) AS receipts FROM notification_outbox o WHERE lead_id=$1",[receipt.leadId])).rows[0];
    if(delivery.status==="sent")break;
    await delay(250);
  }
  assert.equal(delivery.status,"sent");assert.equal(delivery.receipts,1);assert.equal(delivery.destination_key,"demo-"+profile.key+"-v1");
  const finalCounts=await counts(db);assert.equal(finalCounts.leads,1);assert.equal(finalCounts.outbox,1);
  const state=JSON.parse(await readFile(instance.stateFile,"utf8"));
  assert.equal(state.profile,profile.key);assert.equal(state.database,instance.database);
  assert.doesNotMatch(JSON.stringify(state),/postgresql:|HMAC|SECRET|DATABASE_URL/);
  await page.screenshot({path:folder+"/"+profile.key+"-receipt.png"});
  await writeFile(folder+"/"+profile.key+"-state.json",JSON.stringify({...state,helperPid:undefined,appPid:undefined},null,2)+"\n");
  return {leadId:receipt.leadId,http:201,replay:200,originDenied:403,foreignDenied:404,kind:row.kind,delivery:"sent",receipts:1};
}
