import {port} from "./detailing-preview-address.mjs";
import {startPreview,holdPreview} from "./preview-runner.mjs";

try{await holdPreview(await startPreview({port}));}
catch{console.error("Preview did not start. Check the production build, free port and local test PostgreSQL.");process.exitCode=1;}
