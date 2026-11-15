/* eslint-disable @next/next/no-img-element -- Local detail photography. */
import type { Metadata } from "next";
import Link from "next/link";
import { programs, basePath, bookingHref, mediaPath } from "@/features/detailing/content";
import { Breadcrumbs, PageIntro, NextVisit } from "@/features/detailing/site/PageParts";
import { formatPrice } from "@/features/booking/client/formatters";
export const metadata: Metadata = {
  title: "Цены и выбор защиты · OBLIK",
  description:
    "Демонстрационные цены на шесть программ OBLIK и сравнение плёнки, керамики и полировки.",
};
export default function Prices() {
  return (
    <main className="site-page">
      <section className="dt-shell">
        <Breadcrumbs current="Цены" />
        <PageIntro
          title="Сначала задача."
          italic="Потом стоимость."
          text="Начальная цена помогает сориентироваться. Состав работ и окончательный расчёт в действующем ателье согласуют после осмотра."
        />
        <div className="site-price-table-wrap">
          <table className="site-price-table">
            <caption>Демонстрационный прайс OBLIK</caption>
            <thead>
              <tr>
                <th scope="col">Программа</th>
                <th scope="col">Начальная цена</th>
                <th scope="col">
                  <span className="site-sr-only">Действие</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.id}>
                  <th scope="row">
                    <Link href={basePath + "/services/" + p.id}>
                      {p.service.name} <span aria-hidden="true">↗</span>
                    </Link>
                  </th>
                  <td>{formatPrice(p.service.price)}</td>
                  <td>
                    <Link href={bookingHref(p.id)} aria-label={"Выбрать время: " + p.service.name}>
                      Выбрать время ↗
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="site-price-factors">
          <div>
            <h3>Поверхность</h3>
            <p>Состояние лака, старые покрытия и сложные загрязнения определяют подготовку.</p>
          </div>
          <div>
            <h3>Геометрия</h3>
            <p>Размер автомобиля, сложные кромки и согласованный демонтаж меняют объём работы.</p>
          </div>
          <div>
            <h3>Материал</h3>
            <p>Конкретную плёнку или состав подбирают под задачу и проверяют на совместимость.</p>
          </div>
        </div>
      </section>
      <section className="site-comparison">
        <div className="dt-shell">
          <div className="site-comparison-heading">
            <h2>
              Что нужно
              <br />
              <em>вашему кузову.</em>
            </h2>
            <img
              src={mediaPath + "paint.webp"}
              alt="Свет и капли на графитовом лаке"
              width="1100"
              height="700"
              loading="lazy"
            />
          </div>
          <div className="site-compare-grid">
            <article>
              <h3>Плёнка</h3>
              <p>
                Для снижения механического воздействия на выбранные элементы. Подходит для передней
                части или комплексной защиты кузова.
              </p>
              <Link className="site-text-link" href={basePath + "/services/ppf-front"}>
                Посмотреть программу ↗
              </Link>
            </article>
            <article>
              <h3>Керамика</h3>
              <p>
                Для свойств поверхности и облегчения ухода. Наносится на подготовленный лак; от
                сколов защищает иначе, чем плёнка.
              </p>
              <Link className="site-text-link" href={basePath + "/services/ceramic"}>
                Посмотреть программу ↗
              </Link>
            </article>
            <article>
              <h3>Полировка</h3>
              <p>
                Для коррекции рисок и потускнений в пределах допустимой работы с лаком. Защитное
                покрытие подбирается отдельно.
              </p>
              <Link className="site-text-link" href={basePath + "/services/polish"}>
                Посмотреть программу ↗
              </Link>
            </article>
          </div>
        </div>
      </section>
      <NextVisit />
    </main>
  );
}
