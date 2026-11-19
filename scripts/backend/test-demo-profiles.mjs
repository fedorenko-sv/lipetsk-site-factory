import assert from "node:assert/strict";
import {Client} from "pg";
import {chromium} from "@playwright/test";
import {randomBytes} from "node:crypto";
import net from "node:net";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {demoProfiles} from "../../src/server/config/demo-deployment.ts";
import {assertSafeTestDatabaseUrl} from "../../src/server/config/guards.ts";
import {previewSettings} from "../preview-runtime.mjs";
import {startPreview,assertPreviewPortFree} from "../preview-runner.mjs";
import {checkProfilePages,checkProfileRequests} from "./demo-profile-acceptance.mjs";
import {checkMisconfiguredProfiles} from "./demo-profile-faults.mjs";

const postgresUrl=assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL||"postgresql://lsf_test:lsf_test_only@127.0.0.1:55543/lsf_test_backend");
const runId=randomBytes(6).toString("hex");
const folder="work/portfolio/isolated-profiles";
await mkdir(folder,{recursive:true});
const admin=new Client({connectionString:postgresUrl});
await admin.connect();
const browser=await chromium.launch();
const results=[],owned=[];
let faults=[];
async function freePort(){
  const server=net.createServer();
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}
try {
  for(const profile of demoProfiles){
    const port=await freePort();
    const options={siteKey:profile.key,port,instanceId:runId,postgresUrl};
    const settings=previewSettings(options);
    assert.equal((await admin.query("SELECT 1 FROM pg_database WHERE datname=$1",[settings.database])).rowCount,0,"Never reuse somebody else's database");
    owned.push(settings.database);
    let instance,db,context;
    try {
      instance=await startPreview(options);
      db=new Client({connectionString:assertSafeTestDatabaseUrl(instance.dsn)});
      await db.connect();
      assert.equal((await db.query("SELECT current_database() AS name")).rows[0].name,settings.database);
      const routeResults=await checkProfilePages(instance,profile);
      context=await browser.newContext({viewport:{width:1280,height:960},reducedMotion:"reduce"});
      const page=await context.newPage();
      const pageErrors=[];page.on("pageerror",error=>pageErrors.push(error.name));
      const requestResults=await checkProfileRequests(instance,profile,page,db,folder);
      assert.deepEqual(pageErrors,[]);
      results.push({profile:profile.key,base:instance.base,database:instance.database,...routeResults,...requestResults});
      console.log(profile.key+": own pages, foreign route/API denial, genuine submission, replay and recording PASS");
    }finally {
      await context?.close();
      await db?.end();
      await instance?.stop();
      await assertPreviewPortFree(port);
    }
  }
  faults=await checkMisconfiguredProfiles(freePort);
}finally {
  await browser.close();
  for(const name of owned){
    if(!/^lsf_test_demo_[a-z]+_\d+_[a-f0-9]{12}$/.test(name)||!name.endsWith("_"+runId))throw new Error("Refuse cleanup outside this run");
    await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()",[name]);
    await admin.query('DROP DATABASE IF EXISTS "'+name+'"');
  }
  await admin.end();
}
await writeFile(folder+"/results.json",JSON.stringify({runId,at:new Date().toISOString(),build:"single production build",buildId:(await readFile(".next/BUILD_ID","utf8")).trim(),mocked:false,results,faults,cleanup:"Only newly created databases owned by this run"},null,2)+"\n");
assert.equal(results.length,6);assert.equal(faults.length,2);
console.log("Six isolated profiles + two invalid-configuration probes PASS; six private test databases removed; no skipped scenarios.");
