import Image from "next/image";
import Link from "next/link";
import type { SiteConfig, SiteService } from "@/shared/contracts";
import { getSiteConfig } from "@/config/sites";
import { formatPrice, formatAmount } from "@/features/booking/client/formatters";
import { estimateConfig } from "@/features/estimate/config";
import { defaultWindowParameters, quoteWindow } from "@/features/estimate/domain";
import { EstimateFlow } from "@/features/estimate/EstimateFlow";
import { getPrototype, type PrototypeId } from "./catalog";
import { getOfferStory } from "./offer-stories";
import { getOfferMedia, type OfferPhoto } from "./media";
import { OfferGallery } from "./OfferGallery";
import { OfferArtwork } from "./OfferArtwork";
import { actionPage, catalogPage, demoPageHref, type DemoPage } from "./pages";
import { PrototypeHeader, PrototypeFooter } from "./sections";
import { BookingEntry } from "./BookingEntry";
import { ChoiceGuide, EditorialFigure, RequestGuide } from "./EditorialSections";
import { articleNotes, guides, offerExampleIndex, people, withEditorialResourceNames } from "./editorial";
import { editorialPhotos, getEditorialPhoto } from "./editorial-photos";
import { getShellBrand } from "@/brands/server";
import { brandLogo, brandRootProps } from "@/brands/style";
import "./styles.css";
import "./pages.css";

