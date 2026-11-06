"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { SiteConfig } from "@/shared/contracts";
import { formatPrice } from "../client/formatters";
import { isStep2ErrorKey, type BookingState } from "../client/state";

interface ContactStepProps {
  config: SiteConfig;
  state: BookingState;
  onSetPhone: (phone: string) => void;
  onSetName: (name: string) => void;
  onSetConsent: (accepted: boolean) => void;
  onSubmit: () => void;
  onRetry: () => void;
  onReset: () => void;
  onBack: () => void;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
}

function getFieldLabel(key: string): string {
  if (key === "preferred.time") return "Время записи";
  if (key === "preferred.date") return "Дата записи";
  if (key === "preferred") return "Желаемое время";
  if (key === "serviceId") return "Услуга";
  if (key === "resourceId") return "Специалист";
  if (key.startsWith("serviceOptions.")) return "Параметры услуги";
  if (key === "serviceOptions") return "Параметры услуги";
  if (key === "customer.phone") return "Телефон";
  if (key === "customer.name") return "Имя";
  if (key === "consent.accepted") return "Согласие";
  return key;
}

export function ContactStep({
  config,
  state,
  onSetPhone,
  onSetName,
  onSetConsent,
  onSubmit,
  onRetry,
  onReset,
  onBack,
  headingRef,
}: ContactStepProps) {
  const service =
    config.services.find((s) => s.id === state.serviceId) ?? config.services[0];
  const resource = config.resources.find((r) => r.id === state.resourceId);

  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const consentInputRef = useRef<HTMLInputElement | null>(null);
  const step2SummaryRef = useRef<HTMLDivElement | null>(null);
  const globalErrorRef = useRef<HTMLDivElement | null>(null);

  const isSubmitting = state.submitState === "submitting";
  const isSuccess = state.submitState === "received";
  const isError = state.submitState === "error";
  const cooldown = state.cooldownSeconds ?? 0;

  // Filter Step 2 errors returned by server or validation
  const step2Errors = Object.entries(state.fieldErrors).filter(
    ([k, v]) => isStep2ErrorKey(k) && Boolean(v)
  );

  // Focus management on errors
  useEffect(() => {
    if (step2Errors.length > 0) {
      step2SummaryRef.current?.focus();
      return;
    }
    if (state.fieldErrors["customer.phone"]) {
      phoneInputRef.current?.focus();
      return;
    }
    if (state.fieldErrors["customer.name"]) {
      nameInputRef.current?.focus();
      return;
    }
    if (state.fieldErrors["consent.accepted"]) {
      consentInputRef.current?.focus();
      return;
    }
    if (isError && state.submitError) {
      globalErrorRef.current?.focus();
      return;
    }
  }, [state.fieldErrors, state.submitState, isError, step2Errors.length, state.submitError]);

  if (isSuccess && state.submitReceipt) {
    return (
      <div data-testid="contact-step" className="w-full max-w-2xl mx-auto px-4 py-8 sm:px-6 sm:py-12">
        <div
          data-testid="lead-success"
          aria-live="polite"
          className="p-6 sm:p-8 rounded-2xl bg-[var(--success-bg)] border border-[var(--success-border)] text-left"
        >
          <div className="w-12 h-12 rounded-full bg-[var(--success-border)] text-[var(--success-text)] flex items-center justify-center mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl sm:text-3xl font-extrabold text-[var(--text-main)] mb-2 focus:outline-none"
          >
            Заявка получена
          </h1>

          <p className="text-sm sm:text-base text-[var(--text-muted)] mb-4 leading-relaxed">
            {state.submitReceipt.message}
          </p>

          <div className="p-3.5 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] mb-6 text-xs sm:text-sm">
            <span className="text-[var(--text-faint)] block mb-1">Номер вашей заявки:</span>
            <code data-testid="lead-id" className="font-mono font-bold text-[var(--color-accent)] break-all text-sm">
              {state.submitReceipt.leadId}
            </code>
          </div>

          <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] text-xs text-[var(--text-muted)] space-y-1 mb-6">
            <div><strong>Услуга:</strong> {service.name} ({formatPrice(service.price)})</div>
            {resource && <div><strong>Специалист:</strong> {resource.name}</div>}
            {state.preferred && (
              <div><strong>Желаемое время:</strong> {state.preferred.date} в {state.preferred.time} (МСК)</div>
            )}
          </div>

          <button
            type="button"
            onClick={onReset}
            className="w-full min-h-[48px] py-3.5 px-6 rounded-xl font-bold text-sm bg-[var(--color-accent)] hover:opacity-90 text-[var(--color-accent-contrast)] transition-opacity cursor-pointer"
          >
            Оставить ещё одну заявку
          </button>
        </div>
      </div>
    );
  }

  const isConfigChanged = state.submitError?.code === "CONFIG_CHANGED";
  const isConsentChanged = state.submitError?.code === "CONSENT_CHANGED";

  return (
    <div data-testid="contact-step" className="w-full max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-10 pb-32 sm:pb-12">
      {/* Back button */}
      <div className="mb-6">
        <button
          type="button"
          onClick={onBack}
          data-testid="back-to-preference"
          disabled={isSubmitting}
          className="text-sm font-medium text-[var(--color-accent)] hover:underline inline-flex items-center gap-1.5 cursor-pointer min-h-[44px] py-2 disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>Назад к параметрам и времени</span>
        </button>
      </div>

      <header className="mb-8">
        <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-[var(--color-accent)] mb-1">
          Шаг 3 из 3
        </p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-main)] focus:outline-none"
        >
          Контакты и подтверждение
        </h1>
      </header>

      {/* Step 2 Error Summary Banner if server or validation flagged parameters/time */}
      {step2Errors.length > 0 && (
        <div
          ref={step2SummaryRef}
          tabIndex={-1}
          role="alert"
          aria-labelledby="step2-errors-heading"
          data-testid="step2-error-summary"
          className="mb-6 p-4 sm:p-5 rounded-xl bg-[var(--error-bg)] border border-[var(--error-border)] focus:outline-none"
        >
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-[var(--error-text)] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1 text-xs sm:text-sm">
              <h3 id="step2-errors-heading" className="font-semibold text-[var(--error-text)] mb-2">
                Требуется исправить параметры заказа:
              </h3>
              <ul className="text-xs text-[var(--error-text)] space-y-1 mb-3 list-disc list-inside">
                {step2Errors.map(([key, err]) => (
                  <li key={key}>
                    <strong>{getFieldLabel(key)}:</strong> {err}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={onBack}
                data-testid="fix-step2-errors"
                className="py-2 px-3.5 rounded-lg text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-contrast)] hover:opacity-90 transition-opacity cursor-pointer inline-flex items-center gap-1.5"
              >
                <span>← Перейти к исправлению параметров</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Box */}
      <section className="mb-8 p-4 sm:p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]" aria-label="Сводка заявки">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-faint)] mb-3">
          Сводка заявки
        </h2>
        <div className="space-y-2 text-sm text-[var(--text-muted)]">
          <div className="flex justify-between items-baseline gap-2">
            <span className="text-[var(--text-main)] font-medium">{service.name}</span>
            <span className="font-bold text-[var(--color-accent)] whitespace-nowrap">
              {formatPrice(service.price)}
            </span>
          </div>

          {Object.entries(state.serviceOptions).length > 0 && (
            <div className="text-xs text-[var(--text-muted)] flex flex-wrap gap-2 pt-1">
              {Object.entries(state.serviceOptions).map(([optId, val]) => (
                <span key={optId} className="bg-[var(--bg-surface-elevated)] px-2 py-0.5 rounded border border-[var(--border-default)]">
                  {val}
                </span>
              ))}
            </div>
          )}

          {resource && (
            <div className="text-xs pt-1">
              <span className="text-[var(--text-faint)]">Мастер:</span> {resource.name}
            </div>
          )}

          {state.preferred && (
            <div className="text-xs pt-1">
              <span className="text-[var(--text-faint)]">Желаемое время:</span>{" "}
              <strong className="text-[var(--text-main)]">{state.preferred.date} в {state.preferred.time} (МСК)</strong>
            </div>
          )}

          <p className="text-[11px] text-[var(--text-faint)] pt-2 border-t border-[var(--border-default)] leading-relaxed">
            Время является пожеланием. Администратор свяжется с вами для окончательного согласования.
          </p>
        </div>
      </section>

      {/* Contact Form */}
      <section className="mb-8 p-4 sm:p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]">
        <h2 className="text-sm font-semibold text-[var(--text-main)] mb-4">
          Контактные данные
        </h2>

        {/* Demo Warning */}
        {config.mode === "demo" && (
          <div className="mb-5 p-3 rounded-lg bg-[var(--badge-demo-bg)] border border-[var(--badge-demo-border)] text-xs text-[var(--badge-demo-text)]">
            <strong>Демо-режим:</strong> введите синтетический номер <code className="font-bold text-[var(--color-accent)]">+70000000000</code>. Настоящие контакты в демо не принимаются.
          </div>
        )}

        <div className="space-y-4">
          {/* Phone Field */}
          <div>
            <label htmlFor="customer-phone" className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
              Телефон <span className="text-[var(--color-accent)]">*</span>
            </label>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              id="customer-phone"
              ref={phoneInputRef}
              data-testid="customer-phone"
              placeholder="+7 000 000-00-00"
              value={state.customer.phone}
              onChange={(e) => onSetPhone(e.target.value)}
              disabled={isSubmitting}
              aria-invalid={Boolean(state.fieldErrors["customer.phone"])}
              aria-describedby={state.fieldErrors["customer.phone"] ? "err-customer-phone" : undefined}
              className="w-full min-h-[44px] p-3 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-default)] text-[var(--text-main)] placeholder-[var(--text-faint)] focus:border-[var(--color-accent)] focus:outline-none"
            />
            {state.fieldErrors["customer.phone"] && (
              <p id="err-customer-phone" role="alert" className="mt-1.5 text-xs text-[var(--error-text)]">
                {state.fieldErrors["customer.phone"]}
              </p>
            )}
          </div>

          {/* Name Field (optional) */}
          <div>
            <label htmlFor="customer-name" className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
              Имя (необязательно)
            </label>
            <input
              type="text"
              autoComplete="name"
              id="customer-name"
              ref={nameInputRef}
              data-testid="customer-name"
              placeholder="Как к вам обращаться"
              value={state.customer.name ?? ""}
              onChange={(e) => onSetName(e.target.value)}
              disabled={isSubmitting}
              maxLength={80}
              aria-invalid={Boolean(state.fieldErrors["customer.name"])}
              aria-describedby={state.fieldErrors["customer.name"] ? "err-customer-name" : undefined}
              className="w-full min-h-[44px] p-3 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-default)] text-[var(--text-main)] placeholder-[var(--text-faint)] focus:border-[var(--color-accent)] focus:outline-none"
            />
            {state.fieldErrors["customer.name"] && (
              <p id="err-customer-name" role="alert" className="mt-1.5 text-xs text-[var(--error-text)]">
                {state.fieldErrors["customer.name"]}
              </p>
            )}
          </div>

          {/* Consent Checkbox */}
          <div className="pt-2">
            <label htmlFor="consent" className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                id="consent"
                ref={consentInputRef}
                data-testid="consent"
                checked={state.consentAccepted}
                onChange={(e) => onSetConsent(e.target.checked)}
                disabled={isSubmitting}
                aria-invalid={Boolean(state.fieldErrors["consent.accepted"])}
                aria-describedby={state.fieldErrors["consent.accepted"] ? "err-consent" : undefined}
                className="w-5 h-5 mt-0.5 rounded accent-[var(--color-accent)] cursor-pointer shrink-0"
              />
              <span className="text-xs text-[var(--text-muted)] leading-relaxed">
                Согласен на обработку персональных данных в соответствии с{" "}
                <Link
                  href={config.legal.policyPath}
                  target="_blank"
                  className="text-[var(--color-accent)] underline hover:opacity-80"
                >
                  демо-политикой конфиденциальности
                </Link>
                . <span className="text-[var(--color-accent)]">*</span>
              </span>
            </label>
            {state.fieldErrors["consent.accepted"] && (
              <p id="err-consent" role="alert" className="mt-1.5 text-xs text-[var(--error-text)]">
                {state.fieldErrors["consent.accepted"]}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Global Error Banner */}
      {isError && state.submitError && (
        <div
          ref={globalErrorRef}
          tabIndex={-1}
          data-testid="lead-error"
          aria-live="assertive"
          role="alert"
          className="mb-6 p-4 rounded-xl bg-[var(--error-bg)] border border-[var(--error-border)] text-left focus:outline-none"
        >
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-[var(--error-text)] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1 text-xs sm:text-sm">
              <p className="font-semibold text-[var(--error-text)] mb-1">
                {state.submitError.message}
              </p>
              {state.submitError.requestId && (
                <p className="text-[11px] text-[var(--text-faint)] font-mono">
                  ID запроса: {state.submitError.requestId}
                </p>
              )}
              {isConfigChanged && (
                <p className="text-xs text-[var(--text-muted)] mt-2">
                  Параметры сайта или цены изменились на сервере. Пожалуйста, обновите страницу.
                </p>
              )}
              {isConsentChanged && (
                <p className="text-xs text-[var(--text-muted)] mt-2">
                  Версия согласия обновилась. Пожалуйста, повторно подтвердите согласие выше перед отправкой.
                </p>
              )}
              {cooldown > 0 && (
                <p className="text-xs text-[var(--error-text)] mt-2">
                  Повторная попытка будет доступна через {cooldown} с.
                </p>
              )}
            </div>
          </div>

          {/* Action buttons based on error type */}
          {isConfigChanged ? (
            <div className="mt-4 pt-3 border-t border-[var(--error-border)]/50">
              <button
                type="button"
                onClick={() => window.location.reload()}
                data-testid="lead-reload-config"
                className="py-2.5 px-4 rounded-lg font-semibold text-xs bg-[var(--color-accent)] hover:opacity-90 text-[var(--color-accent-contrast)] transition-opacity cursor-pointer"
              >
                Обновить страницу
              </button>
            </div>
          ) : isConsentChanged ? null : (
            <div className="mt-4 pt-3 border-t border-[var(--error-border)]/50">
              <button
                type="button"
                onClick={onRetry}
                data-testid="lead-retry"
                disabled={isSubmitting || cooldown > 0}
                className="py-2.5 px-4 rounded-lg font-semibold text-xs bg-[var(--color-accent)] hover:opacity-90 text-[var(--color-accent-contrast)] transition-opacity disabled:opacity-50 cursor-pointer"
              >
                {cooldown > 0 ? `Подождите ${cooldown} с` : "Повторить отправку"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Primary Submit Button */}
      {(!isError || isConsentChanged) && (
        <div>
          <button
            type="button"
            onClick={onSubmit}
            data-testid="lead-submit"
            disabled={isSubmitting || cooldown > 0}
            className="w-full min-h-[48px] py-3.5 px-6 rounded-xl font-bold text-base bg-[var(--color-accent)] hover:opacity-90 text-[var(--color-accent-contrast)] transition-opacity disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Отправка заявки...</span>
              </>
            ) : cooldown > 0 ? (
              <span>Повтор через {cooldown} с</span>
            ) : (
              <span>Отправить заявку</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
