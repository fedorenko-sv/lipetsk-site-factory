"use client";

import type { SiteConfig } from "@/shared/contracts";
import { BookingFlow } from "@/features/booking/ui/BookingFlow";

export function BookingEntry({ config }: { config: SiteConfig }) {
  return <div className="prototype-booking-host">
    <BookingFlow config={config}
      resourceCopy={config.id === "medical" ? { label: "Выбор специалиста", any: "Без предпочтения", description: "Можно указать демо-специалиста или оставить выбор администратору." } : config.id === "sports" ? { label: "Выбор тренера", any: "Любой тренер программы", description: "Демо-профиль тренера зависит от программы. Группу и время подтверждает администратор." } : undefined} headingLevel={2} focusOnMount={false}
      timeCopy={config.id === "stay" ? {
        title: "Дом и удобное время связи",
        dateLabel: "Дата обратной связи", timeLabel: "Время обратной связи", summaryLabel: "Желаемое время обратной связи",
        description: "Выберите день и время обратной связи. Это не даты заезда и выезда; ночи и доступность обсуждаются отдельно.",
      } : undefined} />
  </div>;
}
