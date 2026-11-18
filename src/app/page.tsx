/* eslint-disable @next/next/no-img-element -- Local generated concept images. */
import type { Metadata } from "next";
import Link from "next/link";
import { prototypes } from "@/features/prototypes/catalog";
import "./showcase.css";
export const metadata:Metadata={
 title:"Шесть характеров. Общая логика действия · Форма и дело",
 description:"Шесть демонстрационных сайтов: Auto, Beauty, Medical, Sports, Stay и калькулятор окон.",
 robots:{index:false,follow:false},
};
export default function Showcase() {
 return <main className="factory">
  <header className="factory-top"><Link className="factory-wordmark" href="/">Форма <span>и дело</span><i aria-hidden="true">↗</i></Link><a href="#directions">Выбрать направление <span aria-hidden="true">↓</span></a></header>
  <section className="factory-intro">
   <p className="factory-label">Коллекция сайтов для локального бизнеса · демо</p>
   <div><h1>У каждого дела<br/>свой <em>характер.</em></h1><span className="factory-six" aria-hidden="true">6</span></div>
   <div className="factory-intro-bottom"><p>Разные люди, задачи и впечатления. Шесть направлений, в которых красивый первый экран ведёт к понятному следующему шагу.</p><a href="#directions">Посмотреть коллекцию <span aria-hidden="true">↘</span></a></div>
  </section>
  <section className="factory-collection" id="directions" aria-labelledby="collection-title">
   <div className="factory-collection-title"><h2 id="collection-title">Выберите свой контекст.</h2><span>01 — 06</span></div>
   <div className="factory-grid">{prototypes.map((p,index)=><article className={"factory-card factory-card-"+p.id} key={p.id} data-testid="prototype-card">
    <Link href={p.href} className="factory-card-image" aria-label={"Открыть "+p.brand}><img src={p.image} alt={"Визуальная концепция "+p.name} width="1600" height="1000" loading={index>1?"lazy":"eager"}/><span className="factory-card-number">0{index+1}</span><span className="factory-card-open" aria-hidden="true">↗</span><span className="factory-card-brand">{p.brand}</span></Link>
    <div className="factory-card-heading"><h3><Link href={p.href}>{p.name}</Link></h3><span>{p.core==="booking"?"Заявка":"Расчёт"}</span></div>
    <p>{p.summary}</p>
    {"extraHref" in p && <Link className="factory-detail-link" href={p.extraHref}>{p.extraLabel} ↗</Link>}
   </article>)}</div>
  </section>
  <section className="factory-note"><span aria-hidden="true">↗</span><div><h2>Первое впечатление<br/>с продолжением.</h2><p>В пяти направлениях можно пройти тестовую заявку, в шестом — настроить окно, изучить расчёт и отправить параметры. У Auto также есть подробный многостраничный пример детейлинг-ателье OBLIK.</p></div><Link href="/demo/detailing">Изучить OBLIK ↗</Link></section>
  <footer className="factory-bottom"><Link href="/">Форма и дело</Link><p>Демонстрационные концепты. Изображения созданы для примеров, цены условные.<br/>Тестовый телефон: +70000000000. Настоящие визиты, ночи и заказы не подтверждаются.</p><a href="#directions">К коллекции ↑</a></footer>
 </main>;
}
