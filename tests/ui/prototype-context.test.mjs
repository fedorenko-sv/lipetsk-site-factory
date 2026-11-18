import test from "node:test";
import assert from "node:assert/strict";
import { getSiteConfig } from "../../src/config/sites/index.ts";
import { resolveBookingContext, resolveCalculatorContext } from "../../src/features/prototypes/context.ts";
import { demoPages, actionPage, catalogPage } from "../../src/features/prototypes/pages.ts";
import { getOfferStory } from "../../src/features/prototypes/offer-stories.ts";

test("PD01: each demo has an independent catalogue, action and complete service stories",()=>{
 for(const [id,pages] of Object.entries(demoPages)){
  assert.equal(new Set(pages.map(p=>p.slug)).size,pages.length);
  assert.ok(catalogPage(id));assert.ok(actionPage(id));
  if(id!=="estimate")for(const service of getSiteConfig(id).services)assert.ok(getOfferStory(id,service.id),id+"/"+service.id);
 }
});
test("PD02: a service and compatible resource survive a deep link",()=>{
 const c=resolveBookingContext(getSiteConfig("beauty"),{service:"manicure",resource:"master-b"});
 assert.deepEqual(c,{ok:true,serviceId:"manicure",resourceId:"master-b",startAtPreference:true});
 assert.deepEqual(resolveBookingContext(getSiteConfig("stay"),{}),{ok:true,startAtPreference:false});
});
test("PD03: unknown, foreign, repeated or orphan resource context is rejected",()=>{
 for(const query of [{service:"constructor"},{service:["haircut","manicure"]},{service:"manicure",resource:"master-a"},{service:"haircut",resource:"doctor-demo"},{resource:"master-b"},{service:""},{service:"haircut",resource:["master-a"]}])assert.equal(resolveBookingContext(getSiteConfig("beauty"),query).ok,false);
});
test("PD04: calculator product is a small explicit allowlist",()=>{
 assert.deepEqual(resolveCalculatorContext({product:"balcony-door"}),{ok:true,product:"balcony-door"});
 assert.deepEqual(resolveCalculatorContext({}),{ok:true});
 for(const product of ["constructor","",["window","balcony-door"]])assert.equal(resolveCalculatorContext({product}).ok,false);
});
