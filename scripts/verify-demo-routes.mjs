import assert from "node:assert/strict";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {prototypes} from "../src/features/prototypes/catalog.ts";
import {getDemoPages,catalogPage} from "../src/features/prototypes/pages.ts";
import {getSiteConfig} from "../src/config/sites/index.ts";
import {base} from "./detailing-preview-address.mjs";

const routes=[{site:"factory",path:"/"}];
for(const p of prototypes){
 const prefix="/demo/"+p.id;
 routes.push({site:p.id,path:prefix},{site:p.id,path:prefix+"/privacy"});
 for(const page of getDemoPages(p.id))routes.push({site:p.id,path:prefix+"/"+page.slug});
 const items=p.id==="estimate"?["window","balcony-door"]:getSiteConfig(p.id).services.map(s=>s.id);
 for(const item of items)routes.push({site:p.id,path:prefix+"/"+catalogPage(p.id).slug+"/"+item});
}
const detailing=JSON.parse(await readFile("examples/sites/detailing.json","utf8"));
for(const section of ["","/services","/prices","/atelier","/care","/visit","/booking","/privacy"])routes.push({site:"detailing",path:"/demo/detailing"+section});
for(const service of detailing.services)routes.push({site:"detailing",path:"/demo/detailing/services/"+service.id});
assert.equal(new Set(routes.map(r=>r.path)).size,routes.length);
const results=[];
for(let offset=0;offset<routes.length;offset+=4){
 const batch=await Promise.all(routes.slice(offset,offset+4).map(async r=>{
  const response=await fetch(base+r.path,{signal:AbortSignal.timeout(20000)});
  const html=await response.text();
  return {...r,status:response.status,h1:(html.match(/<h1[\s>]/g)||[]).length,noindex:/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/.test(html)};
 }));
 results.push(...batch);
}
await mkdir("work/portfolio",{recursive:true});
await writeFile("work/portfolio/routes.json",JSON.stringify({base,checkedAt:new Date().toISOString(),counts:Object.fromEntries([...new Set(results.map(r=>r.site))].map(id=>[id,results.filter(r=>r.site===id).length])),routes:results},null,2)+"\n");
const errors=results.filter(r=>r.status!==200||r.h1!==1||!r.noindex);
assert.deepEqual(errors,[],"Route health failures");
console.log(results.length+" public demo pages: HTTP 200, one H1, noindex. Independent demo pages: "+results.filter(r=>r.site!=="factory"&&r.site!=="detailing").length+".");
