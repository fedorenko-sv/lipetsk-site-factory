/* eslint-disable @next/next/no-img-element -- Local generated architecture image. */
import { PrototypeHeader, PrototypeFooter, PrototypeFAQ } from "@/features/prototypes/sections";
import { PrototypeMotion } from "@/features/prototypes/PrototypeMotion";
import { EstimateFlow } from "./EstimateFlow";
import { estimateConfig } from "./config";
import "@/features/prototypes/styles.css";

export function EstimateLanding() {
  return <div className="prototype prototype-estimate"><PrototypeMotion>
    <a className="prototype-skip" href="#calculator">К расчёту</a>
    <PrototypeHeader id="estimate" brand="ПРОСВЕТ" cta="Рассчитать окно"/>
    <main>
      <section className="prototype-hero">
        <div className="prototype-hero-copy"><p className="prototype-kicker">Окна, с которых начинается дом<span>Демо</span></p><h1>Больше света.<br/>Меньше неизвестных.</h1><p className="prototype-lead">Размеры, цвет, стеклопакет и монтаж. Посмотрите, как каждый выбор влияет на стоимость — ещё до первого разговора.</p><a className="prototype-button" href="#calculator">Рассчитать свой вариант ↗</a><span className="prototype-scroll-note">Архитектура света — в простых деталях ↓</span></div>
        <figure className="prototype-hero-visual"><img src="/demo-assets/prototypes/estimate.webp" alt="Большое графитовое окно в светлом архитектурном интерьере" width="1600" height="1000" fetchPriority="high"/><figcaption>Архитектурная концепция · ПРОСВЕТ</figcaption><span className="prototype-visual-tag">Прозрачно. С первого расчёта.</span></figure>
      </section>
      <div className="prototype-facts"><div><span>01</span>Параметры вместо догадок</div><div><span>02</span>Цена по понятным строкам</div><div><span>03</span>Уточнение после замера</div></div>
      <section className="prototype-section prototype-services" id="services" aria-labelledby="estimate-offer" data-reveal>
        <div className="prototype-section-heading"><p className="prototype-kicker">Ваш свет. Ваша конфигурация.</p><h2 id="estimate-offer">Выбор, который видно.</h2><p>В демо сравниваются окна и балконные двери. Точный состав изделия, условия монтажа и коммерческие ставки определяются для конкретного исполнителя.</p></div>
        <div className="prototype-process-grid">
          <article><span>Конструкция</span><h3>Окно или дверь.</h3><p>Габариты и количество определяют площадь. Белый профиль или графит меняют подачу и стоимость.</p></article>
          <article><span>Комплектация</span><h3>Детали имеют значение.</h3><p>Базовый или усиленный стеклопакет, с монтажом или без — каждая доплата видна отдельно.</p></article>
          <article><span>Следующий шаг</span><h3>Свериться с реальностью.</h3><p>Предварительный расчёт помогает обсудить задачу. Замер и осмотр нужны для окончательного предложения.</p></article>
        </div>
      </section>
      <section className="prototype-section" id="calculator" aria-label="Калькулятор стоимости окна">
        <EstimateFlow config={estimateConfig}/>
      </section>
      <section className="prototype-section prototype-process" id="approach" aria-labelledby="estimate-process" data-reveal><div className="prototype-section-heading"><p className="prototype-kicker">Простой порядок</p><h2 id="estimate-process">От идеи — к точным размерам.</h2></div><div className="prototype-process-grid">{[
        ["Укажите параметры","Снимите ориентировочные размеры и выберите нужную комплектацию."],
        ["Изучите расчёт","Посмотрите состав стоимости и то, что требует отдельного уточнения."],
        ["Обсудите проект","В клиентском проекте специалист уточнит проём, монтаж и условия. Демо сохраняет только тестовую заявку."],
      ].map(([title,body],index)=><article key={title}><span>0{index+1}</span><h3>{title}</h3><p>{body}</p></article>)}</div></section>
      <PrototypeFAQ items={[
        ["Можно заказать по этой цене?","Нет. Здесь используются демонстрационные ставки. Итоговая комплектация, доставка, состояние проёма и дополнительные работы уточняются после замера."],
        ["Что произойдёт после отправки?","Сохранится синтетическая заявка с параметрами и серверным расчётом. Реальный замер, заказ, оплата и сообщения исполнителю в демо не запускаются."],
      ]}/>
    </main>
    <PrototypeFooter brand="ПРОСВЕТ" id="estimate"/>
  </PrototypeMotion></div>;
}
