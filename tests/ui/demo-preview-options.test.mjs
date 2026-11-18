import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {parseDemoPreviewArgs} from "../../scripts/demo-preview-options.mjs";
test("DO01: six profile ports and an explicit override are deterministic",()=>{
  for(const [i,key] of ["auto","beauty","medical","sports","stay","estimate"].entries())
    assert.deepEqual(parseDemoPreviewArgs([key]),{siteKey:key,port:3041+i});
  assert.deepEqual(parseDemoPreviewArgs(["beauty","--port","3102"]),{siteKey:"beauty",port:3102});
  assert.deepEqual(parseDemoPreviewArgs(["--list"]),{list:true});
});
test("DO02: malformed profile/port/extra flags are rejected",()=>{
  for(const argv of [[],["constructor"],[""],["beauty","--port","80"],["beauty","--port","3042x"],["beauty","--port","65536"],["beauty","--port","3042","--port","3043"],["beauty","--unknown"]])
    assert.throws(()=>parseDemoPreviewArgs(argv));
});
test("DO03: CLI rejects bad input without trying inherited storage or creating a child",()=>{
  const r=spawnSync(process.execPath,["--experimental-strip-types","scripts/preview-demo.mjs","constructor"],{encoding:"utf8",timeout:5000,env:{...process.env,TEST_DATABASE_URL:"postgresql://never-contact.invalid/production"}});
  assert.equal(r.status,1);assert.match(r.stderr,/Unknown demo|unknown demo/);assert.doesNotMatch(r.stderr,/never-contact|postgresql:|password|ECONN/);
});

test("DO04: runtime settings isolate storage, origins, recording targets and disable live",async()=>{
  const {previewSettings}=await import("../../scripts/preview-runtime.mjs");
  const a=previewSettings({siteKey:"beauty",port:3042,postgresUrl:"postgresql://fixture@127.0.0.1:5432/lsf_test_fixture"});
  const b=previewSettings({siteKey:"stay",port:3045,postgresUrl:"postgresql://fixture@127.0.0.1:5432/lsf_test_fixture"});
  assert.notEqual(a.database,b.database);
  assert.equal(a.env.ALLOWED_ORIGINS,a.base);assert.equal(a.env.ALLOWED_SITE_KEYS,"beauty");
  assert.equal(a.env.DEMO_SITE_KEY,"beauty");assert.equal(a.env.ENABLE_LIVE_LEADS,"false");
  assert.deepEqual(Object.keys(JSON.parse(a.env.SITE_DESTINATIONS_JSON)),["beauty"]);
  assert.deepEqual(Object.keys(JSON.parse(a.env.NOTIFICATION_DESTINATIONS_JSON)),["demo-beauty-v1"]);
  for(const options of [{siteKey:"wrong",port:3042},{siteKey:"beauty",port:80},{siteKey:"beauty",port:3042,instanceId:"../x"},{siteKey:"beauty",port:3042,postgresUrl:"postgresql://remote.invalid/lsf_test_fixture"}])
    assert.throws(()=>previewSettings(options));
});
test("DO05: occupied local ports are refused rather than taking over a process",async()=>{
  const net=await import("node:net");
  const {assertPreviewPortFree}=await import("../../scripts/preview-runner.mjs");
  const server=net.createServer();
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{await assert.rejects(()=>assertPreviewPortFree(server.address().port),/occupied/);}
  finally{await new Promise(resolve=>server.close(resolve));}
});
