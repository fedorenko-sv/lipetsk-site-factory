import test from "node:test";
import assert from "node:assert/strict";
import {parseWindowParameters, quoteWindow} from "../../src/features/estimate/domain.ts";
const rates={frameRateMinor:1200000,doorRateMinor:1500000,tripleExtraMinor:240000,graphitePercent:20,installationMinorEach:450000};
const standard={product:"window",widthMm:1200,heightMm:1400,quantity:1,glazing:"double",finish:"white",installation:true};
test("EB01: known window price is exact in minor units, with a transparent sum",()=>{
 const q=quoteWindow(standard,rates);
 assert.equal(q.totalMinor,2466000);
 assert.equal(q.breakdown.reduce((n,x)=>n+x.amountMinor,0),q.totalMinor);
 assert.equal(q.currency,"RUB");assert.ok(q.assumptions.length>=2);
});
test("EB02: glazing, finish and quantity affect their own lines",()=>{
 const q=quoteWindow({...standard,glazing:"triple",finish:"graphite"},rates);
 assert.equal(q.totalMinor,3353040);
 assert.equal(quoteWindow({...standard,quantity:2},rates).totalMinor,4932000);
 assert.equal(quoteWindow({...standard,installation:false},rates).totalMinor,2016000);
 assert.equal(quoteWindow({...standard,product:"balcony-door"},rates).totalMinor,2970000);
});
test("EB03: boundaries are inclusive and dimensions use whole 100 mm increments",()=>{
 for(const dimension of [600,2400])assert.equal(parseWindowParameters({...standard,widthMm:dimension,heightMm:dimension}).ok,true);
 for(const value of [599,2401,650,1200.5,"1200",null,Infinity,NaN]){
  const r=parseWindowParameters({...standard,widthMm:value});assert.equal(r.ok,false);assert.ok(r.fieldErrors["parameters.widthMm"]);
 }
 for(const quantity of [0,7,1.1,"2"])assert.equal(parseWindowParameters({...standard,quantity}).ok,false);
});
test("EB04: unknown fields and incomplete records cannot enter the calculation",()=>{
 for(const input of [null,[],{}, {...standard,price:1},{...standard,finish:"purple"},{...standard,installation:"yes"}])assert.equal(parseWindowParameters(input).ok,false);
 const r=parseWindowParameters(JSON.parse('{"__proto__":{},"product":"window","widthMm":1200,"heightMm":1400,"quantity":1,"glazing":"double","finish":"white","installation":true}'));assert.equal(r.ok,false);
});
test("EB05: every offered combination produces finite integer money",()=>{
 for(const product of ["window","balcony-door"])for(const widthMm of [600,1200,2400])for(const heightMm of [600,1400,2400])for(const quantity of [1,6]){
  const q=quoteWindow({...standard,product,widthMm,heightMm,quantity,glazing:"triple",finish:"graphite"},rates);
  assert.ok(Number.isSafeInteger(q.totalMinor));assert.ok(q.totalMinor>0);
 }
});
