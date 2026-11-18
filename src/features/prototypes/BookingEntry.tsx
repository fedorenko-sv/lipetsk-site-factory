"use client";

import type { SiteConfig } from "@/shared/contracts";
import { BookingFlow } from "@/features/booking/ui/BookingFlow";

export function BookingEntry({ config, initialServiceId, initialResourceId, startAtPreference }: { config: SiteConfig; initialServiceId?:string; initialResourceId?:string; startAtPreference?:boolean }) {
  return <div className="prototype-booking-host">
    <BookingFlow config={config} initialServiceId={initialServiceId} initialResourceId={initialResourceId} startAtPreference={startAtPreference}
      resourceCopy={config.id === "medical" ? { label: "Выбор специалиста", any: "Без предпочтения", description: "Можно указать демо-специалиста или оставить выбор администратору." } : config.id === "sports" ? { label: "Выбор тренера", any: "Любой тренер программы", description: "Демо-профиль тренера зависит от программы. Группу и время подтверждает администратор." } : undefined} headingLevel={2} focusOnMount={false}
      timeCopy={config.id === "stay" ? {
        title: "Дом и удобное время связи",
        dateLabel: "Дата обратной связи", timeLabel: "Время обратной связи", summaryLabel: "Желаемое время обратной связи", durationLabel:"Обсуждение поездки",
        description: "Выберите день и время обратной связи. Это не даты заезда и выезда; ночи и доступность обсуждаются отдельно.",
      } : config.id === "medical" ? { title:"Направление и пожелание по времени", description:"Укажите удобное время. Посещение согласует администратор клиники; медицинские сведения в эту форму не вводят." } : config.id === "sports" ? { title:"Программа, тренер и удобное время", description:"Оставьте пожелание по пробному занятию. Группу и фактическое время подтвердит администратор клуба." } : undefined} />
  </div>;
}
