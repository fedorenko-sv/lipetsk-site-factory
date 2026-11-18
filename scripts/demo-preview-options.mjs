import {parseDemoDeployment,demoProfiles} from "../src/server/config/demo-deployment.ts";

export function parseDemoPreviewArgs(args) {
  if(args.length===1 && args[0]==="--list")return {list:true};
  const mode=parseDemoDeployment(args[0]);
  if(mode.kind!=="single")throw new Error("Unknown demo. Choose: "+demoProfiles.map(p=>p.key).join(", "));
  if(args.length!==1 && !(args.length===3 && args[1]==="--port"))throw new Error("Use <demo> [--port <1024-65535>] or --list");
  const raw=args.length===3?args[2]:String(mode.profile.port);
  if(!/^\d{4,5}$/.test(raw) || Number(raw)<1024 || Number(raw)>65535)throw new Error("Port must be 1024–65535");
  return {siteKey:mode.profile.key,port:Number(raw)};
}
