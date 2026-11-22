import type { SiteConfig } from "@/shared/contracts";
type Query=Record<string,string|string[]|undefined>;
export function resolveBookingContext(config:SiteConfig,query:Query):{ok:true;serviceId?:string;resourceId?:string;startAtPreference:boolean}|{ok:false} {
 const {service,resource}=query;
 if(service===undefined)return resource===undefined?{ok:true,startAtPreference:false}:{ok:false};
 if(typeof service!=="string"||!service)return {ok:false};
 const selected=config.services.find(item=>item.id===service);
 if(!selected)return {ok:false};
 if(resource!==undefined&&(typeof resource!=="string"||!selected.resourceIds.includes(resource)||!config.resources.some(item=>item.id===resource)))return {ok:false};
 return {ok:true,serviceId:service,...(resource?{resourceId:resource}:{}),startAtPreference:true};
}
export function resolveCalculatorContext(query:Query):{ok:true;product?:"window"|"balcony-door"}|{ok:false} {
 if(query.product===undefined)return {ok:true};
 return query.product==="window"||query.product==="balcony-door"?{ok:true,product:query.product}:{ok:false};
}
