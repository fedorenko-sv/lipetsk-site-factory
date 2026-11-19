/* eslint-disable @next/next/no-img-element -- Own concept plate for the visit page. */
import type { Metadata } from "next";
import { DetailingScenarios } from "@/features/detailing/site/DetailingEditorial";
import Link from "next/link";
import { basePath, mediaPath, siteConfig, bookingHref } from "@/features/detailing/content";
import { Breadcrumbs, PageIntro } from "@/features/detailing/site/PageParts";
export const metadata: Metadata = {
  title: "Визит и демонстрационная запись · OBLIK",
  description:
    "Как подготовиться к осмотру автомобиля и оставить пожелание по визиту в демо OBLIK.",
};
export default function Visit() {
  const hours = siteConfig.booking?.workingHours;
  const days = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  return (
    <main className="site-page">
      <section className="dt-shell">
        <Breadcrumbs current="Визит" />
        <PageIntro
          title="Запланируем"
          italic="визит."
          text="Расскажите, что хотите сохранить или восстановить. Осмотр помогает подобрать программу и согласовать работу до её начала."
        />
        <div className="site-visit-grid">
          <figure>
            <img
              src={mediaPath + "reverse.webp"}
              alt="Графитовое купе в студии, вид с заднего крыла"
              width="1672"
              height="940"
              fetchPriority="high"
            />
          </figure>
          <div className="site-visit-copy">
            <h2>Липецк.</h2>
            <p>
              В демо пока нет действующего адреса, телефона и маршрута. Эти данные добавляются для
              конкретного ателье после подтверждения владельцем.
            </p>
            {hours && (
              <div className="site-hours">
                <h3>Время в демонстрационной форме</h3>
                <p>
                  {hours.days.map((d) => days[d]).join(" · ")}
                  <br />
                  {hours.opens}–{hours.closes} · Москва
                </p>
              </div>
            )}
            <Link className="dt-button" href={bookingHref()}>
              Выбрать программу и время <span aria-hidden="true">↗</span>
            </Link>
            <p className="site-price-caption">Заявка в демо не бронирует реальный визит.</p>
          </div>
        </div>
      </section>
      <section className="site-section dt-shell site-split">
        <h2>
          Что полезно
          <br />
          <em>перед осмотром.</em>
        </h2>
        <div className="site-prose">
          <h3>Расскажите об автомобиле</h3>
          <p>
            Какие участки беспокоят, есть ли плёнка или старый состав, были ли окрашенные детали.
            Это помогает задать точные вопросы при встрече.
          </p>
          <h3>Не маскируйте поверхность</h3>
          <p>
            Не наносите перед осмотром случайную полироль или защитный состав. Требования к мойке и
            подготовке лучше уточнить у фактического ателье.
          </p>
          <h3>Оставьте время на согласование</h3>
          <p>
            Предпочтительное время — начало разговора о визите. Срок выполнения и состав работ
            зависят от машины и материалов.
          </p>
          <Link className="site-text-link" href={basePath + "/prices"}>
            Сначала посмотреть цены ↗
          </Link>
        </div>
      </section>
      <DetailingScenarios/>
    </main>
  );
}
