"use client";

/* eslint-disable @next/next/no-img-element -- Native images allow art-directed local media and predictable hero framing. */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SiteConfig } from "@/shared/contracts";
import configData from "../../../examples/sites/detailing.json";
import { BookingFlow } from "../booking/ui/BookingFlow";
import { formatPrice } from "../booking/client/formatters";

import { PhotoFilm } from "./PhotoFilm";
import { LightStudy } from "./LightStudy";
import { AtelierMark, Closeup, ZonePlate, crop, markerPosition } from "./ZonePlate";

const config = configData as SiteConfig;
const media = "/demo-assets/detailing/";
const zones = [
  {
    id: "front",
    name: "Передняя часть",
    short: "Капот",
    x: 37,
    y: 59,
    title: "Первой встречает дорогу.",
    text: "Капот, бампер и зеркала принимают на себя песок и мелкий гравий. Начните с защиты самых уязвимых элементов.",
    services: ["ppf-front", "ceramic"],
  },
  {
    id: "body",
    name: "Весь кузов",
    short: "Кузов",
    x: 76,
    y: 65,
    title: "Силуэт без компромиссов.",
    text: "Сохраняем глубину цвета и защищаем лак. Подберём плёнку, керамику или восстановительную полировку.",
    services: ["ppf-full", "ceramic", "polish"],
  },
  {
    id: "wheels",
    name: "Диски",
    short: "Диски",
    x: 57.5,
    y: 75,
    title: "Точность до последней спицы.",
    text: "Удаляем стойкие загрязнения и наносим защиту, которая облегчает дальнейший уход за дисками.",
    services: ["wheel-care"],
  },
  {
    id: "interior",
    name: "Салон",
    short: "Салон",
    x: 74,
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
  const [closeup, setCloseup] = useState(false);
  const [visitedCloseup, setVisitedCloseup] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const zone = zones.find((item) => item.id === zoneId)!;
  const selected = config.services.find((item) => item.id === serviceId)!;

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
          <AtelierMark />
          <span className="dt-wordmark-type">
            OBLIK<small>detailing atelier</small>
          </span>
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
        <PhotoFilm />
        <LightStudy />

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
              <div className="dt-stage-caption">
                <button
                  className="dt-shot-toggle"
                  type="button"
                  aria-pressed={closeup}
                  onClick={() => {
                    setVisitedCloseup(true);
                    setCloseup(!closeup);
                  }}
                >
                  {closeup ? "← Общий план" : "Крупный план ↗"}
                </button>
              </div>
              <div
                className="dt-car-registration"
                style={{ aspectRatio: crop.width + " / " + crop.height }}
              >
                <img
                  src={media + "zone-map.webp"}
                  alt="Графитовый спортивный автомобиль, вид спереди в три четверти"
                  width={crop.width}
                  height={crop.height}
                  loading="lazy"
                />
                <ZonePlate id={zoneId} />
                <Closeup zoneId={zoneId} name={zone.name} open={closeup} visited={visitedCloseup} />
                {!closeup &&
                  zones.map((item) => (
                    <button
                      key={item.id}
                      className={"dt-hotspot " + (zoneId === item.id ? "dt-active" : "")}
                      style={markerPosition(item.x, item.y)}
                      aria-label={"Выбрать зону: " + item.name}
                      aria-pressed={zoneId === item.id}
                      onClick={() => selectZone(item.id)}
                    >
                      <span className="dt-hotspot-dot" />
                      <span className="dt-hotspot-label">{item.short}</span>
                    </button>
                  ))}
              </div>
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
              <div className="dt-service-exposure">
                <img
                  src={media + "paint.webp"}
                  alt="Капли воды на защищённом графитовом лаке"
                  width="1200"
                  height="800"
                  loading="lazy"
                />
              </div>
              <div>
                <h3>Глубина цвета.</h3>
                <p>Бережная полировка и керамическое покрытие. Лак снова ловит свет.</p>
                <a href="#protection" onClick={() => selectZone("body")}>
                  Программы для кузова <span aria-hidden="true">↗</span>
                </a>
              </div>
            </article>
            <article data-reveal>
              <div className="dt-service-exposure">
                <img
                  src={media + "wheel.webp"}
                  alt="Чистый многоспицевый диск и линия переднего крыла"
                  width="1200"
                  height="800"
                  loading="lazy"
                />
              </div>
              <div>
                <h3>Ничего лишнего.</h3>
                <p>Чистота сложной геометрии и защитное покрытие дисков.</p>
                <a href="#protection" onClick={() => selectZone("wheels")}>
                  Уход за дисками <span aria-hidden="true">↗</span>
                </a>
              </div>
            </article>
            <article data-reveal>
              <div className="dt-service-exposure">
                <img
                  src={media + "interior.webp"}
                  alt="Фактура чёрной кожи и аккуратная строчка автомобильного кресла"
                  width="1200"
                  height="800"
                  loading="lazy"
                />
              </div>
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
          <h2 id="dt-approach-title" data-reveal>
            Работаем
            <br />
            <em>вручную.</em>
          </h2>
          <figure className="dt-approach-image" data-reveal>
            <img
              src={media + "craft.webp"}
              alt="Рука мастера укладывает прозрачную защитную плёнку на графитовое крыло"
              width="1200"
              height="800"
              loading="lazy"
            />
            <figcaption>Мастер расправляет прозрачную плёнку по кромке крыла.</figcaption>
          </figure>
          <div className="dt-approach-copy">
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
