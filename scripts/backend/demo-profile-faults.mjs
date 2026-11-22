import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {once} from "node:events";
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";

export async function checkMisconfiguredProfiles(freePort) {
  const results=[];
  for(const fault of [{key:"constructor",scope:"beauty",root:503},{key:"beauty",scope:"beauty,auto",root:307}]){
    const port=await freePort(),base="http://127.0.0.1:"+port;
    const child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{
      stdio:"ignore",env:{...process.env,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1",
        DEMO_SITE_KEY:fault.key,ALLOWED_SITE_KEYS:fault.scope,ALLOWED_ORIGINS:base,
        DATABASE_URL:"postgresql://fixture@127.0.0.1:1/lsf_test_unreachable",
        IDEMPOTENCY_HMAC_KEY:"i".repeat(40),RATE_LIMIT_HMAC_KEY:"r".repeat(40),OUTBOX_SECRET:"o".repeat(40),
      },
    });
    const closed=once(child,"exit");
    try {
      let root;
      for(let i=0;i<100;i++){
        try{root=await fetch(base,{redirect:"manual",signal:AbortSignal.timeout(1000)});break;}catch{}
        if(child.exitCode!==null)break;
        await delay(150);
      }
      assert.ok(root,"Fault probe must start");assert.equal(root.status,fault.root);
      assert.match(root.headers.get("x-robots-tag"),/noindex/);
      assert.equal(root.headers.get("cache-control"),"no-store");
      const response=await fetch(base+"/api/leads",{method:"POST",headers:{Origin:base,"Content-Type":"application/json","Idempotency-Key":randomUUID()},body:"{}"});
      assert.equal(response.status,503);assert.equal((await response.json()).error.code,"DEMO_NOT_READY");
      results.push({mode:fault.key,scope:fault.scope,root:root.status,api:503,error:"DEMO_NOT_READY"});
    }finally {
      if(child.exitCode===null && child.signalCode===null){
        if(process.platform==="win32")spawnSync("taskkill",["/pid",String(child.pid),"/T","/F"],{stdio:"ignore"});
        else child.kill("SIGTERM");
      }
      await closed;
    }
  }
  return results;
}
