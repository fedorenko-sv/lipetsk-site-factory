"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { actionPage, catalogPage, demoPageHref, getDemoPages } from "./pages";
import type { PrototypeId } from "./catalog";
import "./pages.css";

const articleLabels: Record<string, string> = {
  about: "О сервисе", visit: "Подготовка к визиту", studio: "О студии",
  patients: "Перед обращением", information: "О клинике",
  "first-visit": "Первое занятие", space: "Спортивный зал",
  territory: "Территория", trip: "Планирование поездки",
  installation: "Монтаж", measurement: "Замер", examples: "Примеры расчёта",
};

export function PrototypeHeader({ brand, id, cta = "Оставить заявку" }: { brand:string; id:PrototypeId; cta?:string }) {
  const pathname=usePathname();
  const dialog=useRef<HTMLDialogElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const pages=getDemoPages(id);
  const catalog=catalogPage(id);
  const action=actionPage(id);
  const secondary=pages.find(p=>p.kind==="team")??pages.find(p=>p.kind==="article")!;
  const home="/demo/"+id;
  function restoreFocus() { trigger.current?.focus({preventScroll:true}); }
  function close() { dialog.current?.close(); restoreFocus(); }
  return <header className="prototype-header">
    <Link className="prototype-brand" href={home} aria-label={brand+" — главная"}>{brand}<span className="prototype-brand-mark" aria-hidden="true">↗</span></Link>
    <nav className="prototype-desktop-nav" aria-label="Основная навигация">
      <Link href={demoPageHref(id,catalog.slug)} aria-current={pathname===demoPageHref(id,catalog.slug)?"page":undefined}>{id==="stay"?"Дома":id==="sports"?"Программы":id==="medical"?"Направления":id==="estimate"?"Конструкции":"Услуги"}</Link>
      <Link href={demoPageHref(id,secondary.slug)}>{id==="beauty"?"Мастера":id==="medical"?"Специалисты":id==="sports"?"Тренеры":id==="stay"?"Территория":id==="estimate"?"Монтаж":"О сервисе"}</Link>
      <Link className="prototype-nav-cta" href={demoPageHref(id,action.slug)}>{cta}<span aria-hidden="true">↗</span></Link>
    </nav>
    <button className="prototype-menu-trigger" aria-label="Открыть меню демо" aria-haspopup="dialog" onClick={()=>dialog.current?.showModal()} ref={trigger}><span>Меню</span><span aria-hidden="true">☰</span></button>
    <dialog className="prototype-menu" aria-label={brand+" — меню"} ref={dialog} onCancel={event=>{event.preventDefault();close();}} onClose={restoreFocus} onClick={event=>{if(event.target===event.currentTarget)close();}}>
      <div><div className="prototype-menu-heading"><span>{brand}</span><button type="button" onClick={close} aria-label="Закрыть меню демо">×</button></div>
        <nav aria-label="Разделы демо"><Link href={home} onClick={close}>Главная<span aria-hidden="true">↗</span></Link>{pages.map(p=><Link href={demoPageHref(id,p.slug)} key={p.slug} onClick={close} aria-current={pathname===demoPageHref(id,p.slug)?"page":undefined}>{p.kind==="booking"?"Оставить заявку":p.kind==="calculator"?"Калькулятор":p.slug===catalog.slug?(id==="stay"?"Дома":id==="sports"?"Программы":id==="medical"?"Направления":id==="estimate"?"Конструкции":"Услуги"):p.kind==="team"?(id==="beauty"?"Мастера":id==="medical"?"Специалисты":"Тренеры"):(articleLabels[p.slug] ?? p.title)}<span aria-hidden="true">↗</span></Link>)}</nav>
        <p>Демонстрационный концепт. Только синтетические данные.</p>
      </div>
    </dialog>
  </header>;
}
