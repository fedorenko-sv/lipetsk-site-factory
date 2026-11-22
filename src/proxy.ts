import {NextResponse, type NextRequest} from "next/server";
import {decideDemoRoute,parseDemoDeployment} from "./server/config/demo-deployment";
import {resolveBrandSelection} from "./brands/select";

export function proxy(request:NextRequest) {
  const mode=parseDemoDeployment(process.env.DEMO_SITE_KEY);
  // An unknown brand, or one that belongs to another profile, disables pages like an invalid profile does.
  const brandInvalid=resolveBrandSelection(process.env.DEMO_BRAND_KEY,mode).kind==="invalid";
  const decision=decideDemoRoute(brandInvalid?{kind:"invalid"}:mode,request.nextUrl.pathname);
  if(decision.action==="next")return NextResponse.next();
  const headers={"X-Robots-Tag":"noindex, nofollow","Cache-Control":"no-store"};
  if(decision.action==="redirect"){
    const url=request.nextUrl.clone();
    url.pathname=decision.to;
    const response=NextResponse.redirect(url,307);
    for(const [key,value] of Object.entries(headers))response.headers.set(key,value);
    return response;
  }
  return new NextResponse(
    decision.action==="unavailable"?"Демо временно недоступно.":"Страница не найдена.",
    {status:decision.action==="unavailable"?503:404,headers:{...headers,"Content-Type":"text/plain; charset=utf-8"}},
  );
}
// API bodies and their limits/authentication stay entirely in the existing handlers.
export const config={matcher:"/((?!api|_next/static|_next/image|demo-assets/|favicon.ico).*)"};
