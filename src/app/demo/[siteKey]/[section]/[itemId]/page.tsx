import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteConfig } from "@/config/sites";
import { getPrototype, prototypes } from "@/features/prototypes/catalog";
import { catalogPage } from "@/features/prototypes/pages";
import { getOfferStory } from "@/features/prototypes/offer-stories";
import { DemoService, DemoWindow } from "@/features/prototypes/DemoPages";
import { brandMetadata } from "@/brands/metadata";

interface Props {params:Promise<{siteKey:string;section:string;itemId:string}>}
export function generateStaticParams() {
 return prototypes.flatMap<{siteKey:string;section:string;itemId:string}>(p=>{
  const section=catalogPage(p.id).slug;
  return p.id==="estimate"?["window","balcony-door"].map(itemId=>({siteKey:p.id,section,itemId})):getSiteConfig(p.id)!.services.map(s=>({siteKey:p.id,section,itemId:s.id}));
 });
}
export async function generateMetadata({params}:Props):Promise<Metadata> {
 const {siteKey,itemId}=await params;const p=getPrototype(siteKey);
 const service=p&&p.id!=="estimate"?getSiteConfig(p.id)?.services.find(s=>s.id===itemId):null;
 const title=p?.id==="estimate"?(itemId==="window"?"Окно":itemId==="balcony-door"?"Балконная дверь":"Страница не найдена"):service?.name??"Страница не найдена";
 return p?brandMetadata(p.id,title):{title,robots:{index:false,follow:false}};
}
export default async function DemoOffer({params}:Props) {
 const {siteKey,section,itemId}=await params;const p=getPrototype(siteKey);
 if(!p||section!==catalogPage(p.id).slug)notFound();
 if(p.id==="estimate"){
  if(itemId!=="window"&&itemId!=="balcony-door")notFound();
  return <DemoWindow product={itemId}/>;
 }
 const config=getSiteConfig(p.id);if(!config)notFound();
 const service=config.services.find(s=>s.id===itemId);
 if(!service||!getOfferStory(p.id,itemId))notFound();
 return <DemoService id={p.id} service={service} config={config}/>;
}
