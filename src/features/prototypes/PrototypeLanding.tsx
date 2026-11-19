import Image from "next/image";
import Link from "next/link";
import type { SiteConfig } from "@/shared/contracts";
import { formatPrice } from "@/features/booking/client/formatters";
import { getPrototype, type PrototypeId } from "./catalog";
import { catalogPage, demoPageHref } from "./pages";
import { profiles } from "./profiles";
import { OfferArtwork } from "./OfferArtwork";
import { BookingEntry } from "./BookingEntry";
import { ChoiceGuide } from "./EditorialSections";
import { editorialPhotos, getEditorialPhoto } from "./editorial-photos";
import { people, withEditorialResourceNames } from "./editorial";
import { getOfferStory } from "./offer-stories";
import { PrototypeMotion } from "./PrototypeMotion";
import { PrototypeHeader, PrototypeFooter, PrototypeFAQ } from "./sections";
import "./styles.css";

export function PrototypeLanding({ config }: { config: SiteConfig }) {
  const id = config.id as Exclude<PrototypeId, "estimate">;
  const prototype = getPrototype(id)!;
  const profile = profiles[id];
  const serviceTitle = id === "stay" ? "Выберите свой дом." : id === "sports" ? "У каждого — свой старт." : id === "medical" ? "С чего начнём?" : id === "beauty" ? "Время позаботиться о себе." : "Выберите задачу.";
  return <div className={"prototype prototype-" + id}>
    <PrototypeMotion>
      <a className="prototype-skip" href="#services">К предложению</a>
      <PrototypeHeader id={id} brand={prototype.brand} cta={id === "stay" ? "Обсудить поездку" : "Оставить заявку"} />
      <main>
        <section className="prototype-hero">
          <div className="prototype-hero-copy">
            <p className="prototype-kicker">{id === "stay" ? "Природа ближе, чем кажется" : id === "beauty" ? "Студия красоты · ваш ритм" : id === "sports" ? "Студия движения · для разных возрастов" : id === "medical" ? "Спокойно. Последовательно. Понятно." : "Сервис, в котором всё по делу"}<span>Демо</span></p>
            <h1>{profile.title}</h1>
            <p className="prototype-lead">{profile.lead}</p>
            <a className="prototype-button" href="#booking">{profile.cta}<span aria-hidden="true">↗</span></a>
            <span className="prototype-scroll-note">Листайте, чтобы познакомиться ↓</span>
          </div>
          <figure className="prototype-hero-visual">
            <Image src={prototype.image} alt={id === "auto" ? editorialPhotos.auto["tire-change"].alt : id === "beauty" ? "Светлая студия с пудровым креслом и овальным зеркалом" : id === "medical" ? "Светлый холл с голубыми акцентами" : id === "sports" ? "Пространство для движения с солнечным жёлтым светом" : "Лесной дом с тёплым светом в окнах"} width={1600} height={1000} sizes={id === "stay" ? "(max-width: 1600px) 100vw, 1600px" : "(max-width: 700px) 100vw, (max-width: 1600px) 51vw, 820px"} loading="eager" fetchPriority="high" />
            <figcaption>Визуальная концепция · {prototype.brand}</figcaption>
            <span className="prototype-visual-tag" aria-hidden="true">{id === "sports" ? "В своём темпе." : id === "medical" ? "Ясность с первого шага." : id === "beauty" ? "Маленький ритуал для себя." : id === "stay" ? "Пауза. Лес. Тишина." : "Внимание к каждой детали."}</span>
          </figure>
        </section>

        <div className="prototype-facts" aria-label="О предложении">{profile.facts.map((fact, index) => <div key={fact}><span>0{index + 1}</span>{fact}</div>)}</div>
        <section id="services" className="prototype-section prototype-services" aria-labelledby="offer-title">
          <div className="prototype-section-heading" data-reveal><p className="prototype-kicker">{id === "stay" ? "Место для вашей паузы" : "Начните с выбора"}</p><h2 id="offer-title">{serviceTitle}</h2><p>Демонстрационные цены и состав. {id === "stay" ? "Даты проживания и итоговый тариф согласуются отдельно." : "Детали и время уточняются перед визитом."}</p></div>
          <div className="prototype-service-grid">
            {config.services.map((service, index) => <article className="prototype-service-card" key={service.id} data-reveal>
              <OfferArtwork siteKey={id} serviceId={service.id} index={index}/>
              <span className="prototype-card-index">{service.category}</span>
              <h3>{service.name}</h3>
              <p className="editorial-section-copy">{getOfferStory(id,service.id)?.intro}</p>
              <div className="prototype-price"><strong>{formatPrice(service.price)}</strong><span>{id === "stay" ? "за ночь · ориентир" : service.durationMinutes + " мин · демо"}</span></div>
              <Link aria-label={"Подробнее: "+service.name} href={demoPageHref(id,catalogPage(id).slug)+"/"+service.id}>Подробнее <span aria-hidden="true">↗</span></Link>
            </article>)}
          </div>
          {id === "auto" && <aside className="prototype-related" data-reveal><div><p className="prototype-kicker">Ещё больше деталей</p><h3>Детейлинг как отдельная история.</h3><p>Многостраничный пример OBLIK: программы, портфолио и интерактивная карта автомобиля.</p></div><Link className="prototype-button" href="/demo/detailing">Открыть OBLIK ↗</Link></aside>}
        </section>
        {config.resources.length > 0 && <section className="prototype-section prototype-team" aria-labelledby="team-title" data-reveal>
          <div><p className="prototype-kicker">Личное внимание</p><h2 id="team-title">{id === "sports" ? "Рядом с тренером." : id === "medical" ? "Кто встретит вас." : "Выбор — за вами."}</h2><p>Вымышленные профили. Откройте команду, чтобы сравнить направления и выбрать нужного специалиста.</p></div>
          <div className="prototype-resource-list">{config.resources.map(resource => {
            const [name,role,,key] = people[resource.id];
            const photo = getEditorialPhoto(id,key);
            const team = id === "beauty" ? "team" : id === "sports" ? "coaches" : "specialists";
            return <article key={resource.id}><Image className="prototype-resource-avatar" src={photo.src} alt="" width={64} height={64}/><div><h3><Link href={demoPageHref(id,team)}>{name}</Link></h3><p>{role}</p></div></article>;
          })}</div>
        </section>}
        <section id="approach" className="prototype-section prototype-process" aria-labelledby="process-title">
          <div className="prototype-section-heading" data-reveal><p className="prototype-kicker">От знакомства к действию</p><h2 id="process-title">{profile.processTitle}</h2></div>
          <div className="prototype-process-grid">{profile.steps.map(([title, text], index) => <article key={title} data-reveal><span>0{index + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
        </section>
        <ChoiceGuide id={id} photo link/>
        <PrototypeFAQ items={profile.faq} />
        <section id="booking" className="prototype-section prototype-booking" aria-label={id === "stay" ? "Запрос на обсуждение поездки" : "Демонстрационная заявка"}>
          <div className="prototype-booking-intro" data-reveal><p className="prototype-kicker">Попробуйте сами</p><h2>{id === "stay" ? "Сначала — поговорим." : "Первый шаг — здесь."}</h2><p>{id === "medical" ? "Только организационный запрос. Не вводите симптомы, диагнозы и медицинские документы." : id === "stay" ? "Выберите дом и время обратной связи. Эта форма не бронирует ночи и не принимает оплату." : "Пройдите три шага и получите квитанцию тестовой заявки."}</p><p className="prototype-demo-note">Демо принимает только <strong>+70000000000</strong>. Реальный визит не подтверждается.</p></div>
          <BookingEntry config={withEditorialResourceNames(config)} />
        </section>
      </main>
      <PrototypeFooter brand={prototype.brand} id={id} />
    </PrototypeMotion>
  </div>;
}
