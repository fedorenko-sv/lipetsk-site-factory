import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSiteConfig, getAllSiteKeys } from "@/config/sites";

interface Props {
  params: Promise<{ siteKey: string }>;
}

export function generateStaticParams() {
  return getAllSiteKeys().map((siteKey) => ({ siteKey }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteKey } = await params;
  const config = getSiteConfig(siteKey);

  if (!config) return {};

  return {
    title: `Демо-политика конфиденциальности — ${config.brandName}`,
    robots: { index: false, follow: false },
  };
}

export default async function DemoPrivacyPage({ params }: Props) {
  const { siteKey } = await params;
  const config = getSiteConfig(siteKey);

  if (!config) notFound();

  const themeClass = config.theme === "editorial" ? "theme-editorial" : "theme-technical";

  return (
    <div className={`min-h-screen ${themeClass}`}>
      <main className="max-w-2xl mx-auto px-4 py-12 text-[var(--text-main)]">
        <div className="mb-6">
          <Link
            href={`/demo/${config.id}`}
            className="text-xs text-[var(--color-accent)] hover:underline inline-flex items-center gap-1"
          >
            ← Вернуться к предложению
          </Link>
        </div>

        <div className="rounded-xl border border-[var(--badge-demo-border)] bg-[var(--badge-demo-bg)] p-4 mb-8 text-xs text-[var(--badge-demo-text)]">
          <strong>Демонстрационный режим.</strong> На данном стенде не собираются и не обрабатываются реальные персональные данные.
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold mb-4 text-[var(--text-main)]">
          Демонстрационная политика обработки данных
        </h1>

        <div className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <p>
            Версия согласия: <code className="text-[var(--color-accent)] font-mono">{config.legal.consentVersion}</code>
          </p>
          <p>
            Данный демонстрационный стенд Lipetsk Site Factory демонстрирует работу формы записи для направления «{config.brandName}».
          </p>
          <p>
            В демонстрационном режиме для тестирования используется номер <code className="text-[var(--color-accent)]">+70000000000</code>. Настоящие персональные данные посетителей не сохраняются в долгосрочные базы и не передаются третьим лицам.
          </p>
        </div>
      </main>
    </div>
  );
}
