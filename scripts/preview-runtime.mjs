import {Client} from "pg";
import {randomBytes} from "node:crypto";
import {assertSafeTestDatabaseUrl} from "../src/server/config/guards.ts";
import {demoProfiles,parseDemoDeployment} from "../src/server/config/demo-deployment.ts";

const fixture="postgresql://lsf_test:lsf_test_only@127.0.0.1:55543/lsf_test_backend";
export function previewSettings({port,siteKey,brandKey="",instanceId="",postgresUrl=process.env.TEST_DATABASE_URL||fixture}) {
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error("Preview port must be 1024–65535");
  const mode=parseDemoDeployment(siteKey);
  if(mode.kind==="invalid")throw new Error("Unknown demo profile");
  if(brandKey && (typeof brandKey!=="string" || !/^[a-z][a-z0-9-]{1,30}$/.test(brandKey)))throw new Error("Invalid brand key");
  if(instanceId && !/^[a-f0-9]{8,16}$/.test(instanceId))throw new Error("Invalid preview instance");
  const base="http://127.0.0.1:"+port;
  const baseDsn=assertSafeTestDatabaseUrl(postgresUrl);
  const siteKeys=mode.kind==="single"?[...mode.profile.siteKeys]:demoProfiles.flatMap(p=>[...p.siteKeys]);
  const database=(mode.kind==="single"?"lsf_test_demo_"+mode.profile.key+"_"+port:"lsf_test_detailing_preview_"+port)+(instanceId?"_"+instanceId:"");
  const target=new URL(baseDsn);target.pathname="/"+database;
  const dsn=assertSafeTestDatabaseUrl(target.toString());
  const secret=()=>randomBytes(24).toString("hex");
  const env={...process.env,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1",
    DEMO_SITE_KEY:mode.kind==="single"?mode.profile.key:"",
    // Never inherit a brand from the operator shell: only the explicit --brand flag selects one.
    DEMO_BRAND_KEY:brandKey,
    DATABASE_URL:dsn,TEST_DATABASE_URL:dsn,ALLOWED_ORIGINS:base,ALLOWED_SITE_KEYS:siteKeys.join(","),
    ENABLE_LIVE_LEADS:"false",IDEMPOTENCY_HMAC_KEY:secret(),RATE_LIMIT_HMAC_KEY:secret(),OUTBOX_SECRET:secret(),
    SITE_DESTINATIONS_JSON:JSON.stringify(Object.fromEntries(siteKeys.map(key=>[key,{destinationKey:"demo-"+key+"-v1",version:1}]))),
    NOTIFICATION_DESTINATIONS_JSON:JSON.stringify(Object.fromEntries(siteKeys.map(key=>["demo-"+key+"-v1",{adapterId:"recording"}]))),
  };
  const folder=mode.kind==="single"?"work/demos":"work/detailing";
  return {port,mode,brandKey,base,baseDsn,database,dsn,siteKeys,env,folder,stateFile:folder+"/preview-"+port+"-state.json"};
}
export async function provisionPreviewDatabase(settings) {
  if(!/^lsf_test_[a-z0-9_]+$/.test(settings.database)||settings.database.length>63)throw new Error("Unsafe preview database");
  const admin=new Client({connectionString:settings.baseDsn});
  await admin.connect();
  try {
    const found=await admin.query("SELECT 1 FROM pg_database WHERE datname=$1",[settings.database]);
    if(!found.rowCount)await admin.query('CREATE DATABASE "'+settings.database+'"');
  }finally{await admin.end();}
}
