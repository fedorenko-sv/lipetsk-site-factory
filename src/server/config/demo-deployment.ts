/** Runtime selection for the six public demo packages. No prices, secrets or database access. */
export const demoProfiles = [
  {key:"auto",port:3041,siteKeys:["auto","detailing"]},
  {key:"beauty",port:3042,siteKeys:["beauty"]},
  {key:"medical",port:3043,siteKeys:["medical"]},
  {key:"sports",port:3044,siteKeys:["sports"]},
  {key:"stay",port:3045,siteKeys:["stay"]},
  {key:"estimate",port:3046,siteKeys:["estimate"]},
] as const;
export type DemoProfile = typeof demoProfiles[number];
export type DemoSiteKey = DemoProfile["key"];
export type DemoDeployment = {kind:"factory"} | {kind:"single";profile:DemoProfile} | {kind:"invalid"};
export type DemoRouteDecision = {action:"next"|"not-found"|"unavailable"} | {action:"redirect";to:string};

export function parseDemoDeployment(value:unknown):DemoDeployment {
  if(value===undefined || value==="")return {kind:"factory"};
  const profile=typeof value==="string" ? demoProfiles.find(p=>p.key===value) : undefined;
  return profile ? {kind:"single",profile} : {kind:"invalid"};
}
export function deploymentScopeMatches(mode:DemoDeployment,siteKeys:readonly string[]):boolean {
  if(mode.kind==="factory")return true;
  if(mode.kind==="invalid")return false;
  const expected:readonly string[]=mode.profile.siteKeys;
  return expected.length===siteKeys.length && expected.every(key=>siteKeys.includes(key));
}
export function decideDemoRoute(mode:DemoDeployment,pathname:string):DemoRouteDecision {
  // These handlers retain their existing validation/authentication and public asset rules.
  if(pathname==="/api" || pathname.startsWith("/api/") || pathname.startsWith("/_next/") ||
    pathname.startsWith("/demo-assets/") || pathname==="/favicon.ico")return {action:"next"};
  if(mode.kind==="invalid")return {action:"unavailable"};
  if(mode.kind==="factory")return {action:"next"};
  if(pathname==="/")return {action:"redirect",to:"/demo/"+mode.profile.key};
  let decoded:string;
  try {decoded=decodeURIComponent(pathname);}catch{return {action:"not-found"};}
  if(decoded.includes("%") || decoded.includes("\\") || decoded.includes("\0") ||
    decoded.split("/").some(part=>part==="."||part===".."))return {action:"not-found"};
  const visible=mode.profile.siteKeys.some(key=>decoded==="/demo/"+key || decoded.startsWith("/demo/"+key+"/"));
  return {action:visible?"next":"not-found"};
}
