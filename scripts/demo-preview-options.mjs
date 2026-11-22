import {parseDemoDeployment,demoProfiles} from "../src/server/config/demo-deployment.ts";
import {resolveBrandSelection} from "../src/brands/select.ts";
import {listBrands} from "../src/brands/registry.ts";

export function parseDemoPreviewArgs(args) {
  if(args.length===1 && args[0]==="--list")return {list:true};
  const mode=parseDemoDeployment(args[0]);
  if(mode.kind!=="single")throw new Error("Unknown demo. Choose: "+demoProfiles.map(p=>p.key).join(", "));
  const flags=new Map();
  for(let i=1;i<args.length;i+=2){
    if(!["--port","--brand"].includes(args[i]) || args[i+1]===undefined || flags.has(args[i]))throw new Error("Use <demo> [--port <1024-65535>] [--brand <key>] or --list");
    flags.set(args[i],args[i+1]);
  }
  const raw=flags.get("--port")??String(mode.profile.port);
  if(!/^\d{4,5}$/.test(raw) || Number(raw)<1024 || Number(raw)>65535)throw new Error("Port must be 1024–65535");
  const brandKey=flags.get("--brand");
  if(brandKey!==undefined){
    const selection=resolveBrandSelection(brandKey,mode);
    if(selection.kind!=="brand")throw new Error(selection.kind==="invalid"&&selection.reason==="incompatible"
      ?"Brand "+brandKey+" belongs to another shell. Brands for "+mode.profile.key+": "+listBrands().filter(b=>(mode.profile.siteKeys).includes(b.shell)).map(b=>b.key).join(", ")
      :"Unknown brand "+brandKey+". Registered: "+listBrands().map(b=>b.key).join(", "));
  }
  return {siteKey:mode.profile.key,port:Number(raw),...(brandKey?{brandKey}:{})};
}
