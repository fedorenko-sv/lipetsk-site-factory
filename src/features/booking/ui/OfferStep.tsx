"use client";

import type { SiteConfig, SiteService } from "@/config/sites/types";

interface OfferStepProps {
  config: SiteConfig;
  selectedServiceId: string | null;
  onSelectService: (serviceId: string) => void;
  onCtaClick: () => void;
}

export function formatPrice(price: SiteService["price"]): string {
  const rubles = Math.round(price.amountMinor / 100);
  const formattedRubles = new Intl.NumberFormat("ru-RU").format(rubles);

  if (price.kind === "from") {
    return `от ${formattedRubles} ₽`;
  }
  if (price.kind === "range" && price.amountMinorMax) {
    const rublesMax = Math.round(price.amountMinorMax / 100);
    const formattedMax = new Intl.NumberFormat("ru-RU").format(rublesMax);
    return `от ${formattedRubles} до ${formattedMax} ₽`;
  }
  return `${formattedRubles} ₽`;
}

export function OfferStep({
  config,
  selectedServiceId,
  onSelectService,
  onCtaClick,
}: OfferStepProps) {
  const selectedService = config.services.find((s) => s.id === selectedServiceId);

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-10 pb-28 sm:pb-12 text-[#f3f4f6]">
      {/* Demo watermark header */}
      <div className="mb-6 rounded-lg border border-amber-900/60 bg-amber-950/30 p-3 sm:p-4 text-xs sm:text-sm text-amber-200/90 flex items-start gap-2.5">
        <span className="inline-block px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-300 rounded border border-amber-500/30 shrink-0">
          Демо
        </span>
        <div className="leading-relaxed">
          <strong>Демонстрационный стенд.</strong> Данные синтетические. Настоящие контакты, отзывы и гарантии в этом прототипе не используются.
        </div>
      </div>

      {/* Brand & Address */}
      <header className="mb-8">
        <div className="flex items-baseline justify-between gap-4 border-b border-[#2a2e37] pb-4">
          <div>
            <span className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              {config.brandName}
            </span>
            <p className="text-xs sm:text-sm text-[#9ca3af] mt-0.5">
              {config.address}
            </p>
          </div>
          <span className="text-[11px] text-[#6b7280] font-mono tracking-tight hidden xs:inline-block">
            {config.contentVersion}
          </span>
        </div>
      </header>

      {/* Hero Offer */}
      <section className="mb-10">
        <p className="text-xs sm:text-sm font-medium uppercase tracking-wider text-amber-400 mb-2">
          {config.hero.eyebrow}
        </p>
        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight mb-4">
          {config.hero.title}
        </h1>
        <p className="text-sm sm:text-base text-[#9ca3af] leading-relaxed max-w-xl">
          {config.hero.subtitle}
        </p>
      </section>

      {/* Price & Services List */}
      <section className="mb-8" aria-labelledby="services-heading">
        <div className="flex items-center justify-between mb-4">
          <h2 id="services-heading" className="text-lg sm:text-xl font-semibold text-white tracking-tight">
            Услуги и стоимость
          </h2>
          <span className="text-xs text-[#9ca3af]">
            Всего: {config.services.length}
          </span>
        </div>

        <div className="grid gap-3 sm:gap-4" role="radiogroup" aria-label="Список доступных услуг">
          {config.services.map((service) => {
            const isSelected = service.id === selectedServiceId;
            return (
              <button
                type="button"
                key={service.id}
                onClick={() => onSelectService(service.id)}
                role="radio"
                aria-checked={isSelected}
                className={`w-full text-left p-4 sm:p-5 rounded-xl border transition-all duration-150 relative cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400/80 ${
                  isSelected
                    ? "bg-[#1f232b] border-amber-400 shadow-md shadow-amber-500/10"
                    : "bg-[#181a1f] border-[#2a2e37] hover:border-[#3e4450] hover:bg-[#1d2026]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-xs font-medium text-amber-400/90 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                        {service.category}
                      </span>
                      <span className="text-xs text-[#6b7280]">
                        ~{service.durationMinutes} мин
                      </span>
                    </div>
                    <div className="text-base sm:text-lg font-medium text-white tracking-tight">
                      {service.name}
                    </div>
                    {service.options.length > 0 && (
                      <div className="text-xs text-[#9ca3af] mt-2 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[#6b7280]">Параметры:</span>
                        {service.options.map((opt) => (
                          <span key={opt.id} className="bg-[#242730] px-1.5 py-0.5 rounded text-[#cbd5e1] border border-[#32363f]">
                            {opt.label} ({opt.values.join(", ")})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-base sm:text-xl font-bold text-amber-400 whitespace-nowrap">
                      {formatPrice(service.price)}
                    </div>
                    <div className="mt-2 flex justify-end">
                      <span
                        className={`inline-flex items-center justify-center w-5 h-5 rounded-full border transition-colors ${
                          isSelected
                            ? "border-amber-400 bg-amber-400 text-black"
                            : "border-[#4b5563] bg-transparent"
                        }`}
                        aria-hidden="true"
                      >
                        {isSelected && (
                          <svg className="w-3 h-3 fill-current" viewBox="0 0 12 12">
                            <path d="M10.28 2.28 4 8.56 1.72 6.28a.75.75 0 0 0-1.06 1.06l3 3c.3.3.77.3 1.06 0l7-7a.75.75 0 0 0-1.06-1.06Z" />
                          </svg>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Price disclaimer */}
      <section className="mb-10 text-xs sm:text-sm text-[#9ca3af] bg-[#181a1f] p-4 rounded-xl border border-[#2a2e37] leading-relaxed">
        <div className="flex items-start gap-2.5">
          <svg className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-medium text-white mb-0.5">Информация о стоимости</p>
            <p>{config.priceDisclaimer}</p>
          </div>
        </div>
      </section>

      {/* Selected service summary (if any) before CTA */}
      {selectedService && (
        <div className="mb-6 p-3 sm:p-4 rounded-xl bg-[#1b1e24] border border-[#2e333e] flex items-center justify-between text-xs sm:text-sm">
          <div>
            <span className="text-[#6b7280]">Выбрана услуга:</span>{" "}
            <span className="font-medium text-white">{selectedService.name}</span>
          </div>
          <div className="font-semibold text-amber-400">
            {formatPrice(selectedService.price)}
          </div>
        </div>
      )}

      {/* Primary CTA (Desktop & Inline) */}
      <div className="hidden sm:block">
        <button
          type="button"
          onClick={onCtaClick}
          className="w-full py-4 px-6 rounded-xl font-bold text-base bg-amber-400 hover:bg-amber-300 text-stone-950 transition-colors shadow-lg shadow-amber-500/20 active:translate-y-px cursor-pointer flex items-center justify-center gap-2"
        >
          <span>{config.hero.ctaText}</span>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Mobile Sticky CTA Bar */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 p-4 bg-[#121316]/95 backdrop-blur-md border-t border-[#2a2e37] z-20">
        <button
          type="button"
          onClick={onCtaClick}
          className="w-full min-h-[48px] py-3.5 px-5 rounded-xl font-bold text-base bg-amber-400 hover:bg-amber-300 text-stone-950 transition-colors shadow-lg shadow-amber-500/20 active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
        >
          <span>{config.hero.ctaText}</span>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

