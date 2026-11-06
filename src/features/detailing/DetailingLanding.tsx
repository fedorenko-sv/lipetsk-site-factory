"use client";

/* eslint-disable @next/next/no-img-element -- Native images allow art-directed local media and predictable hero framing. */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SiteConfig } from "@/shared/contracts";
import configData from "../../../examples/sites/detailing.json";
import { BookingFlow } from "../booking/ui/BookingFlow";
import { formatPrice } from "../booking/client/formatters";

const config = configData as SiteConfig;
const media = "/demo-assets/detailing/";
const zones = [
  {
    id: "front",
    name: "Передняя часть",
    short: "Капот",
    x: 39,
    y: 62,
    title: "Первой встречает дорогу.",
    text: "Капот, бампер и зеркала принимают на себя песок и мелкий гравий. Начните с защиты самых уязвимых элементов.",
    services: ["ppf-front", "ceramic"],
  },
  {
    id: "body",
    name: "Весь кузов",
    short: "Кузов",
    x: 76,
    y: 64,
    title: "Силуэт без компромиссов.",
    text: "Сохраняем глубину цвета и защищаем лак. Подберём плёнку, керамику или восстановительную полировку.",
    services: ["ppf-full", "ceramic", "polish"],
  },
  {
    id: "wheels",
    name: "Диски",
    short: "Диски",
    x: 57,
    y: 67,
    title: "Точность до последней спицы.",
    text: "Удаляем стойкие загрязнения и наносим защиту, которая облегчает дальнейший уход за дисками.",
    services: ["wheel-care"],
  },
  {
    id: "interior",
    name: "Салон",
    short: "Салон",
    x: 65,
    y: 49,
    title: "Ощущение нового внутри.",
    text: "Деликатная очистка кожи, текстиля и сложных поверхностей. Уход, который чувствуется в каждой поездке.",
    services: ["interior-care"],
  },
];
const questions = [
  [
    "Плёнка или керамика?",
    "Плёнка помогает защищать лак от механического воздействия. Керамическое покрытие добавляет гидрофобность и облегчает уход. Их можно сочетать — решение зависит от автомобиля и сценария использования.",
  ],
  [
    "Зачем нужна полировка перед защитой?",
    "Если на лаке есть риски и потускнения, сначала восстанавливают поверхность. Объём подготовки определяют после осмотра — одинаковая программа подходит не каждому автомобилю.",
  ],
  [
    "Можно защитить только часть кузова?",
    "Да. Обычно начинают с передней части: капота, бампера, зеркал. В конструкторе выше можно выбрать нужную зону и программу.",
  ],
  [
    "Запись подтверждается сразу?",
    "Вы оставляете пожелание по дате и времени. В реальном ателье администратор подтверждает визит после согласования. В этом демо заявка записывается только в тестовую базу.",
  ],
];

