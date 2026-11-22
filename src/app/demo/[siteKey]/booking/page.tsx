import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteConfig } from "@/config/sites";
import { getPrototype } from "@/features/prototypes/catalog";
import { getDemoPage } from "@/features/prototypes/pages";
import { resolveBookingContext } from "@/features/prototypes/context";
import { DemoBooking, type DemoQuery } from "@/features/prototypes/DemoPages";

export const dynamic="force-dynamic";
interface Props {params:Promise<{siteKey:string}>;searchParams:Promise<DemoQuery>}
export async function generateMetadata({params}:Props):Promise<Metadata>{
 const {siteKey}=await params;const p=getPrototype(siteKey);
 return {title:p?"Заявка · "+p.brand:"Сайт не найден",robots:{index:false,follow:false}};
}
export default async function BookingPage({params,searchParams}:Props){
 const {siteKey}=await params;const p=getPrototype(siteKey);
 if(!p||p.id==="estimate")notFound();
 const config=getSiteConfig(p.id);const page=getDemoPage(p.id,"booking");
 if(!config||!page)notFound();
 const context=resolveBookingContext(config,await searchParams);
 if(!context.ok)notFound();
 return <DemoBooking id={p.id} page={page} context={context}/>;
}