type Query=Record<string,string|string[]|undefined>;
export async function DemoFrame({id,title,lead,children,visual=true,image,parent}:{id:PrototypeId;title:string;lead:string;children:React.ReactNode;visual?:boolean;image?:OfferPhoto;parent?:DemoPage}) {
 const p=getPrototype(id)!;
 const brand=await getShellBrand(id);
 const hero=brand.media?.hero;
 return <div className={"prototype prototype-"+id+" prototype-interior"} data-testid="demo-page" {...brandRootProps(brand)}>
  <a className="prototype-skip" href="#demo-content">К содержимому</a>
  <PrototypeHeader id={id} brand={brand.name.short} logo={brandLogo(brand)} cta={id==="stay"?"Обсудить поездку":id==="estimate"?"Рассчитать окно":"Оставить заявку"}/>
  <main id="demo-content">
   <section className={"prototype-subhero "+(!visual?"prototype-subhero-compact":"")}>
    <div><nav aria-label="Хлебные крошки"><Link href={"/demo/"+id}>Главная</Link>{parent && <><span aria-hidden="true">/</span><Link href={demoPageHref(id,parent.slug)}>{id==="stay"?"Дома":id==="estimate"?"Конструкции":"Каталог"}</Link></>}</nav><p className="prototype-kicker">Демонстрационный концепт</p><h1>{title}</h1><p className="prototype-lead">{lead}</p></div>
    {visual&&<figure><Image src={image?.src ?? hero?.path ?? p.image} alt={image?.alt ?? hero?.alt ?? "Визуальная концепция "+brand.name.short} width={image?.width ?? hero?.width ?? 1600} height={image?.height ?? hero?.height ?? 1000} sizes="(max-width: 700px) 90vw, (max-width: 1600px) 36vw, 570px" loading="eager"/><figcaption>{image?.caption ?? "Образ пространства"} · демо</figcaption></figure>}
   </section>
   {children}
  </main>
  <PrototypeFooter brand={brand} id={id}/>
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
  <OfferArtwork siteKey={id} serviceId={service.id} index={index}/>
  <span className="prototype-card-index">{service.category}</span>
  <h2>{service.name}</h2><p>{getOfferStory(id,service.id)?.intro}</p>
  <div className="prototype-price"><strong>{formatPrice(service.price)}</strong><span>{id==="stay"?"за ночь · ориентир":service.durationMinutes+" мин · демо"}</span></div>
  <Link aria-label={"Подробнее: "+service.name} href={demoPageHref(id,catalogPage(id).slug)+"/"+service.id}>Подробнее<span aria-hidden="true">↗</span></Link>
 </article>)}</div>;
}
export function DemoCatalog({id,page}:{id:PrototypeId;page:DemoPage}) {
 return <DemoFrame id={id} title={page.title} lead={page.lead} visual={false}><section className="prototype-section prototype-page-catalog">
  {id==="estimate"?<div className="prototype-service-grid">{(["window","balcony-door"]as const).map(product=>{
   const quote=quoteWindow({...defaultWindowParameters,product},estimateConfig.rates);
   return <article className="prototype-service-card" key={product}><OfferArtwork siteKey="estimate" serviceId={product} index={0}/><h2>{product==="window"?"Окно":"Балконная дверь"}</h2><p>Пример 1200 × 1400 мм, белый профиль, базовый стеклопакет, с монтажом.</p><div className="prototype-price"><strong>{formatAmount(quote.totalMinor)} ₽</strong><span>условный пример</span></div><Link href={demoPageHref(id,"windows")+"/"+product}>Изучить конструкцию ↗</Link></article>;
  })}</div>:<ServiceCards id={id} config={getSiteConfig(id)!}/>}
  <p className="prototype-page-note">{id==="stay"?"Тариф за ночь — ориентир. Период, гости, сезонность и доступность обсуждаются отдельно.":"Цены и состав демонстрационные. Итоговое предложение требует уточнения у реального исполнителя."}</p>
 </section><ChoiceGuide id={id}/></DemoFrame>;
}
export function DemoTeam({id,page}:{id:PrototypeId;page:DemoPage}) {
 const config=getSiteConfig(id)!;
 return <DemoFrame id={id} title={page.title} lead={page.lead} visual={false}><section className="prototype-section prototype-team-cards">
  {config.resources.map(resource=>{
   const services=config.services.filter(service=>service.resourceIds.includes(resource.id));
   const [name, role, bio, photo] = people[resource.id];
   return <article key={resource.id}><div className="editorial-portrait"><EditorialFigure photo={getEditorialPhoto(id,photo)}/></div><h2>{name}</h2><p><strong>{role}</strong></p><p className="editorial-section-copy">{bio}</p><h3>{id==="sports"?"Программы":"Направления"}</h3><ul>{services.map(service=><li key={service.id}><Link href={bookingHref(id,service.id,resource.id)}>{service.name}<span aria-hidden="true"> ↗</span></Link></li>)}</ul></article>;
  })}
 </section></DemoFrame>;
}
export function DemoArticle({id,page}:{id:PrototypeId;page:DemoPage}) {
 const [noteTitle,noteText,photoKey] = articleNotes[id][page.slug];
 return <DemoFrame id={id} title={page.title} lead={page.lead} image={getEditorialPhoto(id,photoKey)}><section className="prototype-section prototype-article-content">
  <div>{page.blocks?.map(block=><article key={block.title}><h2>{block.title}</h2><p className="editorial-section-copy">{block.text}</p></article>)}<article><h2>{noteTitle}</h2><p className="editorial-section-copy">{noteText}</p></article></div>
  <aside><p className="prototype-kicker">Следующий шаг</p><h2>{id==="stay"?"Представить свой отдых.":id==="estimate"?"Примерить свои параметры.":"Перейти от знакомства к выбору."}</h2><Link className="prototype-button" href={demoPageHref(id,catalogPage(id).slug)}>{id==="stay"?"Выбрать дом":id==="sports"?"Выбрать программу":id==="estimate"?"Посмотреть конструкции":"Открыть предложения"} ↗</Link></aside>
 </section><ChoiceGuide id={id}/></DemoFrame>;
}
export function DemoService({id,service,config}:{id:PrototypeId;service:SiteService;config:SiteConfig}) {
 const story=getOfferStory(id,service.id)!;
 const example=guides[id].examples[offerExampleIndex[service.id]];
 const media=getOfferMedia(id,service.id);
 const resources=config.resources.filter(resource=>service.resourceIds.includes(resource.id));
 return <DemoFrame id={id} title={service.name} lead={story.intro} image={media?.photos[0]} parent={catalogPage(id)}>
  <section className="prototype-section prototype-offer-detail">
   <aside className="prototype-offer-summary"><p className="prototype-kicker">{service.category} · демо</p><h2>{formatPrice(service.price)}</h2><p>{id==="stay"?"Ориентир тарифа за ночь. В форме выбирают время обратной связи.":"Ориентир длительности: "+service.durationMinutes+" мин. Время посещения согласуется."}</p><Link className="prototype-button" href={bookingHref(id,service.id)} data-testid="offer-to-booking">{id==="stay"?"Обсудить этот дом":id==="sports"?"Выбрать пробное занятие":"Выбрать время"} ↗</Link></aside>
   <div>
    <article><h2>{example[0]}</h2><p className="editorial-section-copy">{example[1]}</p><p className="editorial-section-copy">{example[2]}</p></article>
    <article><p className="prototype-kicker">В предложении</p><h2>Что можно выбрать.</h2><ul>{story.includes.map(text=><li key={text}>{text}</li>)}</ul></article>
    <article><p className="prototype-kicker">Перед следующим шагом</p><h2>{id==="stay"?"Обдумать поездку.":"Что стоит уточнить."}</h2><ul>{story.before.map(text=><li key={text}>{text}</li>)}</ul><p>{story.note}</p></article>
    {resources.length>0&&<article><h2>{id==="sports"?"Тренер программы.":id==="medical"?"Специалист направления.":"С кем будет удобно."}</h2>{resources.map(resource=><Link className="prototype-resource-link" key={resource.id} href={bookingHref(id,service.id,resource.id)}>{resource.name}<span aria-hidden="true">↗</span></Link>)}</article>}
   </div>
  </section>
  {media && <OfferGallery media={media}/>}
 </DemoFrame>;
}
export function DemoWindow({product}:{product:"window"|"balcony-door"}) {
 const quote=quoteWindow({...defaultWindowParameters,product},estimateConfig.rates);
 const media=getOfferMedia("estimate",product)!;
 return <DemoFrame id="estimate" title={product==="window"?"Окно для вашего света.":"Балконная дверь в вашем ритме."} lead="Конструкцию определяют не только размеры. Сравните комплектацию, а окончательное предложение уточните после замера." image={media.photos[0]} parent={catalogPage("estimate")}>
  <section className="prototype-section prototype-offer-detail"><div><Link className="prototype-back" href="/demo/estimate/windows">← Все конструкции</Link><article><h2>Параметры, которые видны.</h2><p>В калькуляторе выбирают ширину, высоту, количество, стеклопакет, цвет профиля и монтаж. Каждая доплата показана отдельной строкой.</p></article><article><h2>От примера — к вашему варианту.</h2><p>Показанный ориентир рассчитан для конструкции 1200 × 1400 мм, белого профиля, базового стеклопакета и монтажа. Изменение параметров пересчитывает сумму.</p><p>Осмотр проёма, доставка и дополнительные работы обсуждаются отдельно. Демо не принимает оплату и не назначает выезд.</p></article></div>
   <aside className="prototype-offer-summary"><p className="prototype-kicker">Демонстрационный пример</p><h2>{formatAmount(quote.totalMinor)} ₽</h2><p>1200 × 1400 мм · 1 шт. · с монтажом</p><Link className="prototype-button" href={"/demo/estimate/calculator?product="+product} data-testid="offer-to-calculator">Настроить этот вариант ↗</Link></aside>
  </section>
  <OfferGallery media={media}/><ChoiceGuide id="estimate"/>
 </DemoFrame>;
}
export function DemoExamples({page}:{page:DemoPage}) {
 const variants=[
  {title:"Базовое окно",photo:editorialPhotos.estimate.window,parameters:{...defaultWindowParameters}},
  {title:"Графит и усиленный стеклопакет",photo:editorialPhotos.estimate.graphite,parameters:{...defaultWindowParameters,glazing:"triple"as const,finish:"graphite"as const}},
  {title:"Балконная дверь",photo:editorialPhotos.estimate["balcony-door"],parameters:{...defaultWindowParameters,product:"balcony-door"as const}},
  {title:"Два небольших окна",photo:editorialPhotos.estimate.frame,parameters:{...defaultWindowParameters,widthMm:900,heightMm:1100,quantity:2}},
  {title:"Окно без монтажа",photo:editorialPhotos.estimate.glass,parameters:{...defaultWindowParameters,widthMm:1400,heightMm:1500,installation:false}},
  {title:"Высокая дверь",photo:editorialPhotos.estimate.measure,parameters:{...defaultWindowParameters,product:"balcony-door" as const,widthMm:800,heightMm:2100}},
 ];
 return <DemoFrame id="estimate" title={page.title} lead={page.lead} visual={false}><section className="prototype-section prototype-example-grid">{variants.map(variant=>{
  const quote=quoteWindow(variant.parameters,estimateConfig.rates);
  return <article key={variant.title}><EditorialFigure photo={variant.photo}/><p className="editorial-section-copy">{variant.parameters.widthMm} × {variant.parameters.heightMm} мм · {variant.parameters.quantity} шт. · {variant.parameters.installation?"с монтажом":"без монтажа"}</p><h2>{variant.title}</h2><dl>{quote.breakdown.map(line=><div key={line.code}><dt>{line.label}</dt><dd>{formatAmount(line.amountMinor)} ₽</dd></div>)}</dl><strong>{formatAmount(quote.totalMinor)} ₽</strong><Link href={"/demo/estimate/calculator?product="+variant.parameters.product}>Настроить параметры ↗</Link></article>;
 })}</section></DemoFrame>;
}
export async function DemoBooking({id,page,context}:{id:Exclude<PrototypeId,"estimate">;page:DemoPage;context:{serviceId?:string;resourceId?:string;startAtPreference:boolean}}) {
 const brand=await getShellBrand(id);
 return <DemoFrame id={id} title={page.title} lead={page.lead} visual={false}><section className="prototype-section prototype-action-host"><RequestGuide id={id}/><BookingEntry key={id+":"+context.serviceId+":"+context.resourceId} config={{...withEditorialResourceNames(getSiteConfig(id)!),brandName:brand.name.full}} initialServiceId={context.serviceId} initialResourceId={context.resourceId} startAtPreference={context.startAtPreference}/></section></DemoFrame>;
}
export async function DemoCalculator({page,product}:{page:DemoPage;product?:"window"|"balcony-door"}) {
 const brand=await getShellBrand("estimate");
 return <DemoFrame id="estimate" title={page.title} lead={page.lead} visual={false}><section className="prototype-section prototype-action-host prototype-calculator-page"><RequestGuide id="estimate"/><EstimateFlow key={product??"window"} config={{...estimateConfig,brandName:brand.name.full}} initialProduct={product}/></section></DemoFrame>;
}
export type { Query as DemoQuery };
