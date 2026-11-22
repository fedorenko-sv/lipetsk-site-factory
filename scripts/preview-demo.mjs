import {parseDemoPreviewArgs} from "./demo-preview-options.mjs";
import {demoProfiles} from "../src/server/config/demo-deployment.ts";
import {startPreview,holdPreview} from "./preview-runner.mjs";

let options;
try{options=parseDemoPreviewArgs(process.argv.slice(2));}
catch(error){console.error(error.message);process.exitCode=1;}
if(options?.list) {
  for(const profile of demoProfiles)console.log(profile.key.padEnd(9)+" http://127.0.0.1:"+profile.port+"  npm run preview:demo -- "+profile.key);
}else if(options){
  try{await holdPreview(await startPreview(options));}
  catch{console.error("Preview did not start. Check the production build, free port and local test PostgreSQL.");process.exitCode=1;}
}
