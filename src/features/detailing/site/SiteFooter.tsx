import Link from "next/link";
import { basePath, programs } from "../content";
export function SiteFooter() {
  return (
    <footer className="dt-footer dt-shell site-footer">
      <div className="site-footer-grid">
        <div className="site-footer-about">
          <p>
            Детали формируют
            <br />
            <em>характер.</em>
          </p>
          <span>
            Детейлинг-ателье в Липецке.
            <br />
            Демонстрационный концепт.
          </span>
        </div>
        <nav aria-label="Программы ателье">
          {programs.map((p) => (
            <Link href={basePath + "/services/" + p.id} key={p.id}>
              {p.service.name}
            </Link>
          ))}
        </nav>
        <nav aria-label="Об ателье">
          <Link href={basePath + "/prices"}>Цены и выбор программы</Link>
          <Link href={basePath + "/atelier"}>Подход к работе</Link>
          <Link href={basePath + "/care"}>Памятки по уходу</Link>
          <Link href={basePath + "/visit"}>Как проходит визит</Link>
          <Link href={basePath + "/booking"}>Оставить тестовую заявку ↗</Link>
        </nav>
      </div>
      <Link className="dt-footer-brand" href={basePath} aria-label="OBLIK — главная">
        OBLIK
      </Link>
      <div className="dt-footer-bottom">
        <span>Визуалы созданы для концепта. Цены демонстрационные.</span>
        <Link href={basePath + "/privacy"}>Политика демо</Link>
        <Link href="/">Все демо</Link>
        <a href="#site-top">Наверх ↑</a>
      </div>
    </footer>
  );
}
