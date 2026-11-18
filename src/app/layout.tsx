import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Форма и дело — шесть демонстрационных сайтов",
  description: "Демонстрационные сайты для локального бизнеса: выбор услуг, расчёт и синтетическая заявка.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