export function DetailingLanding() {
  const [zoneId, setZoneId] = useState("front");
  const [serviceId, setServiceId] = useState("ppf-front");
  const [booking, setBooking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [closeup, setCloseup] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const zone = zones.find((item) => item.id === zoneId)!;
  const selected = config.services.find((item) => item.id === serviceId)!;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = navigator as Navigator & { connection?: { saveData?: boolean } };
    let visible = true;
    const update = () => {
      if (
        reduced.matches ||
        connection.connection?.saveData ||
        paused ||
        !visible ||
        document.hidden
      ) {
        video.pause();
        return;
      }
      if (!video.getAttribute("src"))
        video.src = media + (window.innerWidth < 720 ? "hero-720.mp4" : "hero-1080.mp4");
      void video.play().catch(() => {
        /* Poster remains usable when autoplay is blocked. */
      });
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    observer.observe(video);
    document.addEventListener("visibilitychange", update);
    reduced.addEventListener("change", update);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      reduced.removeEventListener("change", update);
      video.pause();
    };
  }, [paused]);

  useEffect(() => {
    const elements = rootRef.current?.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!elements || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("dt-in-view");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.1 },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const selectZone = (id: string) => {
    const next = zones.find((item) => item.id === id)!;
    setZoneId(id);
    setServiceId(next.services[0]);
    setBooking(false);
  };
  const startBooking = () => {
    setBooking(true);
    requestAnimationFrame(() =>
      document.getElementById("request")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      }),
    );
  };
  const returnToLanding = () => {
    setBooking(false);
    requestAnimationFrame(() => {
      startRef.current?.focus({ preventScroll: true });
      document.getElementById("protection")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    });
  };

  return (
    <div className="detailing" ref={rootRef}>
      <a href="#protection" className="dt-skip">
        К выбору защиты
      </a>
      <header className="dt-header">
        <a className="dt-wordmark" href="#top" aria-label="OBLIK — на главную">
          OBLIK<span>detailing atelier</span>
        </a>
        <nav aria-label="Основная навигация">
          <a href="#protection">Защита</a>
          <a href="#services">Услуги</a>
          <a href="#approach">Подход</a>
        </nav>
        <a className="dt-header-cta" href="#protection">
          Подобрать программу <span aria-hidden="true">↗</span>
        </a>
      </header>

      <main>
        <section className="dt-hero" id="top" aria-labelledby="dt-title">
          <div className="dt-hero-film" aria-hidden="true">
            <video
              ref={videoRef}
              muted
              loop
              playsInline
              autoPlay
              preload="none"
              poster={media + "hero.webp"}
            />
          </div>
          <div className="dt-hero-copy">
            <h1 id="dt-title">
              Сохраняем
              <br />
              <em>характер.</em>
            </h1>
            <p className="dt-hero-description">
              Детейлинг-ателье в Липецке.
              <br />
              Защита кузова. Внимание к деталям.
            </p>
            <a className="dt-button" href="#protection">
              Подобрать защиту <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="dt-hero-bottom">
            <span>Чистая форма. Глубокий цвет.</span>
            <a href="#protection" aria-label="Перейти к выбору зоны автомобиля">
              Листайте ниже <span aria-hidden="true">↓</span>
            </a>
            <button
              type="button"
              onClick={() => setPaused(!paused)}
              aria-label={paused ? "Включить видео" : "Остановить видео"}
            >
              {paused ? "▶" : "Ⅱ"}
              <span>{paused ? "Продолжить" : "Пауза"}</span>
            </button>
          </div>
        </section>

        <section className="dt-intro dt-shell" aria-labelledby="dt-intro-title">
          <h2 id="dt-intro-title" data-reveal>
            Тот же характер.
            <br />
            <em>Больше защиты.</em>
          </h2>
          <p data-reveal>
            Не меняем характер машины. Сохраняем то, за что вы её выбрали: линию кузова, глубину
            цвета, ощущение от прикосновения.
          </p>
        </section>

        <section
          className="dt-protection dt-shell"
          id="protection"
          aria-labelledby="dt-protection-title"
        >
          <div className="dt-section-head" data-reveal>
            <div>
              <h2 id="dt-protection-title">
                Начните <em>с главного.</em>
              </h2>
            </div>
            <p>
              Выберите зону автомобиля.
              <br />
              Мы покажем подходящие программы.
            </p>
          </div>
          <div className="dt-zone-tabs" aria-label="Зона автомобиля">
            {zones.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={zoneId === item.id}
                onClick={() => selectZone(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>
          <div className="dt-configurator">
            <div className="dt-car-stage">
              <img
                src={media + "hero.webp"}
                alt="Графитовый спортивный автомобиль, вид спереди в три четверти"
                width="1920"
                height="1080"
                loading="lazy"
              />
              <div className="dt-detail-shot" data-open={closeup} aria-hidden={!closeup}>
                <img
                  key={zoneId}
                  src={
                    media +
                    (zoneId === "wheels"
                      ? "wheel.webp"
                      : zoneId === "interior"
                        ? "interior.webp"
                        : "paint.webp")
                  }
                  alt={"Крупный план: " + zone.name}
                  width="1440"
                  height="810"
                  loading="lazy"
                />
              </div>
              {!closeup &&
                zones.map((item) => (
                  <button
                    key={item.id}
                    className={"dt-hotspot " + (zoneId === item.id ? "dt-active" : "")}
                    style={{ left: item.x + "%", top: item.y + "%" }}
                    aria-label={"Выбрать зону: " + item.name}
                    aria-pressed={zoneId === item.id}
                    onClick={() => selectZone(item.id)}
                  >
                    <span className="dt-hotspot-dot" />
                    <span className="dt-hotspot-label">{item.short}</span>
                  </button>
                ))}
              <button
                className="dt-shot-toggle"
                type="button"
                aria-pressed={closeup}
                onClick={() => setCloseup(!closeup)}
              >
                {closeup ? "← Общий план" : "Крупный план ↗"}
              </button>
            </div>
            <div className="dt-zone-detail" key={zone.id}>
              <h3>{zone.title}</h3>
              <p>{zone.text}</p>
              <div className="dt-programs" aria-label="Программа ухода">
                {zone.services.map((id) => {
                  const item = config.services.find((service) => service.id === id)!;
                  return (
                    <button
                      type="button"
                      key={id}
                      aria-pressed={serviceId === id}
                      onClick={() => {
                        setServiceId(id);
                        setBooking(false);
                      }}
                    >
                      <span>{item.name}</span>
                      <span>{formatPrice(item.price)}</span>
                    </button>
                  );
                })}
              </div>
              <p className="dt-selection" aria-live="polite">
                Выбрано: {selected.name}
              </p>
              <button type="button" ref={startRef} className="dt-button" onClick={startBooking}>
                Выбрать время <span aria-hidden="true">↗</span>
              </button>
              <small>Демонстрационные цены. Точный объём — после осмотра.</small>
            </div>
          </div>
        </section>

        <section className="dt-services dt-shell" id="services" aria-labelledby="dt-services-title">
          <div className="dt-section-head" data-reveal>
            <div>
              <h2 id="dt-services-title">
                Уход, который <em>виден.</em>
              </h2>
            </div>
            <p>
              От первого отражения
              <br />
              до последнего прикосновения.
            </p>
          </div>
          <div className="dt-editorial-services">
            <article data-reveal>
              <img
                src={media + "paint.webp"}
                alt="Капли воды на защищённом графитовом лаке"
                width="1200"
                height="800"
                loading="lazy"
              />
              <div>
                <h3>Глубина цвета.</h3>
                <p>Бережная полировка и керамическое покрытие. Лак снова ловит свет.</p>
                <a href="#protection" onClick={() => selectZone("body")}>
                  Программы для кузова <span aria-hidden="true">↗</span>
                </a>
              </div>
            </article>
            <article data-reveal>
              <img
                src={media + "wheel.webp"}
                alt="Чистый многоспицевый диск и линия переднего крыла"
                width="1200"
                height="800"
                loading="lazy"
              />
              <div>
                <h3>Ничего лишнего.</h3>
                <p>Чистота сложной геометрии и защитное покрытие дисков.</p>
                <a href="#protection" onClick={() => selectZone("wheels")}>
                  Уход за дисками <span aria-hidden="true">↗</span>
                </a>
              </div>
            </article>
            <article data-reveal>
              <img
                src={media + "interior.webp"}
                alt="Фактура чёрной кожи и аккуратная строчка автомобильного кресла"
                width="1200"
                height="800"
                loading="lazy"
              />
              <div>
                <h3>Личное пространство.</h3>
                <p>Деликатная работа с кожей и текстилем. Комфорт начинается внутри.</p>
                <a href="#protection" onClick={() => selectZone("interior")}>
                  Уход за салоном <span aria-hidden="true">↗</span>
                </a>
              </div>
            </article>
          </div>
        </section>

        <section className="dt-approach dt-shell" id="approach" aria-labelledby="dt-approach-title">
          <div className="dt-approach-image" data-reveal>
            <img
              src={media + "paint.webp"}
              alt="Свет подчёркивает чистоту поверхности кузова"
              width="1200"
              height="800"
              loading="lazy"
            />
          </div>
          <div className="dt-approach-copy">
            <h2 id="dt-approach-title" data-reveal>
              Сначала понять.
              <br />
              <em>Потом касаться.</em>
            </h2>
            <ol>
              {[
                [
                  "Осмотр и задача",
                  "Разбираемся, что важно именно вам: ежедневная защита, восстановление блеска или подготовка к сезону.",
                ],
                [
                  "Подготовка поверхности",
                  "Очищаем и подготавливаем материалы. Подбираем программу под состояние автомобиля.",
                ],
                [
                  "Работа и рекомендации",
                  "Проходим детали вместе с вами и объясняем, как сохранить результат в повседневном уходе.",
                ],
              ].map(([title, text]) => (
                <li key={title} data-reveal>
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="dt-faq dt-shell" aria-labelledby="dt-faq-title">
          <div data-reveal>
            <h2 id="dt-faq-title">
              Хорошие <em>вопросы.</em>
            </h2>
          </div>
          <div>
            {questions.map(([question, answer]) => (
              <details key={question} data-reveal>
                <summary>
                  {question}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="dt-request dt-shell" id="request" aria-labelledby="dt-request-title">
          <div className="dt-section-head">
            <div>
              <h2 id="dt-request-title">
                Внимание
                <br />
                <em>каждой детали.</em>
              </h2>
            </div>
            <p>
              Выберите удобное время.
              <br />В реальном ателье его подтвердит администратор.
            </p>
          </div>
          {booking ? (
            <div className="dt-booking theme-technical">
              <BookingFlow
                config={config}
                initialServiceId={serviceId}
                startAtPreference
                onReturnToLanding={returnToLanding}
              />
            </div>
          ) : (
            <div className="dt-request-entry">
              <p>Подберём программу по состоянию автомобиля и вашим задачам.</p>
              <button type="button" className="dt-button" onClick={startBooking}>
                Оставить тестовую заявку <span aria-hidden="true">↗</span>
              </button>
            </div>
          )}
          <p className="dt-demo-note">
            Демо-концепт. Для проверки формы используйте только +70000000000. Заявка сохранится в
            тестовой базе; реальные сообщения не отправляются.
          </p>
        </section>
      </main>
      <footer className="dt-footer dt-shell">
        <div className="dt-footer-top">
          <a href="#top">Вернуться к началу ↑</a>
          <span>Липецк · демонстрационный концепт</span>
          <Link href="/demo/detailing/privacy">Политика демо</Link>
        </div>
        <p className="dt-footer-brand" aria-label="OBLIK">
          OBLIK
        </p>
        <div className="dt-footer-bottom">
          <span>Детали формируют характер.</span>
          <span>Визуалы созданы специально для концепта. Цены демонстрационные.</span>
          <Link href="/">Все демо</Link>
        </div>
      </footer>
    </div>
  );
}
