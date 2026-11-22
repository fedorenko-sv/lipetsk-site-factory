// System acceptance for client brands on a single production build.
// Two processes per shell (default brand and alternative brand), genuine browser submissions to the
// local test PostgreSQL, payload comparison, recoverable network error, layout, focus, fonts, invalid selection.
// Usage: npm run build && npm run db:test:up && npm run test:brands:system
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomBytes} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {Client} from "pg";
import {chromium} from "@playwright/test";
import {assertSafeTestDatabaseUrl} from "../src/server/config/guards.ts";
import {getBrand,defaultBrand} from "../src/brands/registry.ts";
import {catalogPage,actionPage} from "../src/features/prototypes/pages.ts";
import {previewSettings} from "./preview-runtime.mjs";
import {startPreview,assertPreviewPortFree} from "./preview-runner.mjs";
import {submitDemoViaBrowser} from "./portfolio-browser-flow.mjs";

const postgresUrl=assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL||"postgresql://lsf_test:lsf_test_only@127.0.0.1:55543/lsf_test_backend");
const runId=randomBytes(6).toString("hex");
const out="docs/reports/client-branding";
await mkdir(out,{recursive:true});
const freePort=async()=>{const s=net.createServer();await new Promise(r=>s.listen(0,"127.0.0.1",r));const p=s.address().port;await new Promise(r=>s.close(r));return p;};
const pairs=[{shell:"beauty",alt:"vecher"},{shell:"estimate",alt:"teplo"}];
const admin=new Client({connectionString:postgresUrl});await admin.connect();
const browser=await chromium.launch();
const results=[],owned=[],payloads={};

async function noHorizontalScroll(page){return page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth);}

async function checkLook(instance,brand,other){
  const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce"});
  const page=await ctx.newPage();
  const fonts=new Set();page.on("request",r=>{if(/\/fonts\/font-\d\.(woff2|ttf)$/.test(r.url()))fonts.add(path.basename(r.url()));});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  const shell=brand.shell, pages=["/demo/"+shell,"/demo/"+shell+"/"+catalogPage(shell).slug,"/demo/"+shell+"/"+actionPage(shell).slug,"/demo/"+shell+"/privacy"];
  const checks={};
  for(const p of pages){
    const res=await page.goto(instance.base+p,{waitUntil:"networkidle"});
    assert.equal(res.status(),200,p);
    const title=await page.title();
    assert.ok(title.includes(brand.name.short)||title.includes(brand.name.full),p+" title "+title);
    const html=await page.content();
    assert.ok(!html.includes(other.name.short),p+" leaks "+other.name.short);
    assert.equal(await page.locator(".prototype").getAttribute("data-brand"),brand.key);
    const bg=await page.locator(".prototype").evaluate(el=>getComputedStyle(el).backgroundColor);
    const [r,g,b]=[1,3,5].map(i=>parseInt(brand.palette.canvas.slice(i,i+2),16));
    assert.equal(bg,`rgb(${r}, ${g}, ${b})`,p+" canvas");
    assert.match(await page.locator(".prototype-footer").textContent(),new RegExp(brand.name.full.replace(/[«»()]/g,".")));
    checks[p]={status:200,title};
  }
  const logo=await page.locator(".prototype-brand-logo").count();
  const logoExpected=Boolean(brand.scheme==="dark"?brand.logo?.onDark:brand.logo?.onLight);
  assert.equal(logo,logoExpected?1:0,"logo or text fallback");
  if(!logoExpected)assert.equal((await page.locator(".prototype-brand-name").textContent()).trim(),brand.name.short);
  // Keyboard: skip link then brand link, both with a visible outline.
  await page.goto(instance.base+"/demo/"+shell);
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(()=>document.activeElement.className),"prototype-skip");
  await page.keyboard.press("Tab");
  const focus=await page.evaluate(()=>{const s=getComputedStyle(document.activeElement);return {cls:document.activeElement.className,style:s.outlineStyle,width:s.outlineWidth,color:s.outlineColor};});
  assert.equal(focus.cls,"prototype-brand");assert.equal(focus.style,"solid");assert.notEqual(focus.width,"0px");
  // Layout at phone/tablet/desktop and 200% zoom of a 1440 window (720 CSS px).
  const widths={};
  for(const width of [360,390,720,768,1440]){
    await page.setViewportSize({width,height:900});
    for(const p of pages.slice(0,3)){await page.goto(instance.base+p,{waitUntil:"networkidle"});assert.ok(await noHorizontalScroll(page),p+" @"+width);}
    widths[width]="no horizontal scroll";
  }
  // Reduced motion: reveal blocks are visible without scrolling animation.
  await page.goto(instance.base+"/demo/"+shell);
  const hidden=await page.locator("[data-reveal]").evaluateAll(els=>els.filter(e=>getComputedStyle(e).opacity!=="1").length);
  assert.equal(hidden,0,"reduced motion keeps content visible");
  // Unavailable fonts: fallback stack, content still laid out.
  const ctx2=await browser.newContext({viewport:{width:390,height:844},reducedMotion:"reduce"});
  const p2=await ctx2.newPage();await p2.route(/\/fonts\/.*\.(woff2|ttf)$/,r=>r.abort());
  await p2.goto(instance.base+"/demo/"+shell,{waitUntil:"networkidle"});
  assert.ok(await p2.locator("h1").isVisible());assert.ok(await noHorizontalScroll(p2),"font fallback overflow");
  await ctx2.close();
  const usesSerif=[brand.typography?.display.family,brand.typography?.body.family].includes("oblik-serif");
  assert.equal([...fonts].some(f=>/^font-[01]\./.test(f)),usesSerif,"only the brand's families are downloaded");
  assert.deepEqual(errors,[]);
  await ctx.close();
  return {pages:checks,logo:logoExpected?"image":"text fallback",focus,widths,fonts:[...fonts].sort(),fontFallback:"ok",reducedMotion:"content visible"};
}

