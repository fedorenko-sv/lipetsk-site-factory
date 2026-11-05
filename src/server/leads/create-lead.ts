/**
 * Сценарий CreateLead (PR3, §6–§9). Чистый от HTTP: не импортирует Next,
 * React и конкретные адаптеры. Часы, конфигурация, хранилище — зависимости.
 *
 * Порядок: сайт -> телефон/контакт -> канон+HMAC -> store.submit, которая
 * под транзакцией: повтор -> текущие проверки (этот модуль) -> лимиты ->
 * вставка. Сохранённый идентичный повтор не зависит от устаревания текущих
 * версии/консента/даты и не расходует лимит.
 */
import type { ApiErrorCode, LeadCreateRequest, SiteConfig } from "../../shared/contracts.ts";
import type { RuntimeConfig, SiteDestination } from "../config/runtime.ts";
import { normalizePhone } from "./phone.ts";
import { checkPreference, parseMoscowInstant } from "./preference.ts";
import { matchServiceSelection, normalizeAttribution, normalizeName } from "./matching.ts";
import { buildCanonical, computePayloadHmac, moscowIso } from "./canonical.ts";
import type { LeadStore, NewLeadDecision, PreparedLeadRow } from "./store-port.ts";
import type { Clock } from "./ports.ts";
import { isKnownAdapterId } from "../notifications/registry.ts";

export interface CreateLeadDeps {
  runtime: RuntimeConfig;
  siteLoader: (siteKey: string) => SiteConfig | null;
  store: LeadStore;
  clock: Clock;
}

export type CreateLeadResult =
  | { kind: "created"; leadId: string }
  | { kind: "replayed"; leadId: string }
  | { kind: "field-error"; code: "VALIDATION_FAILED"; fieldErrors: Record<string, string> }
  | { kind: "error"; code: ApiErrorCode; retryAfterSeconds?: number };

/** Готовность режима: demo требует настроенный recording-адаптер и назначение. */
export function checkModeReady(
  config: SiteConfig,
  destination: SiteDestination | undefined,
  runtime: RuntimeConfig,
): { ok: true } | { ok: false; code: "DEMO_NOT_READY" | "LIVE_NOT_READY" } {
  if (config.mode === "live") {
    // BR4: в согласованном стеке нет ни одного реального канала — recording
    // является только demo-свидетельством. ENABLE_LIVE_LEADS и legal-флаги
    // сами по себе live не открывают: будущий гейт обязан дополнительно
    // проверить реальный канал (не recording), доверенный ingress и
    // утверждённый retention. Telegram/email/CRM не подключались заказчиком.
    void runtime;
    return { ok: false, code: "LIVE_NOT_READY" };
  }
  // BR4: demo-lead допустим только с известным реестру и реально собранным
  // демо-адаптером (сейчас это recording). Гейт в сценарии новой заявки:
  // сохранённый идентичный replay его не проходит (store.shortcut до validateNew).
  if (!destination || !isKnownAdapterId(destination.adapterId)
    || destination.adapterId !== "recording") {
    return { ok: false, code: "DEMO_NOT_READY" };
  }
  return { ok: true };
}

