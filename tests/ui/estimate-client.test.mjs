import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {submitLead,SubmitError} from "../../src/features/booking/client/lead-client.ts";
const request=()=>JSON.parse(readFileSync("examples/http/estimate-request.json","utf8"));
test("EB06: estimate transport uses its same-origin route; arbitrary URLs cannot receive data",async()=>{
 const original=globalThis.fetch;const seen=[];
 globalThis.fetch=async(url,options)=>{
  seen.push({url,options});
  return new Response(JSON.stringify({leadId:"a0000000-0000-4000-8000-000000000001",status:"received",replayed:false,message:"Demo saved"}),{status:201,headers:{"content-type":"application/json"}});
 };
 try {
  const result=await submitLead(request(),{endpoint:"/api/estimates",idempotencyKey:"a0000000-0000-4000-8000-000000000002"});
  assert.equal(result.httpStatus,201);assert.equal(seen[0].url,"/api/estimates");assert.equal(JSON.parse(seen[0].options.body).kind,"estimate");
  await assert.rejects(()=>submitLead(request(),{endpoint:"https://outside.invalid/collect",idempotencyKey:"a0000000-0000-4000-8000-000000000002"}),e=>e instanceof SubmitError&&e.kind==="invalid-response");
  assert.equal(seen.length,1);
 }finally{globalThis.fetch=original;}
});
test("EB07: invalid rates never produce a displayed finite quote",async()=>{
 const {quoteWindow,defaultWindowParameters}=await import("../../src/features/estimate/domain.ts");
 const rates={frameRateMinor:1200000,doorRateMinor:1500000,tripleExtraMinor:240000,graphitePercent:20,installationMinorEach:450000};
 for(const update of [{frameRateMinor:-1},{doorRateMinor:NaN},{tripleExtraMinor:Infinity},{graphitePercent:101},{installationMinorEach:0.5},{frameRateMinor:1_000_000_000}])assert.throws(()=>quoteWindow(defaultWindowParameters,{...rates,...update}),RangeError);
});
