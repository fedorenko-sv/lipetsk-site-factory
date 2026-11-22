import type { Metadata } from "next";
import { EditorialFigure } from "@/features/prototypes/EditorialSections";
import { getEditorialPhoto } from "@/features/prototypes/editorial-photos";
import Link from "next/link";
import { programs, commonQuestions, basePath } from "@/features/detailing/content";
import {
  Breadcrumbs,
  PageIntro,
  QuestionList,
  NextVisit,
} from "@/features/detailing/site/PageParts";
export const metadata: Metadata = {
  title: "Памятки по уходу и ответы · OBLIK",
  description:
    "Общие рекомендации по уходу за плёнкой, лаком, дисками и салоном; ответы перед первым визитом.",
};
export default function Care() {
  return (
    <main className="site-page">
      <section className="dt-shell">
        <Breadcrumbs current="Уход и вопросы" />
        <PageIntro
          title="Уход"
          italic="после ателье."
          text="Небольшие привычки имеют значение: как мыть кузов, обращаться с кромками плёнки и очищать поверхности салона."
        />
        <div className="site-care-grid">
          {programs
            .filter((p) => p.id !== "ppf-full")
            .map((p) => (
              <article key={p.id}>
                <EditorialFigure photo={getEditorialPhoto("detailing",p.id)}/>
                <h2>{p.service.name}</h2>
                <p>{p.care}</p>
                <Link className="site-text-link" href={basePath + "/services/" + p.id}>
                  Об этой программе ↗
                </Link>
              </article>
            ))}
        </div>
        <p className="site-concept-note">
          Это общие ориентиры. Точные интервалы первой мойки, средства и режим ухода зависят от
          реально нанесённого материала: следуйте инструкции производителя и рекомендациям мастера.
        </p>
      </section>
      <section className="site-section dt-shell site-split">
        <h2>
          Перед первым
          <br />
          <em>визитом.</em>
        </h2>
        <QuestionList items={commonQuestions} />
      </section>
      <NextVisit
        title="Есть задача для вашей машины?"
        text="Посмотрите состав программ или оставьте пожелание по визиту. В форме демо используйте только синтетический номер."
      />
    </main>
  );
}
