// Operator diagnostics for client brands: schema, contrast, local files, shell compatibility.
// Usage: npm run check:brands [-- <key>]   (exit 1 with a readable list on any problem)
import {existsSync,statSync,readdirSync,readFileSync} from "node:fs";
import path from "node:path";
import {validateBrand,contrast,contrastPairs} from "../src/brands/validate.ts";
import {defaultBrandKeys} from "../src/brands/registry.ts";

const dir="src/brands/configs";
const only=process.argv[2];
const files=readdirSync(dir).filter(f=>f.endsWith(".json")&&(!only||f===only+".json"));
if(only&&!files.length){console.error("No config "+dir+"/"+only+".json");process.exit(1);}
const registry=readFileSync("src/brands/registry.ts","utf8");
let failed=false;
for(const file of files){
  const problems=[];
  let raw;
  try{raw=JSON.parse(readFileSync(path.join(dir,file),"utf8"));}catch(e){console.log("✗ "+file+"\n   JSON: "+e.message);failed=true;continue;}
  const result=validateBrand(raw);
  if(!result.ok)for(const i of result.issues)problems.push(i.path+": "+i.message);
  if(raw.key&&file!==raw.key+".json")problems.push("file name must be "+raw.key+".json");
  if(raw.key&&!registry.includes(`./configs/${raw.key}.json`))problems.push("not registered in src/brands/registry.ts (import + sources)");
  const assets=[raw.logo?.onLight,raw.logo?.onDark,raw.media?.hero].filter(Boolean);
  for(const a of assets){
    if(typeof a.path!=="string")continue;
    const local=path.join("public",a.path);
    if(!existsSync(local))problems.push("missing file "+local);
    else if(statSync(local).size>600_000)problems.push(local+" is larger than 600 KB");
    else if(local.endsWith(".svg")&&/<script|on\w+=|href=["']?(https?:|javascript:)/i.test(readFileSync(local,"utf8")))problems.push(local+" contains scripts or external links");
  }
  if(problems.length){failed=true;console.log("✗ "+file);for(const p of problems)console.log("   "+p);continue;}
  const b=result.brand;
  const isDefault=defaultBrandKeys[b.shell]===b.key;
  console.log("✓ "+b.key+" "+b.version+" · shell "+b.shell+(isDefault?" (default)":"")+" · "+b.name.short+" / "+b.name.full);
  if(b.palette)console.log("   contrast "+contrastPairs.map(([f,g])=>f+"/"+g+" "+contrast(b.palette[f],b.palette[g]).toFixed(1)).join(", "));
  console.log("   logo "+(b.logo?Object.keys(b.logo).join("+"):"text fallback")+" · type "+(b.typography?b.typography.display.family+"/"+b.typography.body.family:"shell preset")+" · preview: npm run preview:demo -- "+(b.shell==="auto"?"auto":b.shell)+" --brand "+b.key);
}
process.exit(failed?1:0);
