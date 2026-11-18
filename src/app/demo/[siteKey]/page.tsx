import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteConfig, getAllSiteKeys } from "@/config/sites";
import { getPrototype } from "@/features/prototypes/catalog";
import { PrototypeLanding } from "@/features/prototypes/PrototypeLanding";
import { EstimateLanding } from "@/features/estimate/EstimateLanding";

interface Props { params: Promise<{ siteKey: string }> }
export function generateStaticParams() { return [...getAllSiteKeys(),"estimate"].map(siteKey=>({siteKey})); }
export async function generateMetadata({params}:Props):Promise<Metadata> {
  const {siteKey}=await params;
  const prototype=getPrototype(siteKey);
  return { title: prototype ? prototype.brand+" — "+prototype.name : "Сайт не найден",
    description:prototype?.summary, robots:{index:false,follow:false} };
}
export default async function DemoSitePage({params}:Props) {
  const {siteKey}=await params;
  if(siteKey==="estimate")return <EstimateLanding/>;
  const config=getSiteConfig(siteKey);
  if(!config)notFound();
  return <PrototypeLanding config={config}/>;
}
