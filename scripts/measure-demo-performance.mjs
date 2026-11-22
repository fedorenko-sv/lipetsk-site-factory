import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const base = process.env.PERF_BASE_URL || "http://127.0.0.1:3035";
const parsed = new URL(base);
if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) throw new Error("Local lab only");
const label = process.env.PERF_LABEL || "sample";
if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Invalid label");
const repeats = Number(process.env.PERF_RUNS || 1);
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 5) throw new Error("PERF_RUNS: 1–5");
const paths = ["/", ...["auto", "beauty", "medical", "sports", "stay", "estimate"].map(id => "/demo/" + id)];
const profile = { viewport: {width:390,height:844}, deviceScaleFactor:2, cpuRate:4,
  latency:100, downloadThroughput:200*1024, uploadThroughput:100*1024 };
const browser = await chromium.launch();
const results = [];
try {
  // Warm server/optimizer caches separately; measured contexts still have no browser cache.
  for (const path of paths) {
    const warm = await browser.newPage({ viewport:profile.viewport, deviceScaleFactor:profile.deviceScaleFactor });
    await warm.goto(base+path,{waitUntil:"load",timeout:90000});
    await warm.evaluate(() => document.fonts.ready);
    await warm.close();
  }
  for (let run=1;run<=repeats;run++) for (const path of paths) {
    const context = await browser.newContext({viewport:profile.viewport, deviceScaleFactor:profile.deviceScaleFactor, isMobile:true, hasTouch:true});
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const resources = new Map(), failures = [], pageErrors = [];
    cdp.on("Network.responseReceived", e => resources.set(e.requestId,{url:e.response.url,type:e.type,status:e.response.status,bytes:0,cache:Object.entries(e.response.headers).find(([key])=>key.toLowerCase()==="x-nextjs-cache")?.[1]||null}));
    cdp.on("Network.loadingFinished", e => {const r=resources.get(e.requestId);if(r)r.bytes=e.encodedDataLength;});
    cdp.on("Network.loadingFailed", e => failures.push({type:e.type,error:e.errorText,canceled:Boolean(e.canceled)}));
    page.on("pageerror", e => pageErrors.push(e.message));
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled",{cacheDisabled:true});
    await cdp.send("Network.emulateNetworkConditionsByRule",{offline:false,matchedNetworkConditions:[{urlPattern:"",latency:profile.latency,downloadThroughput:profile.downloadThroughput,uploadThroughput:profile.uploadThroughput,connectionType:"cellular4g"}]});
    await cdp.send("Network.overrideNetworkState",{offline:false,latency:profile.latency,downloadThroughput:profile.downloadThroughput,uploadThroughput:profile.uploadThroughput,connectionType:"cellular4g"});
    await cdp.send("Emulation.setCPUThrottlingRate",{rate:profile.cpuRate});
    await page.addInitScript(() => {
      const m={lcp:0,lcpElement:"",cls:0}; window.__demoMetrics=m;
      new PerformanceObserver(list=>{for(const e of list.getEntries()){m.lcp=e.startTime;m.lcpElement=e.element?.tagName||"";}}).observe({type:"largest-contentful-paint",buffered:true});
      let start=0,last=0,value=0;
      new PerformanceObserver(list=>{for(const e of list.getEntries()){if(e.hadRecentInput)continue;if(e.startTime-last>1000||e.startTime-start>5000){start=e.startTime;value=0;}last=e.startTime;value+=e.value;m.cls=Math.max(m.cls,value);}}).observe({type:"layout-shift",buffered:true});
    });
    const response = await page.goto(base+path,{waitUntil:"load",timeout:90000});
    await page.evaluate(() => document.fonts.ready);
    // Motion settles before sampling. No scrolling/input which would end LCP collection.
    await page.waitForTimeout(2500);
    const metrics = await page.evaluate(() => ({
      ...window.__demoMetrics, fcp:performance.getEntriesByName("first-contentful-paint")[0]?.startTime||0,
      fonts:document.fonts.status, fontErrors:[...document.fonts].filter(f=>f.status==="error").map(f=>f.family+" "+f.weight), overflow:document.documentElement.scrollWidth>innerWidth,
      images:[...document.images].filter(i=>i.getBoundingClientRect().top<innerHeight).map(i=>({src:i.currentSrc.replace(location.origin,""),width:i.clientWidth,naturalWidth:i.naturalWidth,loaded:i.complete&&i.naturalWidth>0}))
    }));
    const list=[...resources.values()].filter(r=>r.url.startsWith(base)).map(r=>({...r,url:r.url.slice(base.length)}));
    const byType={};for(const r of list)byType[r.type]=(byType[r.type]||0)+r.bytes;
    const result={path,run,status:response.status(),...metrics,bytes:list.reduce((n,r)=>n+r.bytes,0),byType,failures,pageErrors,resources:list};
    results.push(result);
    console.log(JSON.stringify({path,run,lcp:Math.round(metrics.lcp),fcp:Math.round(metrics.fcp),cls:metrics.cls,KiB:Math.round(result.bytes/1024),fontKiB:Math.round((byType.Font||0)/1024),imageKiB:Math.round((byType.Image||0)/1024),overflow:metrics.overflow}));
    await context.close();
  }
} finally { await browser.close(); }
const folder="work/portfolio/presentation-polish";
await mkdir(folder,{recursive:true});
const report={kind:"local-production-lab",base,label,buildId:(await readFile(".next/BUILD_ID","utf8")).trim(),commit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),worktreeDirty:Boolean(execFileSync("git",["status","--porcelain"],{encoding:"utf8"}).trim()),at:new Date().toISOString(),profile,repeats,cache:"Browser disabled; server resources warmed separately",results};
if (process.env.PERF_COMPARE_LABEL) {
  const previousLabel=process.env.PERF_COMPARE_LABEL;
  if (!/^[a-z0-9-]+$/.test(previousLabel) || previousLabel===label) throw new Error("Invalid baseline label");
  const previous=JSON.parse(await readFile(folder+"/"+previousLabel+".json","utf8"));
  if (JSON.stringify(previous.profile)!==JSON.stringify(profile)) throw new Error("Lab profiles must match");
  report.comparison=paths.map(path=>{
    const median=values=>{const sorted=[...values].sort((a,b)=>a-b);const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;};
    const old=previous.results.filter(r=>r.path===path), current=results.filter(r=>r.path===path);
    if (!old.length) throw new Error("Baseline route missing: "+path);
    const before=median(old.map(r=>r.byType.Font||0)), after=median(current.map(r=>r.byType.Font||0));
    if (before<=0 || after<=0) throw new Error("Missing font transfer: "+path);
    return {path,beforeFontBytes:before,afterFontBytes:after,fontReduction:1-after/before,fontBudgetPassed:after<=before*0.75};
  });
  if (report.comparison.some(r=>!r.fontBudgetPassed)) process.exitCode=1;
}
await writeFile(folder+"/"+label+".json",JSON.stringify(report,null,2)+"\n");
if(results.some(r=>r.status!==200||r.overflow||r.pageErrors.length||r.fontErrors.length||r.images.some(i=>!i.loaded)||r.resources.some(x=>x.status>=400)||r.failures.some(f=>!f.canceled))) process.exitCode=1;