async function submit(instance,brand,{networkFailure}){
  const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:"reduce"});
  const page=await ctx.newPage();
  let recovered=null;
  if(networkFailure){
    // First POST dies on the network; the visitor retries; the same idempotency key must be reused and the contact kept.
    const endpoint=brand.shell==="estimate"?"**/api/estimates":"**/api/leads";
    let failedKey=null;
    await page.route(endpoint,async route=>{if(failedKey){await route.fallback();return;}failedKey=route.request().headers()["idempotency-key"];await route.abort("failed");});
    await page.goto(instance.base+"/demo/"+brand.shell);
    if(brand.shell==="beauty"){
      await page.getByTestId("next-to-preference").click();
      await page.getByTestId("resource-select").selectOption("master-b");
      const day=new Date(Date.now()+2*86400000);while(day.getUTCDay()===0)day.setUTCDate(day.getUTCDate()+1);
      await page.getByTestId("preferred-date").fill(day.toISOString().slice(0,10));
      await page.getByTestId("preferred-time").selectOption("11:00");
      await page.getByTestId("next-to-contact").click();
      await page.getByTestId("customer-phone").fill("+7"+"0".repeat(10));
      await page.getByTestId("consent").check();
      await page.getByTestId("lead-submit").click();
      await page.getByTestId("lead-error").waitFor();
      await page.screenshot({path:`${out}/${brand.key}-error-390.png`});
      assert.equal(await page.getByTestId("customer-phone").inputValue(),"+7"+"0".repeat(10),"contact kept after recoverable error");
      const waiting=page.waitForResponse(r=>r.url().endsWith("/api/leads")&&r.request().method()==="POST");
      await page.getByTestId("lead-retry").click();
      const response=await waiting;assert.equal(response.status(),201);
      assert.equal(response.request().headers()["idempotency-key"],failedKey,"same key after network loss");
      await page.getByTestId("lead-id").waitFor();
      recovered={retryStatus:201,sameIdempotencyKey:true,contactKept:true};
      await page.screenshot({path:`${out}/${brand.key}-receipt-390.png`});
      await ctx.close();
      return {recovered,payload:response.request().postDataJSON()};
    }
  }
  const {receipt,request}=await submitDemoViaBrowser(page,instance.base,brand.shell);
  await page.screenshot({path:`${out}/${brand.key}-receipt-390.png`});
  await ctx.close();
  return {receipt:receipt.leadId?"stored":"missing",payload:request.postDataJSON()};
}

