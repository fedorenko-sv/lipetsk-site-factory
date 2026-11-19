import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createEstimateLead} from "../../src/server/estimates/create-estimate.ts";
import {validateEstimateRequest} from "../../src/server/estimates/schema.ts";
import {estimateConfig} from "../../src/features/estimate/config.ts";
import {defaultWindowParameters} from "../../src/features/estimate/domain.ts";
import {loadRuntimeConfig} from "../../src/server/config/runtime.ts";
const clock={now:()=>new Date("2026-11-18T09:00:00Z")};
const runtime=()=>loadRuntimeConfig({ALLOWED_ORIGINS:"http://x.test",ALLOWED_SITE_KEYS:"estimate",DATABASE_URL:"postgresql://x/y",IDEMPOTENCY_HMAC_KEY:"x".repeat(40),RATE_LIMIT_HMAC_KEY:"y".repeat(40),OUTBOX_SECRET:"z".repeat(40),SITE_DESTINATIONS_JSON:JSON.stringify({estimate:{destinationKey:"demo",version:1}}),NOTIFICATION_DESTINATIONS_JSON:JSON.stringify({demo:{adapterId:"recording"}})});
const wire=()=>({siteKey:"estimate",kind:"estimate",configVersion:estimateConfig.contentVersion,parameters:{...defaultWindowParameters},customer:{phone:"+70000000000"},consent:{accepted:true,version:estimateConfig.legal.consentVersion},antiBot:{website:""}});
function setup(){
 const rows=[];const saved=new Map();const store={async submit(a){
  const old=saved.get(a.idempotencyKey);if(old)return old.hmac===a.payloadHmac?{kind:"replayed",leadId:old.id}:{kind:"conflict"};
  const d=a.validateNew();if(!d.ok)return {kind:"rejected",failure:d.failure};
  rows.push(d.row);const id=randomUUID();saved.set(a.idempotencyKey,{id,hmac:a.payloadHmac});return {kind:"created",leadId:id};
 }};
 return {rows,deps:{runtime:runtime(),clock,store,siteLoader:k=>k==="estimate"?estimateConfig:null}};
}
const context=()=>({idempotencyKey:randomUUID(),clientHmac:"c".repeat(64)});
test("BE01: server derives and snapshots price from parameters, not a browser price",async()=>{
 const {deps,rows}=setup();const result=await createEstimateLead(deps,context(),wire());assert.equal(result.kind,"created");
 assert.equal(rows[0].kind,"estimate");assert.equal(rows[0].preferredAt,null);assert.equal(rows[0].priceSnapshot.amountMinor,2466000);
 assert.equal(rows[0].priceSnapshot.estimate.parameters.widthMm,1200);assert.equal(rows[0].priceSnapshot.estimate.formulaVersion,"windows-v1");
});
test("BE02: identical replay precedes updated config; changed parameters conflict",async()=>{
 const {deps,rows}=setup();const ctx=context();const request=wire();const a=await createEstimateLead(deps,ctx,request);
 deps.siteLoader=()=>({...estimateConfig,contentVersion:"next"});
 const b=await createEstimateLead(deps,ctx,request);assert.equal(b.kind,"replayed");assert.equal(a.leadId,b.leadId);
 const c=await createEstimateLead(deps,ctx,{...request,parameters:{...request.parameters,quantity:2}});assert.equal(c.code,"IDEMPOTENCY_CONFLICT");assert.equal(rows.length,1);
});
test("BE03: versions and unconfigured destinations reject before insertion",async()=>{
 for(const [update,code]of [[{configVersion:"old"},"CONFIG_CHANGED"],[{consent:{accepted:true,version:"old"}},"CONSENT_CHANGED"]]){
  const {deps,rows}=setup();assert.equal((await createEstimateLead(deps,context(),{...wire(),...update})).code,code);assert.equal(rows.length,0);
 }
 const {deps,rows}=setup();deps.runtime.destinations.clear();assert.equal((await createEstimateLead(deps,context(),wire())).code,"DEMO_NOT_READY");assert.equal(rows.length,0);
});
test("BE04: strict estimate schema rejects client prices, unknown keys and non-demo shapes",()=>{
 assert.equal(validateEstimateRequest(wire()).ok,true);
 for(const request of [{...wire(),price:1},{...wire(),parameters:{...defaultWindowParameters,widthMm:650}},{...wire(),parameters:{...defaultWindowParameters,extra:1}},{...wire(),consent:{accepted:false,version:estimateConfig.legal.consentVersion}},{...wire(),kind:"booking"}])assert.equal(validateEstimateRequest(request).ok,false);
});
test("BE05: malformed contact and unknown site have no write",async()=>{
 for(const update of [{siteKey:"unknown"},{customer:{phone:"+79991234567"}},{customer:{phone:"+70000000000",name:" "}}]){
  const {deps,rows}=setup();const result=await createEstimateLead(deps,context(),{...wire(),...update});assert.notEqual(result.kind,"created");assert.equal(rows.length,0);
 }
});
