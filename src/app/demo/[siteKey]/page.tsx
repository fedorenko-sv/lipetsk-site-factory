import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { autoConfig } from "@/config/sites/auto";
import { BookingFlow } from "@/features/booking/ui/BookingFlow";

interface Props {
  params: Promise<{ siteKey: string }>;
}

export function generateStaticParams() {
  return [{ siteKey: "auto" }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteKey } = await params;
  if (siteKey !== "auto") {
    return {};
  }

  return {
    title: `${autoConfig.brandName} — ${autoConfig.hero.title}`,
    description: autoConfig.hero.subtitle,
    robots: { index: false, follow: false },
  };
}

export default async function DemoSitePage({ params }: Props) {
  const { siteKey } = await params;

  if (siteKey !== "auto") {
    notFound();
  }

  return (
    <main className="min-h-screen !max-w-none !p-0 !m-0 bg-[#121316]">
      <BookingFlow config={autoConfig} />
    </main>
  );
}

