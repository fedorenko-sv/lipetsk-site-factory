import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteConfig, getAllSiteKeys } from "@/config/sites";
import { BookingFlow } from "@/features/booking/ui/BookingFlow";

interface Props {
  params: Promise<{ siteKey: string }>;
}

export function generateStaticParams() {
  return getAllSiteKeys().map((siteKey) => ({ siteKey }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteKey } = await params;
  const config = getSiteConfig(siteKey);

  if (!config) {
    return {
      title: "Сайт не найден",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `${config.brandName} — ${config.hero.title}`,
    description: config.hero.subtitle,
    robots: { index: false, follow: false },
  };
}

export default async function DemoSitePage({ params }: Props) {
  const { siteKey } = await params;
  const config = getSiteConfig(siteKey);

  if (!config) {
    notFound();
  }

  return (
    <main className="min-h-screen">
      <BookingFlow config={config} />
    </main>
  );
}
