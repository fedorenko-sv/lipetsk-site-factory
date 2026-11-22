/* eslint-disable @next/next/no-img-element -- Local photographic plates have intentional crop positions. */
import Link from "next/link";
import { Reveal } from "./Reveal";
import { basePath, bookingHref, mediaPath, type Program } from "../content";
import { formatPrice } from "../../booking/client/formatters";
export function Breadcrumbs({ current, service = false }: { current: string; service?: boolean }) {
  return (
    <nav className="site-breadcrumb" aria-label="Хлебные крошки">
      <Link href={basePath}>Ателье</Link>
      <span aria-hidden="true">/</span>
      {service && (
        <>
          <Link href={basePath + "/services"}>Услуги</Link>
          <span aria-hidden="true">/</span>
        </>
      )}
      <span aria-current="page">{current}</span>
    </nav>
  );
}
export function PageIntro({
  title,
  italic,
  text,
}: {
  title: string;
  italic?: string;
  text: string;
}) {
  return (
    <div className="site-page-intro">
      <h1>
        {title}
        {italic && (
          <>
            <br />
            <em>{italic}</em>
          </>
        )}
      </h1>
      <p>{text}</p>
    </div>
  );
}
export function ProgramCard({ program }: { program: Program }) {
  return (
    <Reveal>
      {" "}
      <article className="site-program" data-category={program.category}>
        <Link
          href={basePath + "/services/" + program.id}
          className="site-program-image"
          aria-label={"Об услуге: " + program.service.name}
        >
          <img
            src={mediaPath + program.image}
            alt={program.alt}
            width="1200"
            height="800"
            loading="lazy"
          />
          <svg
            aria-hidden="true"
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path d="M6 18 18 6M6 6h12v12" strokeWidth="1.4" />
          </svg>
        </Link>
        <div className="site-program-title">
          <h2>
            <Link href={basePath + "/services/" + program.id}>{program.service.name}</Link>
          </h2>
          <p>{formatPrice(program.service.price)}</p>
        </div>
        <p className="site-muted">{program.summary}</p>
        <Link className="site-text-link" href={bookingHref(program.id)}>
          Выбрать время <span aria-hidden="true">↗</span>
        </Link>
      </article>
    </Reveal>
  );
}
export function NextVisit({
  title = "Начнём с вашего автомобиля.",
  text = "Выберите программу и удобное время. После осмотра в действующем ателье согласуют состав и стоимость работ.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <aside className="site-next dt-shell">
      <h2>{title}</h2>
      <div>
        <p>{text}</p>
        <Link className="dt-button" href={bookingHref()}>
          Подобрать программу <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </aside>
  );
}
export function QuestionList({ items }: { items: [string, string][] }) {
  return (
    <div className="site-questions">
      {items.map(([q, a]) => (
        <details key={q}>
          <summary>
            {q}
            <span aria-hidden="true">+</span>
          </summary>
          <p>{a}</p>
        </details>
      ))}
    </div>
  );
}
