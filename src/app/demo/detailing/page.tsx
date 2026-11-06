import type { Metadata } from "next";
import { DetailingLanding } from "@/features/detailing/DetailingLanding";
import "@/features/detailing/detailing.css";

export const metadata: Metadata = {
  title: "OBLIK — детейлинг-ателье · демо",
  description:
    "Защита кузова, полировка и уход за салоном. Кинематографичный демонстрационный сайт детейлинг-ателье в Липецке.",
  robots: { index: false, follow: false },
};

export default function DetailingPage() {
  return <DetailingLanding />;
}
