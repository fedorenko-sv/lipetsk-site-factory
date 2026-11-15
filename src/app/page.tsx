/* eslint-disable @next/next/no-img-element -- Showcase uses the project's own concept plate. */
import type { Metadata } from "next";
import Link from "next/link";
import "./showcase.css";
export const metadata: Metadata = {
  title: "Сайты, с которых удобно записаться · Lipetsk Site Factory",
  description:
    "Демонстрационные сайты для локального бизнеса: детейлинг-ателье, обслуживание автомобиля и бьюти-студия.",
};
export default function Showcase() {
  return (
    <main className="factory">
      <header className="factory-top">
        <Link href="/" aria-label="Фабрика сайтов — главная">
          Форма <span>и дело</span>
        </Link>
        <span>Сайты для локального бизнеса</span>
      </header>
      <section className="factory-intro">
        <h1>
          Впечатление.
          <br />
          <em>Затем — действие.</em>
        </h1>
        <p>
          Три примера того, как сайт помогает разобраться в услугах, увидеть цену и оставить
          пожелание по визиту.
        </p>
      </section>
      <section className="factory-feature" aria-labelledby="oblik-showcase">
        <Link
          href="/demo/detailing"
          className="factory-feature-image"
          aria-label="Открыть сайт OBLIK"
        >
          <img
            src="/demo-assets/detailing/hero.webp"
            alt="Графитовое купе на первом экране ателье OBLIK"
            width="1920"
            height="1080"
            fetchPriority="high"
          />
        </Link>
        <div>
          <span className="factory-label">Детейлинг-ателье</span>
          <h2 id="oblik-showcase">OBLIK</h2>
          <p>
            Кинематографичная главная, карта деталей автомобиля, шесть программ с описаниями, цены и
            запись.
          </p>
          <Link className="factory-link" href="/demo/detailing">
            Открыть ателье <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
      <section className="factory-more" aria-labelledby="other-demos">
        <h2 id="other-demos">Ещё два сценария записи.</h2>
        <div>
          <article>
            <p>Для автомобиля</p>
            <h3>
              Обслуживание
              <br />
              без лишних звонков.
            </h3>
            <p>Выбор работ, параметры автомобиля и пожелание по удобному времени.</p>
            <Link className="factory-link" href="/demo/auto">
              Посмотреть запись Auto ↗
            </Link>
          </article>
          <article>
            <p>Для себя</p>
            <h3>
              Услуга, мастер
              <br />и удобное время.
            </h3>
            <p>Бьюти-сценарий с выбором специалиста и общей формой записи.</p>
            <Link className="factory-link" href="/demo/beauty">
              Посмотреть запись Beauty ↗
            </Link>
          </article>
        </div>
      </section>
      <footer className="factory-bottom">
        <p>Демонстрационные концепты. Изображения созданы для примеров, цены условные.</p>
        <p>Тестовые формы принимают только +70000000000. Настоящий визит не бронируется.</p>
      </footer>
    </main>
  );
}
