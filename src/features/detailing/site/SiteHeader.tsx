"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { AtelierMark } from "../ZonePlate";
import { basePath } from "../content";

const items = [
  ["/services", "Услуги"],
  ["/prices", "Цены"],
  ["/atelier", "Ателье"],
  ["/care", "Уход"],
  ["/visit", "Визит"],
];
export function SiteHeader() {
  const pathname = usePathname();
  const home = pathname === basePath;
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  function close(restoreFocus = false) {
    dialog.current?.close();
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus());
  }
  const links = () =>
    items.map(([href, label]) => (
      <Link
        key={href}
        href={basePath + href}
        aria-current={
          pathname === basePath + href ||
          (href === "/services" && pathname.startsWith(basePath + href + "/"))
            ? "page"
            : undefined
        }
        onClick={() => close()}
      >
        {label}
      </Link>
    ));
  return (
    <header id="site-top" className={"dt-header site-header" + (home ? " site-header-home" : "")}>
      <Link
        className="dt-wordmark"
        href={basePath}
        aria-label="OBLIK — на главную"
        onClick={() => close()}
      >
        <AtelierMark />
        <span className="dt-wordmark-type">
          OBLIK<small>detailing atelier</small>
        </span>
      </Link>
      <nav className="site-desktop-nav" aria-label="Основная навигация">
        {links()}
      </nav>
      <Link
        className="dt-header-cta"
        aria-label="Подобрать программу"
        href={home ? "#protection" : basePath + "/booking"}
      >
        <span className="site-cta-full">Подобрать программу</span>
        <span className="site-cta-short">Запись</span>
        <span aria-hidden="true">↗</span>
      </Link>
      <button
        type="button"
        className="site-menu-trigger"
        ref={trigger}
        aria-expanded={open}
        aria-controls="site-mobile-menu"
        aria-label="Открыть меню"
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
      >
        <span />
        <span />
      </button>
      <dialog
        id="site-mobile-menu"
        ref={dialog}
        className="site-menu"
        aria-label="Навигация по ателье"
        onClose={() => setOpen(false)}
        onCancel={(event) => {
          event.preventDefault();
          close(true);
        }}
      >
        <div className="site-menu-top">
          <span>OBLIK</span>
          <button type="button" onClick={() => close(true)} aria-label="Закрыть меню">
            Закрыть <span aria-hidden="true">×</span>
          </button>
        </div>
        <nav aria-label="Разделы сайта">
          {links()}
          <Link href={basePath + "/booking"} onClick={() => close()}>
            Выбрать время <span aria-hidden="true">↗</span>
          </Link>
        </nav>
        <p>Детейлинг-ателье · Липецк</p>
        <p className="site-muted">Демонстрационный концепт</p>
      </dialog>
    </header>
  );
}
