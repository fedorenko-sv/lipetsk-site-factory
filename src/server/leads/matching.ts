/**
 * Сопоставление заявки с серверной конфигурацией сайта (PR3, §7).
 * Цена/название/длительность берутся только из конфигурации (snapshot).
 * Клиентская цена схемой не принимается.
 */
import type { LeadCreateRequest, SiteConfig, SiteService } from "../../shared/contracts.ts";

export type FieldErrors = Record<string, string>;

export interface PriceSnapshot {
  kind: "fixed" | "from";
  amountMinor: number;
  currency: "RUB";
  name: string;
  durationMinutes: number;
}

export interface MatchedLead {
  service: SiteService;
  serviceOptions: Record<string, string>;
  resourceId: string | null;
  name: string | null;
  priceSnapshot: PriceSnapshot;
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;

/** Разрешённая attribution: allowlist трёх ключей, каждое значение <= 80. */
export function normalizeAttribution(
  raw: LeadCreateRequest["attribution"],
  enabled: boolean,
): Record<string, string> | null {
  if (!enabled || !raw) return null;
  const out: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = raw[key];
    if (typeof value === "string" && value.length > 0 && value.length <= 80) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Имя: необязательное; если передано — trim 1..80, пробельная строка — ошибка. */
export function normalizeName(
  raw: string | undefined,
): { ok: true; name: string | null } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, name: null };
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 80) {
    return { ok: false, error: "Укажите имя (1–80 символов)." };
  }
  return { ok: true, name: trimmed };
}

/**
 * Проверка услуги/опций/ресурса против конфигурации. Возвращает поле-ошибки
 * в документированных путях (serviceId, serviceOptions.{id}, resourceId).
 */
export function matchServiceSelection(
  wire: LeadCreateRequest,
  config: SiteConfig,
): { ok: true; matched: MatchedLead } | { ok: false; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  const service = config.services.find((s) => s.id === wire.serviceId);
  if (!service) {
    return {
      ok: false,
      fieldErrors: { serviceId: "Услуга недоступна. Обновите страницу." },
    };
  }

  const knownOptions = new Map(service.options.map((o) => [o.id, o]));
  for (const key of Object.keys(wire.serviceOptions)) {
    if (!knownOptions.has(key)) {
      fieldErrors[`serviceOptions.${key}`] = "Параметр не подходит к услуге.";
    }
  }
  for (const option of service.options) {
    const value = wire.serviceOptions[option.id];
    if (value === undefined) {
      if (option.required) {
        fieldErrors[`serviceOptions.${option.id}`] = "Выберите значение параметра.";
      }
      continue;
    }
    if (!option.values.includes(value)) {
      fieldErrors[`serviceOptions.${option.id}`] = "Недопустимое значение параметра.";
    }
  }

  let resourceId: string | null = wire.resourceId ?? null;
  if (resourceId !== null) {
    const resourceExists = config.resources.some((r) => r.id === resourceId);
    const serviceAllows = service.resourceIds.includes(resourceId);
    if (!resourceExists || !serviceAllows) {
      fieldErrors.resourceId = "Ресурс не подходит к выбранной услуге.";
      resourceId = null;
    }
  } else if (config.booking.resourceSelection === "required") {
    fieldErrors.resourceId = "Выберите ресурс.";
  }

  const nameResult = normalizeName(wire.customer.name);
  if (!nameResult.ok) fieldErrors["customer.name"] = nameResult.error;

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return {
    ok: true,
    matched: {
      service,
      serviceOptions: wire.serviceOptions,
      resourceId,
      name: nameResult.ok ? nameResult.name : null,
      priceSnapshot: {
        kind: service.price.kind,
        amountMinor: service.price.amountMinor,
        currency: service.price.currency,
        name: service.name,
        durationMinutes: service.durationMinutes,
      },
    },
  };
}
