"use client";

import { useEffect, useRef } from "react";
import type { SiteConfig } from "@/shared/contracts";
import { formatPrice } from "../client/formatters";
import {
  getDateBounds,
  getAvailableTimeSlots,
  isDateWorkingDay,
} from "../client/dateTime";
import type { BookingState } from "../client/state";

interface PreferenceStepProps {
  config: SiteConfig;
  state: BookingState;
  onSelectService: (serviceId: string) => void;
  onSetOption: (optionId: string, value: string) => void;
  onSetResource: (resourceId?: string) => void;
  onSetDate: (date: string) => void;
  onSetTime: (time: string) => void;
  onBack: () => void;
  onNext: () => void;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
}

export function PreferenceStep({
  config,
  state,
  onSelectService,
  onSetOption,
  onSetResource,
  onSetDate,
  onSetTime,
  onBack,
  onNext,
  headingRef,
}: PreferenceStepProps) {
  const currentService =
    config.services.find((s) => s.id === state.serviceId) ?? config.services[0];

  const serviceRef = useRef<HTMLSelectElement | null>(null);
  const resourceRef = useRef<HTMLSelectElement | null>(null);
  const dateRef = useRef<HTMLInputElement | null>(null);
  const timeRef = useRef<HTMLSelectElement | null>(null);

  const { minDate, maxDate } = getDateBounds(config.booking.horizonDays);
  const availableSlots = state.preferred?.date
    ? getAvailableTimeSlots(state.preferred.date, config.booking)
    : [];

  const isWorking = state.preferred?.date
    ? isDateWorkingDay(state.preferred.date, config.booking.workingHours.days)
    : true;

  // Available resources for selected service
  const availableResources = config.resources.filter((r) =>
    currentService.resourceIds.includes(r.id)
  );

  // Focus management on step 2 errors
  useEffect(() => {
    if (state.fieldErrors["preferred.time"]) {
      timeRef.current?.focus();
      return;
    }
    if (state.fieldErrors["preferred.date"] || state.fieldErrors["preferred"]) {
      dateRef.current?.focus();
      return;
    }
    if (state.fieldErrors["resourceId"]) {
      resourceRef.current?.focus();
      return;
    }
    if (state.fieldErrors["serviceId"]) {
      serviceRef.current?.focus();
      return;
    }
    for (const key of Object.keys(state.fieldErrors)) {
      if (key.startsWith("serviceOptions.")) {
        const optId = key.replace("serviceOptions.", "");
        const el = document.getElementById(`option-${optId}`);
        if (el) {
          el.focus();
          return;
        }
      }
    }
  }, [state.fieldErrors]);

  return (
    <div data-testid="preference-step" className="w-full max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-10 pb-32 sm:pb-12">
      {/* Back button */}
      <div className="mb-6">
        <button
          type="button"
          onClick={onBack}
          data-testid="back-to-offer"
          className="text-sm font-medium text-[var(--color-accent)] hover:underline inline-flex items-center gap-1.5 cursor-pointer min-h-[44px] py-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>Назад к списку услуг</span>
        </button>
      </div>

      <header className="mb-8">
        <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-[var(--color-accent)] mb-1">
          Шаг 2 из 3
        </p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-main)] focus:outline-none"
        >
          Параметры и удобное время
        </h1>
      </header>

      {/* Service selection dropdown */}
      <section className="mb-6 p-4 sm:p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]">
        <label htmlFor="service-selector" className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
          Выбранная услуга
        </label>
        <select
          id="service-selector"
          ref={serviceRef}
          value={state.serviceId}
          onChange={(e) => onSelectService(e.target.value)}
          aria-invalid={Boolean(state.fieldErrors["serviceId"])}
          aria-describedby={state.fieldErrors["serviceId"] ? "err-service" : undefined}
          className="w-full min-h-[44px] p-3 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-default)] text-[var(--text-main)] font-medium focus:border-[var(--color-accent)] focus:outline-none"
        >
          {config.services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({formatPrice(s.price)})
            </option>
          ))}
        </select>
        {state.fieldErrors["serviceId"] && (
          <p id="err-service" role="alert" className="mt-1.5 text-xs text-[var(--error-text)]">
            {state.fieldErrors["serviceId"]}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>Категория: {currentService.category}</span>
          <span>Длительность: ~{currentService.durationMinutes} мин</span>
        </div>
      </section>

      {/* Service Options (e.g., wheel-size) */}
      {currentService.options.length > 0 && (
        <section className="mb-6 p-4 sm:p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]">
          <h2 className="text-sm font-semibold text-[var(--text-main)] mb-3">
            Параметры услуги
          </h2>
          <div className="space-y-4">
            {currentService.options.map((option) => {
              const optionError = state.fieldErrors[`serviceOptions.${option.id}`];
              return (
                <div key={option.id}>
                  <label
                    htmlFor={`option-${option.id}`}
                    className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
                  >
                    {option.label} {option.required && <span className="text-[var(--color-accent)]">*</span>}
                  </label>
                  <select
                    id={`option-${option.id}`}
                    data-testid={`service-option-${option.id}`}
                    value={state.serviceOptions[option.id] ?? ""}
                    onChange={(e) => onSetOption(option.id, e.target.value)}
                    aria-invalid={Boolean(optionError)}
                    aria-describedby={optionError ? `err-opt-${option.id}` : undefined}
                    className="w-full min-h-[44px] p-3 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-default)] text-[var(--text-main)] focus:border-[var(--color-accent)] focus:outline-none"
                  >
                    <option value="">Выберите {option.label.toLowerCase()}</option>
                    {option.values.map((val) => (
                      <option key={val} value={val}>
                        {val}
                      </option>
                    ))}
                  </select>
                  {optionError && (
                    <p id={`err-opt-${option.id}`} role="alert" className="mt-1.5 text-xs text-[var(--error-text)]">
                      {optionError}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Resource Selection */}
      {config.booking.resourceSelection !== "hidden" && availableResources.length > 0 && (
        <section className="mb-6 p-4 sm:p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]">
          <label htmlFor="resource-select" className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
            Специалист / Мастер
          </label>
          <p className="text-xs text-[var(--text-faint)] mb-2.5">
            При выборе «Любой мастер» заявка будет распределена свободно.
          </p>
          <select
            id="resource-select"
            ref={resourceRef}
            data-testid="resource-select"
            value={state.resourceId ?? ""}
            onChange={(e) => onSetResource(e.target.value ? e.target.value : undefined)}
            aria-invalid={Boolean(state.fieldErrors["resourceId"])}
            aria-describedby={state.fieldErrors["resourceId"] ? "err-resource" : undefined}
            className="w-full min-h-[44px] p-3 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-default)] text-[var(--text-main)] focus:border-[var(--color-accent)] focus:outline-none"
          >
            <option value="">Любой мастер</option>
            {availableResources.map((res) => (
              <option key={res.id} value={res.id}>
                {res.name}
              </option>
            ))}
          </select>
          {state.fieldErrors["resourceId"] && (
            <p id="err-resource" role="alert" className="mt-1.5 text-xs text-[var(--error-text)]">
              {state.fieldErrors["resourceId"]}
            </p>
          )}
        </section>
      )}

      {/* Date & Time Preference */}
      <section className="mb-8 p-4 sm:p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]">
        <h2 className="text-sm font-semibold text-[var(--text-main)] mb-1">
          Предпочтительное время
        </h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          Выберите удобное время — мастер подтвердит при звонке.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Date Picker */}
          <div>
            <label htmlFor="preferred-date" className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
              Дата <span className="text-[var(--color-accent)]">*</span>
            </label>
            <input
              type="date"
              id="preferred-date"
              ref={dateRef}
              data-testid="preferred-date"
              min={minDate}
              max={maxDate}
              value={state.preferred?.date ?? ""}
              onChange={(e) => onSetDate(e.target.value)}
              aria-invalid={Boolean(state.fieldErrors["preferred.date"] || state.fieldErrors["preferred"])}
              aria-describedby={
                state.fieldErrors["preferred.date"]
                  ? "err-preferred-date"
                  : state.fieldErrors["preferred"]
                  ? "err-preferred"
                  : undefined
              }
              className="w-full min-h-[44px] p-3 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-default)] text-[var(--text-main)] focus:border-[var(--color-accent)] focus:outline-none"
            />
            {state.fieldErrors["preferred.date"] && (
              <p id="err-preferred-date" role="alert" className="mt-1.5 text-xs text-[var(--error-text)]">
                {state.fieldErrors["preferred.date"]}
              </p>
            )}
            {!isWorking && state.preferred?.date && (
              <p role="alert" className="mt-1.5 text-xs text-[var(--error-text)]">
                Выбран выходной день. Пожалуйста, выберите рабочую дату.
              </p>
            )}
          </div>

          {/* Time Picker */}
          <div>
            <label htmlFor="preferred-time" className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
              Время (желаемое) <span className="text-[var(--color-accent)]">*</span>
            </label>
            <select
              id="preferred-time"
              ref={timeRef}
              data-testid="preferred-time"
              value={state.preferred?.time ?? ""}
              onChange={(e) => onSetTime(e.target.value)}
              disabled={!state.preferred?.date || availableSlots.length === 0}
              aria-invalid={Boolean(state.fieldErrors["preferred.time"])}
              aria-describedby={state.fieldErrors["preferred.time"] ? "err-preferred-time" : undefined}
              className="w-full min-h-[44px] p-3 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-default)] text-[var(--text-main)] focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-50"
            >
              {!state.preferred?.date ? (
                <option value="">Сначала укажите дату</option>
              ) : availableSlots.length === 0 ? (
                <option value="">Нет доступных слотов</option>
              ) : (
                <>
                  <option value="">Выберите время</option>
                  {availableSlots.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </>
              )}
            </select>
            {state.fieldErrors["preferred.time"] && (
              <p id="err-preferred-time" role="alert" className="mt-1.5 text-xs text-[var(--error-text)]">
                {state.fieldErrors["preferred.time"]}
              </p>
            )}
          </div>
        </div>

        {state.fieldErrors["preferred"] && (
          <p id="err-preferred" role="alert" className="mt-3 text-xs text-[var(--error-text)]">
            {state.fieldErrors["preferred"]}
          </p>
        )}
      </section>

      {/* Navigation Buttons */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onNext}
          data-testid="next-to-contact"
          className="w-full min-h-[48px] py-3.5 px-6 rounded-xl font-bold text-base bg-[var(--color-accent)] hover:opacity-90 text-[var(--color-accent-contrast)] transition-opacity cursor-pointer flex items-center justify-center gap-2"
        >
          <span>Перейти к контактам</span>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
