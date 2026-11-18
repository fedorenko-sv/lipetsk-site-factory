import {spawn,spawnSync} from "node:child_process";
import {existsSync,mkdirSync,createWriteStream,writeFileSync} from "node:fs";
import net from "node:net";
import {once} from "node:events";
import path from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {previewSettings,provisionPreviewDatabase} from "./preview-runtime.mjs";

export async function assertPreviewPortFree(port) {
  const probe=net.createServer();
  await new Promise((resolve,reject)=>{probe.once("error",()=>reject(new Error("Preview port is occupied")));probe.listen(port,"127.0.0.1",resolve);});
  await new Promise((resolve,reject)=>probe.close(error=>error?reject(error):resolve()));
}
export async function startPreview(options) {
  const settings=previewSettings(options);
  if(!existsSync(".next/BUILD_ID"))throw new Error("Build the project before preview");
  await assertPreviewPortFree(settings.port);
  await provisionPreviewDatabase(settings);
  const migration=spawnSync(process.execPath,["--experimental-strip-types","scripts/backend/migrate.ts"],{
    env:{...settings.env,LSF_MIGRATE_TEST_MODE:"1"},stdio:"ignore",
  });
  if(migration.status!==0)throw new Error("Preview migration failed");
  mkdirSync(settings.folder,{recursive:true});
  const log=createWriteStream(settings.folder+"/preview-"+settings.port+"-app.log",{flags:"a"});
  const child=spawn(process.execPath,[path.join(process.cwd(),"node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(settings.port)],{
    env:settings.env,stdio:["ignore","pipe","pipe"],
  });
  child.stdout.pipe(log);child.stderr.pipe(log);
  const closed=once(child,"exit").then(([code])=>code);
  let timer,dispatching=false,stopping;
  const dispatch=async()=>{
    if(dispatching)return;
    dispatching=true;
    try {
      await fetch(settings.base+"/api/internal/outbox",{method:"POST",headers:{Authorization:"Bearer "+settings.env.OUTBOX_SECRET},signal:AbortSignal.timeout(15000)});
    }finally{dispatching=false;}
  };
  const stop=()=>stopping??=(async()=>{
    clearInterval(timer);
    if(child.exitCode===null && child.signalCode===null){
      if(process.platform==="win32")spawnSync("taskkill",["/pid",String(child.pid),"/T","/F"],{stdio:"ignore"});
      else child.kill("SIGTERM");
    }
    await closed;
  })();
  closed.then(()=>{clearInterval(timer);log.end();});
  try {
    let ready=false;
    for(let i=0;i<100;i++){
      if(child.exitCode!==null)break;
      try{if((await fetch(settings.base,{signal:AbortSignal.timeout(1500)})).ok){ready=true;break;}}catch{}
      await delay(200);
    }
    if(!ready)throw new Error("Preview server did not start");
    const state={helperPid:process.pid,appPid:child.pid,baseUrl:settings.base,database:settings.database,
      profile:settings.mode.kind==="single"?settings.mode.profile.key:"factory",startedAt:new Date().toISOString()};
    writeFileSync(settings.stateFile,JSON.stringify(state,null,2)+"\n");
    timer=setInterval(()=>void dispatch().catch(()=>{}),15000);
    console.log("Local synthetic "+state.profile+" preview ready on "+settings.base);
    return {base:settings.base,database:settings.database,dsn:settings.dsn,stateFile:settings.stateFile,siteKeys:settings.siteKeys,dispatch,stop,closed};
  }catch(error){await stop();throw error;}
}
export async function holdPreview(instance) {
  let requested=false;
  const stop=()=>{requested=true;void instance.stop();};
  process.once("SIGINT",stop);process.once("SIGTERM",stop);
  try {
    const code=await instance.closed;
    if(!requested && code!==0)process.exitCode=1;
  }finally{process.removeListener("SIGINT",stop);process.removeListener("SIGTERM",stop);}
}
