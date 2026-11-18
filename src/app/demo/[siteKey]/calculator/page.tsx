import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDemoPage } from "@/features/prototypes/pages";
import { resolveCalculatorContext } from "@/features/prototypes/context";
import { DemoCalculator, type DemoQuery } from "@/features/prototypes/DemoPages";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Калькулятор · ПРОСВЕТ",robots:{index:false,follow:false}};
interface Props {params:Promise<{siteKey:string}>;searchParams:Promise<DemoQuery>}
export default async function CalculatorPage({params,searchParams}:Props){
 const {siteKey}=await params;if(siteKey!=="estimate")notFound();
 const context=resolveCalculatorContext(await searchParams);
 if(!context.ok)notFound();
 return <DemoCalculator page={getDemoPage("estimate","calculator")!} product={context.product}/>;
}