export async function createLead(
  deps: CreateLeadDeps,
  ctx: { idempotencyKey: string; clientHmac: string },
  wire: LeadCreateRequest,
): Promise<CreateLeadResult> {
  const site = deps.siteLoader(wire.siteKey);
  if (!site) return { kind: "error", code: "SITE_NOT_FOUND" };

  const phone = normalizePhone(wire.customer.phone, site.mode);
  if (phone === null) {
    return {
      kind: "field-error",
      code: "VALIDATION_FAILED",
      fieldErrors: { "customer.phone": "Укажите корректный телефон." },
    };
  }

  const nameResult = normalizeName(wire.customer.name);
  if (!nameResult.ok) {
    return {
      kind: "field-error",
      code: "VALIDATION_FAILED",
      fieldErrors: { "customer.name": nameResult.error },
    };
  }

  const destination = deps.runtime.destinations.get(site.id);
  const attribution = normalizeAttribution(wire.attribution, deps.runtime.attributionEnabled);

  // Канон строится по нормализованным полям; эквивалентное форматирование
  // телефона и порядок опций дают одинаковый HMAC (BU20/BU21). Запрошенное
  // время канонизируется чистым парсингом — без проверки актуальности,
  // иначе сохранённый повтор после просрочки даты дал бы ложный конфликт.
  const canonicalPreferredAt = wire.preferred
    ? parseMoscowInstant(wire.preferred.date, wire.preferred.time)
    : null;
  const canonicalPreferred = wire.preferred
    ? canonicalPreferredAt !== null
      ? moscowIso(canonicalPreferredAt)
      : `raw:${wire.preferred.date}|${wire.preferred.time}`
    : null;
  const canonical = buildCanonical({
    siteKey: wire.siteKey,
    configVersion: wire.configVersion,
    kind: wire.kind,
    serviceId: wire.serviceId,
    serviceOptions: wire.serviceOptions,
    resourceId: wire.resourceId ?? null,
    preferredIso: canonicalPreferred,
    phone,
    name: nameResult.name,
    consentVersion: wire.consent.version,
    attribution,
  });
  const payloadHmac = computePayloadHmac(deps.runtime.payloadHmacKey, canonical);

  const validateNew = (): NewLeadDecision => {
    // Текущие проверки новой заявки (для сохранённого повтора не вызываются).
    const mode = checkModeReady(site, destination, deps.runtime);
    if (!mode.ok) return { ok: false, failure: { code: mode.code } };

    const matched = matchServiceSelection(wire, site);
    if (!matched.ok) {
      return { ok: false, failure: { code: "VALIDATION_FAILED", fieldErrors: matched.fieldErrors } };
    }

    if (wire.configVersion !== site.contentVersion) {
      return { ok: false, failure: { code: "CONFIG_CHANGED" } };
    }
    if (wire.consent.version !== site.legal.consentVersion) {
      return { ok: false, failure: { code: "CONSENT_CHANGED" } };
    }

    const preferenceCheck = checkPreference(wire.preferred, site, deps.clock.now());
    if (!preferenceCheck.ok) {
      return {
        ok: false,
        failure: {
          code: "VALIDATION_FAILED",
          fieldErrors: { [preferenceCheck.issue.field]: preferenceCheck.issue.message },
        },
      };
    }

    const now = deps.clock.now();
    const row: PreparedLeadRow = {
      siteKey: site.id,
      configVersion: site.contentVersion,
      kind: "booking",
      serviceId: matched.matched.service.id,
      resourceId: matched.matched.resourceId,
      serviceOptions: matched.matched.serviceOptions,
      preferredAt: preferenceCheck.preferredAt,
      customerPhone: phone,
      customerName: nameResult.name,
      consentVersion: site.legal.consentVersion,
      consentAt: now,
      priceSnapshot: matched.matched.priceSnapshot,
      attribution,
      payloadHmac,
      destinationKey: destination!.destinationKey,
      adapterId: destination!.adapterId,
      createdAt: now,
    };
    return { ok: true, row };
  };

  const outcome = await deps.store.submit({
    siteKey: site.id,
    idempotencyKey: ctx.idempotencyKey,
    payloadHmac,
    clientHmac: ctx.clientHmac,
    clock: deps.clock,
    validateNew,
  });

  switch (outcome.kind) {
    case "created":
      return { kind: "created", leadId: outcome.leadId };
    case "replayed":
      return { kind: "replayed", leadId: outcome.leadId };
    case "conflict":
      return { kind: "error", code: "IDEMPOTENCY_CONFLICT" };
    case "rate-limited":
      return { kind: "error", code: "RATE_LIMITED", retryAfterSeconds: outcome.retryAfterSeconds };
    case "rejected": {
      const failure = outcome.failure;
      if (failure.code === "VALIDATION_FAILED") {
        return { kind: "field-error", code: "VALIDATION_FAILED", fieldErrors: failure.fieldErrors };
      }
      return { kind: "error", code: failure.code };
    }
  }
}
