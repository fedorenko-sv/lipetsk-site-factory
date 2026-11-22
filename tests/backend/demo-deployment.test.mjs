import test from "node:test";
import assert from "node:assert/strict";
import {loadRuntimeConfig,ConfigProblem} from "../../src/server/config/runtime.ts";

const env = (extra = {}) => ({
  ALLOWED_SITE_KEYS:"beauty", ALLOWED_ORIGINS:"http://127.0.0.1:3042",
  DATABASE_URL:"postgresql://fixture/lsf_test_fixture",
  IDEMPOTENCY_HMAC_KEY:"i".repeat(40), RATE_LIMIT_HMAC_KEY:"r".repeat(40), OUTBOX_SECRET:"o".repeat(40),
  ...extra,
});
test("DP01: a single Beauty deployment refuses a foreign site in its API allowlist", () => {
  assert.throws(() => loadRuntimeConfig(env({DEMO_SITE_KEY:"beauty",ALLOWED_SITE_KEYS:"beauty,auto"})),ConfigProblem);
});
test("DP02: invalid deployment mode fails closed instead of opening the factory", () => {
  assert.throws(() => loadRuntimeConfig(env({DEMO_SITE_KEY:"constructor"})),ConfigProblem);
});
test("DP03: selected Beauty and existing factory preserve their allowed scopes", () => {
  assert.deepEqual(loadRuntimeConfig(env({DEMO_SITE_KEY:"beauty"})).allowedSiteKeys,["beauty"]);
  assert.deepEqual(loadRuntimeConfig(env({ALLOWED_SITE_KEYS:"beauty,auto"})).allowedSiteKeys,["beauty","auto"]);
});

test("DP04: Auto contains OBLIK; incomplete, repeated and excessive scopes fail", () => {
  assert.deepEqual(loadRuntimeConfig(env({DEMO_SITE_KEY:"auto",ALLOWED_SITE_KEYS:"auto,detailing"})).allowedSiteKeys,["auto","detailing"]);
  for(const list of ["auto","auto,auto","auto,detailing,beauty"])
    assert.throws(()=>loadRuntimeConfig(env({DEMO_SITE_KEY:"auto",ALLOWED_SITE_KEYS:list})),ConfigProblem);
});
test("DP05: typo, whitespace, multiple and prototype modes never fall back", () => {
  for(const key of [" ","Beauty","beauty,auto","__proto__","constructor","toString"])
    assert.throws(()=>loadRuntimeConfig(env({DEMO_SITE_KEY:key})),ConfigProblem);
  assert.equal(loadRuntimeConfig(env({DEMO_SITE_KEY:""})).allowedSiteKeys[0],"beauty");
});

test("DP06: six modes have separate ports and exact visibility; factory stays broad",async()=>{
  const {demoProfiles,parseDemoDeployment,decideDemoRoute}=await import("../../src/server/config/demo-deployment.ts");
  assert.equal(new Set(demoProfiles.map(p=>p.port)).size,6);
  for(const p of demoProfiles){
    const mode=parseDemoDeployment(p.key);
    assert.deepEqual(decideDemoRoute(mode,"/"),{action:"redirect",to:"/demo/"+p.key});
    for(const key of ["auto","beauty","medical","sports","stay","estimate","detailing"]){
      const allowed=p.siteKeys.includes(key);
      for(const suffix of ["","/privacy","/booking"])
        assert.equal(decideDemoRoute(mode,"/demo/"+key+suffix).action,allowed?"next":"not-found");
    }
  }
  assert.equal(decideDemoRoute(parseDemoDeployment(undefined),"/demo/anything").action,"next");
});
test("DP07: encoded, similar and traversal paths do not reveal a foreign demo",async()=>{
  const {parseDemoDeployment,decideDemoRoute}=await import("../../src/server/config/demo-deployment.ts");
  const mode=parseDemoDeployment("beauty");
  for(const path of ["/demo/auto","/demo/%61uto","/demo/beauty-other","/demo/beauty/../auto","/demo/beauty/%2e%2e/auto","/demo/%2562eauty","/demo/%"])
    assert.equal(decideDemoRoute(mode,path).action,"not-found",path);
  assert.equal(decideDemoRoute(mode,"/demo/%62eauty/services").action,"next");
});
test("DP08: invalid mode closes pages while API/static keep their handlers",async()=>{
  const {parseDemoDeployment,decideDemoRoute}=await import("../../src/server/config/demo-deployment.ts");
  const mode=parseDemoDeployment("typo");
  assert.equal(decideDemoRoute(mode,"/").action,"unavailable");
  assert.equal(decideDemoRoute(mode,"/demo/beauty").action,"unavailable");
  for(const path of ["/api/leads","/api/estimates","/api/internal/outbox","/_next/static/a.js","/demo-assets/detailing/fonts/font-2.woff2"])
    assert.equal(decideDemoRoute(mode,path).action,"next");
});
