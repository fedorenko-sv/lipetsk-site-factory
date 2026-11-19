import type { Metadata } from "next";
import { DetailingScenarios } from "@/features/detailing/site/DetailingEditorial";
import Link from "next/link";
import {
  categories,
  resolveCategory,
  filterPrograms,
  basePath,
} from "@/features/detailing/content";
import {
  Breadcrumbs,
  PageIntro,
  ProgramCard,
  NextVisit,
} from "@/features/detailing/site/PageParts";
export const metadata: Metadata = {
  title: "Программы ухода за автомобилем · OBLIK",
  description:
    "Шесть демонстрационных программ: защитная плёнка, керамика, полировка, уход за дисками и салоном. Состав, ограничения и начальные цены.",
};
export default async function Services({
  searchParams,
}: {
  searchParams: Promise<{ category?: string | string[] }>;
}) {
  const category = resolveCategory((await searchParams).category);
  const visible = filterPrograms(category);
  return (
    <main className="site-page">
      <section className="dt-shell">
        <Breadcrumbs current="Услуги" />
        <PageIntro
          title="Программы"
          italic="для автомобиля."
          text="Защитная плёнка, керамика, полировка и уход за салоном. У каждой программы — состав работ, начальная цена и рекомендации по материалу."
        />
        <nav className="site-filter" aria-label="Фильтр программ">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={basePath + "/services" + (c.id === "all" ? "" : "?category=" + c.id)}
              aria-current={category === c.id ? "true" : undefined}
              scroll={false}
            >
              {c.label}
            </Link>
          ))}
        </nav>
        <p className="site-results" role="status" aria-live="polite">
          {visible.length} из {filterPrograms("all").length} программ · цены демонстрационные
        </p>
        <div className="site-program-grid">
          {visible.map((p) => (
            <ProgramCard key={p.id} program={p} />
          ))}
        </div>
      </section>
      {category === "all" && <DetailingScenarios/>}
      <NextVisit
        title="Не уверены в выборе?"
        text="Сравните плёнку, керамику и полировку на странице цен или начните с пожелания по визиту. Программа уточняется по состоянию машины."
      />
    </main>
  );
}
