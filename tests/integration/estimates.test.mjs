import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { BASE, DOWN_BASE, db, clearRateLimits, postOutboxRun, bearer, freshClient } from "./helpers.mjs";
const readyBase=process.env.TEST_BASE_URL_READY;
const body=()=>JSON.parse(readFileSync("examples/http/estimate-request.json","utf8"));
async function post(request=body(), {base=BASE,key=randomUUID(),client=freshClient(),headers={}}={}) {
  const response=await fetch(base+"/api/estimates",{method:"POST",headers:{"content-type":"application/json",origin:base,"idempotency-key":key,"X-Test-Client":client,...headers},body:typeof request==="string"?request:JSON.stringify(request)});
  return {status:response.status,json:await response.json(),headers:response.headers};
}
async function lead(key) {
  return db(async c=>(await c.query("SELECT *, (SELECT count(*)::int FROM notification_outbox o WHERE o.lead_id=l.id) AS outbox_count FROM leads l WHERE site_key='estimate' AND idempotency_key=$1",[key])).rows[0]);
}
test("EI01: PostgreSQL persists kind, server quote, formula version and atomic outbox",async()=>{
  await clearRateLimits();
  const key=randomUUID();const a=await post(body(),{key});assert.equal(a.status,201);
  assert.deepEqual(Object.keys(a.json).sort(),["leadId","message","replayed","status"]);
  assert.match(a.headers.get("cache-control"),/no-store/);
  const row=await lead(key);assert.equal(row.id,a.json.leadId);assert.equal(row.kind,"estimate");assert.equal(row.preferred_at,null);
  assert.equal(row.price_snapshot.amountMinor,2466000);assert.equal(row.price_snapshot.estimate.formulaVersion,"windows-v1");
  assert.deepEqual(row.price_snapshot.estimate.parameters,body().parameters);assert.equal(row.outbox_count,1);
});
test("EI02: ten concurrent identical estimates create one lead/outbox; changed quantity conflicts",async()=>{
  await clearRateLimits();const key=randomUUID();const client=freshClient();const b=body();
  const results=await Promise.all(Array.from({length:10},()=>post(b,{key,client})));
  assert.equal(results.filter(r=>r.status===201).length,1);assert.equal(results.filter(r=>r.status===200).length,9);
  assert.equal(new Set(results.map(r=>r.json.leadId)).size,1);
  const row=await lead(key);assert.equal(row.outbox_count,1);
  const changed=await post({...b,parameters:{...b.parameters,quantity:2}},{key,client});assert.equal(changed.status,409);assert.equal(changed.json.error.code,"IDEMPOTENCY_CONFLICT");
  assert.equal((await lead(key)).price_snapshot.amountMinor,2466000);
});
test("EI03: forbidden client price, malformed JSON, origin, key and parameters cannot save",async()=>{
  await clearRateLimits();
  for(const [request,headers,status] of [
    [{...body(),price:1},{},422],
    [{...body(),parameters:{...body().parameters,widthMm:1250}},{},422],
    [body(),{origin:"https://outside.invalid"},403],
    [body(),{"idempotency-key":"not-a-uuid"},400],
    ["{",{},400],
    [{...body(),consent:{accepted:false,version:body().consent.version}},{},422],
    [{...body(),antiBot:{website:"spam"}},{},422],
  ]) {
    const key=randomUUID();const a=await post(request,{key,headers});assert.equal(a.status,status);
    assert.equal(await lead(key),undefined);
  }
});
test("EI04: stale versions and adapter readiness reject without rows or rate consumption",async()=>{
  await clearRateLimits();
  for(const [request,base,status,code] of [
    [{...body(),configVersion:"old"},BASE,409,"CONFIG_CHANGED"],
    [{...body(),consent:{accepted:true,version:"old"}},BASE,409,"CONSENT_CHANGED"],
    [body(),readyBase,503,"DEMO_NOT_READY"],
  ]) {
    const key=randomUUID();const a=await post(request,{key,base});assert.equal(a.status,status);assert.equal(a.json.error.code,code);assert.equal(await lead(key),undefined);
  }
  assert.equal(await db(async c=>Number((await c.query("SELECT coalesce(sum(count),0) AS n FROM rate_limits")).rows[0].n)),0);
});
test("EI05: unavailable PostgreSQL returns 503 without a success receipt",async()=>{
  const a=await post(body(),{base:DOWN_BASE});assert.equal(a.status,503);assert.equal(a.json.error.code,"STORAGE_UNAVAILABLE");assert.equal(a.json.leadId,undefined);
});
test("EI06: worker recording contains the same server calculation once",async()=>{
  await clearRateLimits();const key=randomUUID();const b=body();b.parameters.quantity=2;b.parameters.finish="graphite";b.parameters.glazing="triple";
  const a=await post(b,{key});assert.equal(a.status,201);
  // Previous suites may leave pending synthetic work; bounded draining reaches our row.
  for(let i=0;i<8;i++){await postOutboxRun(BASE,bearer());const r=await db(c=>c.query("SELECT payload FROM notification_receipts WHERE lead_id=$1",[a.json.leadId]));if(r.rowCount)break;}
  await postOutboxRun(BASE,bearer());
  const result=await db(c=>c.query("SELECT r.payload,o.status FROM notification_receipts r JOIN notification_outbox o ON o.id=r.outbox_id WHERE r.lead_id=$1",[a.json.leadId]));
  assert.equal(result.rowCount,1);assert.equal(result.rows[0].status,"sent");
  assert.equal(result.rows[0].payload.estimate.totalMinor,6706080);
  assert.deepEqual(result.rows[0].payload.estimate.parameters,b.parameters);
});
test("EI07: persistent per-client limit applies to estimates and replay stays available",async()=>{
  await clearRateLimits();const client=freshClient();const key=randomUUID();const b=body();
  assert.equal((await post(b,{key,client})).status,201);
  for(let i=0;i<4;i++)assert.equal((await post(b,{client})).status,201);
  const limited=await post(b,{client});assert.equal(limited.status,429);assert.ok(Number(limited.headers.get("retry-after"))>0);
  const replay=await post(b,{key,client});assert.equal(replay.status,200);assert.equal(replay.json.replayed,true);
});
