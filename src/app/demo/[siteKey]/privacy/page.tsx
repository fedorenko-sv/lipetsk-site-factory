import type { Metadata } from "next";
import { DemoFrame } from "@/features/prototypes/DemoPages";
import { getPrototype } from "@/features/prototypes/catalog";
import { notFound } from "next/navigation";
import { getSiteConfig, getAllSiteKeys } from "@/config/sites";
import { estimateConfig } from "@/features/estimate/config";
const resolveConfig = (key: string) => key === "estimate" ? { ...estimateConfig, theme: "editorial" } : getSiteConfig(key);

interface Props {
  params: Promise<{ siteKey: string }>;
}

export function generateStaticParams() {
  return [...getAllSiteKeys(), "estimate"].map((siteKey) => ({ siteKey }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteKey } = await params;
  const config = resolveConfig(siteKey);

  if (!config) {
    return {
      title: "Сайт не найден",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `Демо-политика конфиденциальности — ${config.brandName}`,
    robots: { index: false, follow: false },
  };
}

export default async function DemoPrivacyPage({ params }: Props) {
  const { siteKey } = await params;
  const config = resolveConfig(siteKey);

  if (!config) notFound();

  const prototype = getPrototype(siteKey);
  if (!prototype) notFound();

  return (
    <DemoFrame id={prototype.id} title="Данные в демо" lead="Какие данные нужны для тестовой заявки и что происходит после её отправки." visual={false}>
      <section className="prototype-section prototype-privacy">
        <article>
          <h2>Что можно указать</h2>
          <p className="editorial-section-copy">{siteKey==="estimate" ? "Параметры окна и количество конструкций." : "Услугу, доступные параметры и удобный для связи день и время."} Для проверки формы используйте +70000000000 и вымышленное имя. {siteKey==="medical" && "Не вводите сведения о здоровье, диагнозы или документы."}</p>
        </article>
        <article>
          <h2>Что сохраняется</h2>
          <p className="editorial-section-copy">Тестовая заявка и номер квитанции сохраняются в демонстрационной базе. Проверочный адаптер регистрирует обработку заявки внутри системы.</p>
        </article>
        <article>
          <h2>Что означает квитанция</h2>
          <p className="editorial-section-copy">Квитанция подтверждает сохранение тестовой заявки. В демо нет внешней рассылки, оплаты или подтверждения реального визита, проживания и заказа.</p>
        </article>
        <article>
          <h2>Версия согласия</h2>
          <p className="editorial-section-copy"><code>{config.legal.consentVersion}</code>. Политика относится к демонстрационному сайту «{config.brandName}».</p>
        </article>
      </section>
    </DemoFrame>
  );
}
