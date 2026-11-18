/* eslint-disable @next/next/no-img-element -- Locally generated concept images. */
import Link from "next/link";
import type { SiteConfig, SiteService } from "@/shared/contracts";
import { getSiteConfig } from "@/config/sites";
import { formatPrice, formatAmount } from "@/features/booking/client/formatters";
import { estimateConfig } from "@/features/estimate/config";
import { defaultWindowParameters, quoteWindow } from "@/features/estimate/domain";
import { EstimateFlow } from "@/features/estimate/EstimateFlow";
import { getPrototype, type PrototypeId } from "./catalog";
import { getOfferStory } from "./offer-stories";
import { actionPage, catalogPage, demoPageHref, type DemoPage } from "./pages";
import { PrototypeHeader, PrototypeFooter } from "./sections";
import { BookingEntry } from "./BookingEntry";
import "./styles.css";
import "./pages.css";

type Query=Record<string,string|string[]|undefined>;
export function DemoFrame({id,title,lead,children,visual=true}:{id:PrototypeId;title:string;lead:string;children:React.ReactNode;visual?:boolean}) {
 const p=getPrototype(id)!;
 return <div className={"prototype prototype-"+id+" prototype-interior"} data-testid="demo-page">
  <a className="prototype-skip" href="#demo-content">К содержимому</a>
  <PrototypeHeader id={id} brand={p.brand} cta={id==="stay"?"Обсудить поездку":id==="estimate"?"Рассчитать окно":"Оставить заявку"}/>
  <main id="demo-content">
   <section className={"prototype-subhero "+(!visual?"prototype-subhero-compact":"")}>
    <div><nav aria-label="Хлебные крошки"><Link href={"/demo/"+id}>Главная</Link><span aria-hidden="true">/</span><span>{id==="stay"?"ТИШЕ":p.brand}</span></nav><p className="prototype-kicker">Демонстрационный концепт</p><h1>{title}</h1><p className="prototype-lead">{lead}</p></div>
    {visual&&<figure><img src={p.image} alt={"Визуальная концепция "+p.brand} width="1600" height="1000"/><figcaption>Образ пространства · концепт</figcaption></figure>}
   </section>
   {children}
  </main>
  <PrototypeFooter brand={p.brand} id={id}/>
 </div>;
}
function bookingHref(id:PrototypeId,serviceId?:string,resourceId?:string) {
 const url=demoPageHref(id,actionPage(id).slug);
 const query=new URLSearchParams();
 if(serviceId)query.set("service",serviceId);
 if(resourceId)query.set("resource",resourceId);
 return url+(query.size?"?"+query.toString():"");
}
function ServiceCards({id,config}:{id:PrototypeId;config:SiteConfig}) {
 return <div className="prototype-service-grid">{config.services.map((service,index)=><article className="prototype-service-card" key={service.id}>
  <span className="prototype-card-index">0{index+1} / {service.category}</span>
  <div className={"prototype-service-art art-"+index} aria-hidden="true"><span>{id==="stay"?"⌂":id==="medical"?"+":id==="beauty"?"✳":"↗"}</span></div>
  <h2>{service.name}</h2><p>{getOfferStory(id,service.id)?.intro}</p>
  <div className="prototype-price"><strong>{formatPrice(service.price)}</strong><span>{id==="stay"?"за ночь · ориентир":service.durationMinutes+" мин · демо"}</span></div>
  <Link aria-label={"Подробнее: "+service.name} href={demoPageHref(id,catalogPage(id).slug)+"/"+service.id}>Подробнее<span aria-hidden="true">↗</span></Link>
 </article>)}</div>;
}
export function DemoCatalog({id,page}:{id:PrototypeId;page:DemoPage}) {
 return <DemoFrame id={id} title={page.title} lead={page.lead}><section className="prototype-section prototype-page-catalog">
  {id==="estimate"?<div className="prototype-service-grid">{(["window","balcony-door"]as const).map((product,index)=>{
   const quote=quoteWindow({...defaultWindowParameters,product},estimateConfig.rates);
   return <article className="prototype-service-card" key={product}><span className="prototype-card-index">0{index+1} / Конструкция</span><div className="prototype-service-art" aria-hidden="true"><span>▥</span></div><h2>{product==="window"?"Окно":"Балконная дверь"}</h2><p>Пример 1200 × 1400 мм, белый профиль, базовый стеклопакет, с монтажом.</p><div className="prototype-price"><strong>{formatAmount(quote.totalMinor)} ₽</strong><span>условный пример</span></div><Link href={demoPageHref(id,"windows")+"/"+product}>Изучить конструкцию ↗</Link></article>;
  })}</div>:<ServiceCards id={id} config={getSiteConfig(id)!}/>}
  <p className="prototype-page-note">{id==="stay"?"Тариф за ночь — ориентир. Период, гости, сезонность и доступность обсуждаются отдельно.":"Цены и состав демонстрационные. Итоговое предложение требует уточнения у реального исполнителя."}</p>
 </section></DemoFrame>;
}
export function DemoTeam({id,page}:{id:PrototypeId;page:DemoPage}) {
 const config=getSiteConfig(id)!;
 return <DemoFrame id={id} title={page.title} lead={page.lead}><section className="prototype-section prototype-team-cards">
  {config.resources.map((resource,index)=>{
   const services=config.services.filter(service=>service.resourceIds.includes(resource.id));
   return <article key={resource.id}><span className="prototype-resource-avatar" aria-hidden="true">0{index+1}</span><p className="prototype-kicker">Демо-профиль</p><h2>{resource.name}</h2><p>Профиль показывает связь специалиста с предложениями. Реальные биография, фотография и подтверждённые сведения не выдумываются.</p><h3>{id==="sports"?"Программы":"Направления"}</h3><ul>{services.map(service=><li key={service.id}><Link href={bookingHref(id,service.id,resource.id)}>{service.name}<span aria-hidden="true"> ↗</span></Link></li>)}</ul></article>;
  })}
 </section></DemoFrame>;
}
export function DemoArticle({id,page}:{id:PrototypeId;page:DemoPage}) {
 return <DemoFrame id={id} title={page.title} lead={page.lead}><section className="prototype-section prototype-article-content">
  <div>{page.blocks?.map((block,index)=><article key={block.title}><span className="prototype-card-index">0{index+1}</span><h2>{block.title}</h2><p>{block.text}</p></article>)}</div>
  <aside><p className="prototype-kicker">Следующий шаг</p><h2>{id==="stay"?"Представить свой отдых.":id==="estimate"?"Примерить свои параметры.":"Перейти от знакомства к выбору."}</h2><Link className="prototype-button" href={demoPageHref(id,catalogPage(id).slug)}>{id==="stay"?"Выбрать дом":id==="sports"?"Выбрать программу":id==="estimate"?"Посмотреть конструкции":"Открыть предложения"} ↗</Link></aside>
 </section></DemoFrame>;
}
export function DemoService({id,service,config}:{id:PrototypeId;service:SiteService;config:SiteConfig}) {
 const story=getOfferStory(id,service.id)!;
 const resources=config.resources.filter(resource=>service.resourceIds.includes(resource.id));
 return <DemoFrame id={id} title={service.name} lead={story.intro}>
  <section className="prototype-section prototype-offer-detail">
   <div><Link className="prototype-back" href={demoPageHref(id,catalogPage(id).slug)}>← Вернуться в каталог</Link>
    <article><p className="prototype-kicker">В предложении</p><h2>Что можно выбрать.</h2><ul>{story.includes.map(text=><li key={text}>{text}</li>)}</ul></article>
    <article><p className="prototype-kicker">Перед следующим шагом</p><h2>{id==="stay"?"Обдумать поездку.":"Что стоит уточнить."}</h2><ul>{story.before.map(text=><li key={text}>{text}</li>)}</ul><p>{story.note}</p></article>
    {resources.length>0&&<article><h2>{id==="sports"?"Тренер программы.":id==="medical"?"Специалист направления.":"С кем будет удобно."}</h2>{resources.map(resource=><Link className="prototype-resource-link" key={resource.id} href={bookingHref(id,service.id,resource.id)}>{resource.name}<span aria-hidden="true">↗</span></Link>)}</article>}
   </div>
   <aside className="prototype-offer-summary"><p className="prototype-kicker">{service.category} · демо</p><h2>{formatPrice(service.price)}</h2><p>{id==="stay"?"Ориентир тарифа за ночь. В форме выбирают время обратной связи.":"Ориентир длительности: "+service.durationMinutes+" мин. Время посещения согласуется."}</p><Link className="prototype-button" href={bookingHref(id,service.id)} data-testid="offer-to-booking">{id==="stay"?"Обсудить этот дом":id==="sports"?"Выбрать пробное занятие":"Выбрать время"} ↗</Link><p>Используйте только синтетический телефон +70000000000. Реальный заказ не оформляется.</p></aside>
  </section>
 </DemoFrame>;
}
export function DemoWindow({product}:{product:"window"|"balcony-door"}) {
 const quote=quoteWindow({...defaultWindowParameters,product},estimateConfig.rates);
 return <DemoFrame id="estimate" title={product==="window"?"Окно для вашего света.":"Балконная дверь в вашем ритме."} lead="Конструкцию определяют не только размеры. Сравните комплектацию, а окончательное предложение уточните после замера.">
  <section className="prototype-section prototype-offer-detail"><div><Link className="prototype-back" href="/demo/estimate/windows">← Все конструкции</Link><article><h2>Параметры, которые видны.</h2><p>В калькуляторе выбирают ширину, высоту, количество, стеклопакет, цвет профиля и монтаж. Каждая доплата показана отдельной строкой.</p></article><article><h2>От примера — к вашему варианту.</h2><p>Показанный ориентир рассчитан для конструкции 1200 × 1400 мм, белого профиля, базового стеклопакета и монтажа. Изменение параметров пересчитывает сумму.</p><p>Осмотр проёма, доставка и дополнительные работы обсуждаются отдельно. Демо не принимает оплату и не назначает выезд.</p></article></div>
   <aside className="prototype-offer-summary"><p className="prototype-kicker">Демонстрационный пример</p><h2>{formatAmount(quote.totalMinor)} ₽</h2><p>1200 × 1400 мм · 1 шт. · с монтажом</p><Link className="prototype-button" href={"/demo/estimate/calculator?product="+product} data-testid="offer-to-calculator">Настроить этот вариант ↗</Link></aside>
  </section>
 </DemoFrame>;
}
export function DemoExamples({page}:{page:DemoPage}) {
 const variants=[
  {title:"Базовое окно",parameters:{...defaultWindowParameters}},
  {title:"Графит и усиленный стеклопакет",parameters:{...defaultWindowParameters,glazing:"triple"as const,finish:"graphite"as const}},
  {title:"Балконная дверь",parameters:{...defaultWindowParameters,product:"balcony-door"as const}},
 ];
 return <DemoFrame id="estimate" title={page.title} lead={page.lead}><section className="prototype-section prototype-example-grid">{variants.map(variant=>{
  const quote=quoteWindow(variant.parameters,estimateConfig.rates);
  return <article key={variant.title}><p className="prototype-kicker">1200 × 1400 мм · с монтажом</p><h2>{variant.title}</h2><dl>{quote.breakdown.map(line=><div key={line.code}><dt>{line.label}</dt><dd>{formatAmount(line.amountMinor)} ₽</dd></div>)}</dl><strong>{formatAmount(quote.totalMinor)} ₽</strong><Link href={"/demo/estimate/calculator?product="+variant.parameters.product}>Сравнить со своим вариантом ↗</Link></article>;
 })}</section></DemoFrame>;
}
export function DemoBooking({id,page,context}:{id:Exclude<PrototypeId,"estimate">;page:DemoPage;context:{serviceId?:string;resourceId?:string;startAtPreference:boolean}}) {
 return <DemoFrame id={id} title={page.title} lead={page.lead} visual={false}><section className="prototype-section prototype-action-host"><BookingEntry key={id+":"+context.serviceId+":"+context.resourceId} config={getSiteConfig(id)!} initialServiceId={context.serviceId} initialResourceId={context.resourceId} startAtPreference={context.startAtPreference}/></section></DemoFrame>;
}
export function DemoCalculator({page,product}:{page:DemoPage;product?:"window"|"balcony-door"}) {
 return <DemoFrame id="estimate" title={page.title} lead={page.lead} visual={false}><section className="prototype-section prototype-action-host prototype-calculator-page"><EstimateFlow key={product??"window"} config={estimateConfig} initialProduct={product}/></section></DemoFrame>;
}
export type { Query as DemoQuery };
