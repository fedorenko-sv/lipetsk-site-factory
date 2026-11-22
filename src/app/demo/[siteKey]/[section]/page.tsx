import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPrototype, prototypes } from "@/features/prototypes/catalog";
import { getDemoPage, getDemoPages } from "@/features/prototypes/pages";
import { DemoArticle, DemoCatalog, DemoExamples, DemoTeam, type DemoQuery } from "@/features/prototypes/DemoPages";

interface Props { params:Promise<{siteKey:string;section:string}>;searchParams:Promise<DemoQuery> }
export function generateStaticParams() {
 return prototypes.flatMap(p=>getDemoPages(p.id).filter(page=>page.kind!=="booking"&&page.kind!=="calculator").map(page=>({siteKey:p.id,section:page.slug})));
}
export async function generateMetadata({params}:Props):Promise<Metadata> {
 const {siteKey,section}=await params;const p=getPrototype(siteKey);const page=p?getDemoPage(p.id,section):undefined;
 return {title:page&&p?page.title+" · "+p.brand:"Страница не найдена",description:page?.lead,robots:{index:false,follow:false}};
}
export default async function DemoSection({params}:Props) {
 const {siteKey,section}=await params;const p=getPrototype(siteKey);if(!p)notFound();
 const page=getDemoPage(p.id,section);if(!page)notFound();
 if(page.kind==="catalog")return <DemoCatalog id={p.id} page={page}/>;
 if(page.kind==="article")return <DemoArticle id={p.id} page={page}/>;
 if(page.kind==="team")return <DemoTeam id={p.id} page={page}/>;
 if(page.kind==="examples")return <DemoExamples page={page}/>;
 notFound();
}
