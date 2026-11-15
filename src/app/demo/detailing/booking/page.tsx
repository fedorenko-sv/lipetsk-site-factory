import type { Metadata } from "next";
import Link from "next/link";
import { findProgram, programs, bookingHref } from "@/features/detailing/content";
import { Breadcrumbs, PageIntro } from "@/features/detailing/site/PageParts";
import { BookingExperience } from "@/features/detailing/site/BookingExperience";
import { formatPrice } from "@/features/booking/client/formatters";
export const metadata: Metadata = {
  title: "Выбор программы и времени · OBLIK",
  description:
    "Выберите демонстрационную программу ухода за автомобилем и оставьте пожелание по дате и времени.",
};
export default async function Booking({
  searchParams,
}: {
  searchParams: Promise<{ service?: string | string[] }>;
}) {
  const query = await searchParams;
  const program = findProgram(query.service);
  return (
    <main className="site-page site-booking-page">
      <section className="dt-shell">
        <Breadcrumbs current="Запись" />
        {!program && (
          <PageIntro
            title="Внимание"
            italic="вашему автомобилю."
            text="Выберите программу и удобное время. В действующем ателье администратор согласует визит; здесь можно проверить весь путь тестовой заявки."
          />
        )}
        <div className="site-demo-notice">
          <span aria-hidden="true">↗</span>
          <p>
            Это демо. Введите только <strong>+70000000000</strong>, имя можно оставить пустым.
            Реальные сообщения не отправляются, визит не бронируется.
          </p>
        </div>
        {program ? (
          <BookingExperience key={program.id} serviceId={program.id} />
        ) : (
          <section className="site-program-choice" aria-labelledby="choose-program-title">
            <h2 id="choose-program-title">Начните с программы.</h2>
            {query.service !== undefined && (
              <p role="status" className="site-invalid">
                Эта программа не найдена. Выберите одну из доступных ниже.
              </p>
            )}
            <div>
              {programs.map((p) => (
                <Link key={p.id} href={bookingHref(p.id)}>
                  <span>{p.service.name}</span>
                  <span>
                    {formatPrice(p.service.price)} <i aria-hidden="true">↗</i>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
