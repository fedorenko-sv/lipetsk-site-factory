import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Авто · Демо — подготовка",
  description: "Демонстрационный проект заявки без звонка. Приём заявок ещё не подключён.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
