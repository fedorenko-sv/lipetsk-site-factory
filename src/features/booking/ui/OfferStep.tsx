"use client";

import type { SiteConfig } from "@/shared/contracts";
import { formatPrice } from "../client/formatters";

interface OfferStepProps {
  config: SiteConfig;
  selectedServiceId: string;
  onSelectService: (serviceId: string) => void;
  onNext: () => void;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
}

export function OfferStep({
  config,
  selectedServiceId,
  onSelectService,
  onNext,
  headingRef,
}: OfferStepProps) {
  const selectedService = config.services.find((s) => s.id === selectedServiceId);

  return (
    <div data-testid="offer-step" className="w-full max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-10 pb-32 sm:pb-12">
      {/* Demo notice */}
      <div className="mb-6 rounded-xl border border-[var(--badge-demo-border)] bg-[var(--badge-demo-bg)] p-3.5 sm:p-4 text-xs sm:text-sm text-[var(--badge-demo-text)] flex items-start gap-3">
        <span className="inline-block px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider bg-[var(--color-accent)] text-[var(--color-accent-contrast)] rounded shrink-0">
          Демо
        </span>
        <div className="leading-relaxed">
          <strong>Демонстрационный стенд.</strong> Данные синтетические. Настоящие контакты, отзывы и гарантии в этом прототипе не используются.
        </div>
      </div>

      {/* Brand & Address */}
      <header className="mb-8">
        <div className="flex items-baseline justify-between gap-4 border-b border-[var(--border-default)] pb-4">
          <div>
            <span className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-main)]">
              {config.brandName}
            </span>
            <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-0.5">
              {config.address}
            </p>
          </div>
          <span className="text-[11px] text-[var(--text-faint)] font-mono tracking-tight hidden xs:inline-block">
            {config.contentVersion}
          </span>
        </div>
      </header>

      {/* Hero Offer */}
      <section className="mb-10">
        <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-[var(--color-accent)] mb-2">
          {config.hero.eyebrow}
        </p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl sm:text-4xl font-extrabold tracking-tight text-[var(--text-main)] leading-tight mb-4 focus:outline-none"
        >
          {config.hero.title}
        </h1>
        <p className="text-sm sm:text-base text-[var(--text-muted)] leading-relaxed max-w-xl">
          {config.hero.subtitle}
        </p>
      </section>

      {/* Services List */}
      <section className="mb-8" aria-labelledby="services-heading">
        <div className="flex items-center justify-between mb-4">
          <h2 id="services-heading" className="text-lg sm:text-xl font-semibold text-[var(--text-main)] tracking-tight">
            Услуги и стоимость
          </h2>
          <span className="text-xs text-[var(--text-muted)]">
            Всего: {config.services.length}
          </span>
        </div>

        <div className="grid gap-3 sm:gap-4" role="radiogroup" aria-labelledby="services-heading">
          {config.services.map((service) => {
            const isSelected = service.id === selectedServiceId;
            return (
              <label
                key={service.id}
                htmlFor={`service-radio-${service.id}`}
                className={`block w-full text-left p-4 sm:p-5 rounded-xl border transition-all duration-150 relative cursor-pointer ${
                  isSelected
                    ? "bg-[var(--bg-surface-elevated)] border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
                    : "bg-[var(--bg-surface)] border-[var(--border-default)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-xs font-medium text-[var(--color-accent)] bg-[var(--border-accent)] px-2 py-0.5 rounded">
                        {service.category}
                      </span>
                      <span className="text-xs text-[var(--text-faint)]">
                        ~{service.durationMinutes} мин
                      </span>
                    </div>
                    <div className="text-base sm:text-lg font-medium text-[var(--text-main)] tracking-tight">
                      {service.name}
                    </div>
                    {service.options.length > 0 && (
                      <div className="text-xs text-[var(--text-muted)] mt-2 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[var(--text-faint)]">Параметры:</span>
                        {service.options.map((opt) => (
                          <span
                            key={opt.id}
                            className="bg-[var(--bg-surface-hover)] px-2 py-0.5 rounded text-[var(--text-main)] border border-[var(--border-default)]"
                          >
                            {opt.label} ({opt.values.join(", ")})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="text-right shrink-0 flex flex-col items-end">
                    <div className="text-base sm:text-xl font-bold text-[var(--color-accent)] whitespace-nowrap">
                      {formatPrice(service.price)}
                    </div>
                    <div className="mt-3">
                      <input
                        type="radio"
                        id={`service-radio-${service.id}`}
                        name="serviceId"
                        value={service.id}
                        checked={isSelected}
                        onChange={() => onSelectService(service.id)}
                        data-testid={`service-${service.id}`}
                        className="w-5 h-5 accent-[var(--color-accent)] cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </section>

      {/* Price disclaimer */}
      <section className="mb-10 text-xs sm:text-sm text-[var(--text-muted)] bg-[var(--bg-surface)] p-4 rounded-xl border border-[var(--border-default)] leading-relaxed">
        <div className="flex items-start gap-2.5">
          <svg className="w-4 h-4 text-[var(--color-accent)] mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-semibold text-[var(--text-main)] mb-0.5">Информация о стоимости</p>
            <p>{config.priceDisclaimer}</p>
          </div>
        </div>
      </section>

      {/* Selected service summary */}
      {selectedService && (
        <div className="mb-6 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-between text-xs sm:text-sm">
          <div>
            <span className="text-[var(--text-muted)]">Выбрана услуга:</span>{" "}
            <span className="font-medium text-[var(--text-main)]">{selectedService.name}</span>
          </div>
          <div className="font-bold text-[var(--color-accent)]">
            {formatPrice(selectedService.price)}
          </div>
        </div>
      )}

      {/* Primary CTA (Responsive: sticky bottom on mobile, inline static on desktop) */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[var(--bg-base)]/95 backdrop-blur-md border-t border-[var(--border-default)] z-20 sm:static sm:p-0 sm:bg-transparent sm:border-0 sm:backdrop-blur-none">
        <button
          type="button"
          onClick={onNext}
          data-testid="next-to-preference"
          className="w-full min-h-[48px] py-3.5 px-6 rounded-xl font-bold text-base bg-[var(--color-accent)] hover:opacity-90 text-[var(--color-accent-contrast)] transition-opacity cursor-pointer flex items-center justify-center gap-2"
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