function comparable(payload){
  const {customer,consent,preferred,...rest}=payload;
  delete rest.antiBot;
  return {...rest,customerKeys:Object.keys(customer).sort(),consentKeys:Object.keys(consent).sort(),preferredKeys:preferred?Object.keys(preferred).sort():null};
}

async function invalidSelections(){
  const cases=[{site:"beauty",brand:"teplo",why:"incompatible"},{site:"beauty",brand:"nope",why:"unknown"},{site:"estimate",brand:"vecher",why:"incompatible"}];
  const outcome=[];
  for(const c of cases){
    const port=await freePort();
    const child=spawn(process.execPath,[path.join(process.cwd(),"node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env,NODE_ENV:"production",DEMO_SITE_KEY:c.site,DEMO_BRAND_KEY:c.brand},stdio:"ignore"});
    try{
      let status=0;
      for(let i=0;i<80&&!status;i++){try{status=(await fetch(`http://127.0.0.1:${port}/demo/${c.site}`)).status;}catch{await delay(150);}}
      assert.equal(status,503,c.site+"+"+c.brand);
      const text=await (await fetch(`http://127.0.0.1:${port}/demo/${c.site}`)).text();
      assert.ok(!text.includes(c.brand)&&!/ВЕЧЕР|ТЕПЛО|MIRA|ПРОСВЕТ/.test(text),"no identity in error body");
      outcome.push({...c,status});
    }finally{child.kill("SIGTERM");await new Promise(r=>child.once("exit",r));}
  }
  return outcome;
}

try{
  for(const {shell,alt} of pairs){
    const brands=[defaultBrand(shell),getBrand(alt)];
    for(const brand of brands){
      const other=brands.find(b=>b!==brand);
      const port=await freePort();
      const options={siteKey:shell,port,instanceId:runId,postgresUrl,...(brand.key===alt?{brandKey:alt}:{})};
      const settings=previewSettings(options);owned.push(settings.database);
      let instance;
      try{
        instance=await startPreview(options);
        const look=await checkLook(instance,brand,other);
        const sent=await submit(instance,brand,{networkFailure:brand.key===alt&&shell==="beauty"});
        payloads[brand.key]=comparable(sent.payload);
        results.push({shell,brand:brand.key,base:instance.base,...look,submission:sent.recovered??sent.receipt});
        console.log(shell+"/"+brand.key+": pages, identity, focus, widths, fonts, submission PASS");
      }finally{await instance?.stop();await assertPreviewPortFree(port);}
    }
    const [a,b]=brands.map(x=>payloads[x.key]);
    assert.deepEqual(a,b,shell+": brand must not change the request contract");
    console.log(shell+": identical payload contract for "+brands.map(x=>x.key).join(" and "));
  }
  results.push({invalidSelections:await invalidSelections()});
  console.log("Unknown/incompatible brand → 503 without identity PASS");
}finally{
  await browser.close();
  for(const name of owned){
    if(!name.endsWith("_"+runId)||!/^lsf_test_demo_[a-z]+_\d+_[a-f0-9]{12}$/.test(name))throw new Error("Refuse cleanup outside this run");
    await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()",[name]);
    await admin.query('DROP DATABASE IF EXISTS "'+name+'"');
  }
  await admin.end();
}
await writeFile(out+"/system-results.json",JSON.stringify({runId,at:new Date().toISOString(),payloadContract:payloads,results},null,2)+"\n");
console.log("Brand system acceptance PASS: 4 previews from one build, 4 genuine submissions, 3 invalid selections.");
