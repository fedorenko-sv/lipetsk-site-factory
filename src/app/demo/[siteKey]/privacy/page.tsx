import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { autoConfig } from "@/config/sites/auto";

interface Props {
  params: Promise<{ siteKey: string }>;
}

export function generateStaticParams() {
  return [{ siteKey: "auto" }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteKey } = await params;
  if (siteKey !== "auto") return {};

  return {
    title: `Демо-политика конфиденциальности — ${autoConfig.brandName}`,
    robots: { index: false, follow: false },
  };
}

export default async function DemoPrivacyPage({ params }: Props) {
  const { siteKey } = await params;
  if (siteKey !== "auto") notFound();

  return (
    <main className="min-h-screen !max-w-2xl mx-auto px-4 py-12 text-[#f3f4f6]">
      <div className="mb-6">
        <Link
          href="/demo/auto"
          className="text-xs text-amber-400 hover:underline inline-flex items-center gap-1"
        >
          ← Вернуться к предложению
        </Link>
      </div>

      <div className="rounded-lg border border-amber-900/60 bg-amber-950/30 p-4 mb-8 text-xs text-amber-200">
        <strong>Демонстрационный режим.</strong> На данном стенде не собираются и не обрабатываются персональные данные.
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold mb-4 text-white">
        Демонстрационная политика обработки данных
      </h1>

      <div className="space-y-4 text-sm text-[#9ca3af] leading-relaxed">
        <p>
          Версия документа: <code className="text-amber-400">{autoConfig.legal.consentVersion}</code>
        </p>
        <p>
          Данный проект является архитектурным демонстрационным стендом Lipetsk Site Factory для направления «{autoConfig.brandName}».
        </p>
        <p>
          В прототипе не используются реальные персональные данные. Формы отправки заявок в данном релизе не передают сведения внешним операторам или сторонним сервисам.
        </p>
      </div>
    </main>
  );
}

