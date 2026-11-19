/* eslint-disable @next/next/no-img-element -- Art-directed local service imagery. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  programs,
  findProgram,
  basePath,
  mediaPath,
  bookingHref,
} from "@/features/detailing/content";
import { Breadcrumbs, ProgramCard, QuestionList } from "@/features/detailing/site/PageParts";
import { ProgramExample } from "@/features/detailing/site/DetailingEditorial";
import { formatPrice } from "@/features/booking/client/formatters";
export const dynamicParams = false;
export function generateStaticParams() {
  return programs.map((p) => ({ serviceId: p.id }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}): Promise<Metadata> {
  const p = findProgram((await params).serviceId);
  return p
    ? { title: p.service.name + " · OBLIK", description: p.summary }
    : { title: "Услуга не найдена · OBLIK" };
}
export default async function ServicePage({ params }: { params: Promise<{ serviceId: string }> }) {
  const p = findProgram((await params).serviceId);
  if (!p) notFound();
  return (
    <main className="site-page site-service">
      <section className="dt-shell">
        <Breadcrumbs current={p.service.name} service />
        <div className="site-service-hero">
          <div>
            <h1>{p.service.name}</h1>
            <p className="site-service-lead">{p.summary}</p>
            <p className="site-service-price">{formatPrice(p.service.price)}</p>
            <p className="site-price-caption">
              Демонстрационная начальная цена.
              <br />
              Точный объём — после осмотра.
            </p>
            <Link className="dt-button" href={bookingHref(p.id)}>
              Выбрать время <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <figure>
            <img
              src={mediaPath + p.image}
              alt={p.alt}
              width="1200"
              height="1000"
              fetchPriority="high"
            />
            <figcaption>Визуализация материала и приёма для концепта OBLIK</figcaption>
          </figure>
        </div>
      </section>
      <section className="site-service-purpose dt-shell">
        <h2>{p.headline}</h2>
        <p>{p.purpose}</p>
      </section>
      <ProgramExample program={p}/>
      <section className="site-included">
        <div className="dt-shell site-split">
          <h2>
            Что входит
            <br />
            <em>в программу.</em>
          </h2>
          <ul>
            {p.includes.map((i) => (
              <li key={i}>
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path d="m5 12 5 5 9-10" strokeWidth="1.5" />
                </svg>
                {i}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="site-section dt-shell site-split">
        <h2>
          Как проходит
          <br />
          <em>работа.</em>
        </h2>
        <ol className="site-process">
          {p.steps.map(([title, text]) => (
            <li key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="site-honest dt-shell">
        <div>
          <h2>
            Что обсудим
            <br />
            <em>до начала.</em>
          </h2>
          <p>{p.limitation}</p>
        </div>
        <div>
          <h3>После выдачи</h3>
          <p>{p.care}</p>
          <Link className="site-text-link" href={basePath + "/care"}>
            Все памятки по уходу <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
      <section className="site-section dt-shell site-split">
        <h2>
          Перед
          <br />
          <em>визитом.</em>
        </h2>
        <QuestionList items={p.faq} />
      </section>
      <section className="site-book-strip dt-shell">
        <div>
          <h2>Начнём с осмотра.</h2>
          <p>
            {p.service.name} · {formatPrice(p.service.price)}
          </p>
        </div>
        <Link className="dt-button" href={bookingHref(p.id)}>
          Выбрать время <span aria-hidden="true">↗</span>
        </Link>
      </section>
      <section className="site-section dt-shell">
        <div className="site-section-title">
          <h2>Можно сочетать.</h2>
          <Link className="site-text-link" href={basePath + "/services"}>
            Все программы ↗
          </Link>
        </div>
        <div className="site-related">
          {p.related
            .map((id) => findProgram(id))
            .filter((x) => x !== undefined)
            .map((item) => (
              <ProgramCard key={item.id} program={item} />
            ))}
        </div>
      </section>
    </main>
  );
}
