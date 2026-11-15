/* eslint-disable @next/next/no-img-element -- Local commissioned concept photography. */
import type { Metadata } from "next";
import Link from "next/link";
import { basePath, mediaPath } from "@/features/detailing/content";
import { Breadcrumbs, PageIntro, NextVisit } from "@/features/detailing/site/PageParts";
export const metadata: Metadata = {
  title: "Подход к работе · OBLIK",
  description:
    "От осмотра под светом до выдачи автомобиля: подготовка, работа с материалом и рекомендации по уходу.",
};
export default function Atelier() {
  return (
    <main className="site-page">
      <section className="dt-shell">
        <Breadcrumbs current="Ателье" />
        <PageIntro
          title="Руки мастера."
          italic="Внимание к форме."
          text="Детейлинг начинается с осмотра. Сначала разбираемся в состоянии машины и вашей задаче, затем выбираем материал и способ работы."
        />
        <figure className="site-atelier-cover">
          <img
            src={mediaPath + "craft.webp"}
            alt="Мастер натягивает прозрачную плёнку на изгиб переднего крыла"
            width="1672"
            height="940"
            fetchPriority="high"
          />
          <figcaption>
            Кромка, изгиб, прилегание. Визуализация техники для концепта OBLIK.
          </figcaption>
        </figure>
      </section>
      <section className="site-section dt-shell site-split">
        <h2>
          Осмысленная
          <br />
          <em>работа.</em>
        </h2>
        <div className="site-prose">
          <p>
            Одинаковое название программы не означает одинаковый объём работы. Новому лаку,
            перекрашенной детали и автомобилю со старой защитой нужна разная подготовка.
          </p>
          <p>
            В этом концепте мы показываем последовательность, которую удобно обсудить с реальным
            ателье: состояние поверхности, согласованные работы, материал, уход и понятная выдача.
          </p>
        </div>
      </section>
      <section className="site-included">
        <div className="dt-shell site-split">
          <h2>
            Внимание
            <br />
            <em>в каждом шаге.</em>
          </h2>
          <ol className="site-process">
            {[
              [
                "Осмотр вместе с владельцем",
                "Обсуждаем маршруты и ежедневный уход, отмечаем существующие повреждения. Определяем, какие поверхности требуют внимания.",
              ],
              [
                "Состав и расчёт",
                "Фиксируем зоны, подготовку и материал. Дополнительные работы и разборку согласуем заранее.",
              ],
              [
                "Работа по материалу",
                "Пробуем состав на подходящем участке. Учитываем лак, плёнку, кожу или текстиль, а не применяем один способ ко всему.",
              ],
              [
                "Выдача и рекомендации",
                "Проверяем результат при направленном свете. Объясняем особенности первых дней и дальнейшей мойки.",
              ],
            ].map(([title, text]) => (
              <li key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="site-section dt-shell">
        <div className="site-section-title">
          <h2>
            Материал
            <br />
            <em>задаёт подход.</em>
          </h2>
          <Link className="site-text-link" href={basePath + "/care"}>
            Памятки владельцу ↗
          </Link>
        </div>
        <div className="site-material-pair">
          <figure>
            <img
              src={mediaPath + "paint.webp"}
              alt="Фактура графитового лака с каплями воды"
              width="1200"
              height="800"
              loading="lazy"
            />
            <figcaption>Лак и покрытие</figcaption>
          </figure>
          <figure>
            <img
              src={mediaPath + "interior.webp"}
              alt="Кожа кресла с аккуратной строчкой"
              width="1200"
              height="800"
              loading="lazy"
            />
            <figcaption>Кожа и сложные швы</figcaption>
          </figure>
        </div>
        <p className="site-concept-note">
          OBLIK — демонстрационный бренд. Изображения созданы для концепта. Для сайта действующего
          ателье этот раздел заполняется его собственными работами и подтверждёнными сведениями о
          команде.
        </p>
      </section>
      <NextVisit title="Начнём с разговора о машине." />
    </main>
  );
}
