import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDemoPage } from "@/features/prototypes/pages";
import { resolveCalculatorContext } from "@/features/prototypes/context";
import { DemoCalculator, type DemoQuery } from "@/features/prototypes/DemoPages";
import { brandMetadata } from "@/brands/metadata";

export const dynamic="force-dynamic";
interface Props {params:Promise<{siteKey:string}>;searchParams:Promise<DemoQuery>}
export async function generateMetadata({params}:Props):Promise<Metadata>{
 const {siteKey}=await params;
 return siteKey==="estimate"?brandMetadata("estimate","Калькулятор"):{title:"Сайт не найден",robots:{index:false,follow:false}};
}
export default async function CalculatorPage({params,searchParams}:Props){
 const {siteKey}=await params;if(siteKey!=="estimate")notFound();
 const context=resolveCalculatorContext(await searchParams);
 if(!context.ok)notFound();
 return <DemoCalculator page={getDemoPage("estimate","calculator")!} product={context.product}/>;
}
