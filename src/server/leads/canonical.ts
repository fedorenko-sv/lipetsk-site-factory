/**
 * Канонический payload и HMAC для конкурентной идемпотентности (PR3, §9).
 * В канон входят только значимые для повторной заявки поля; requestId,
 * antiBot, серверные timestamps и служебные поля клиента — нет.
 * Не хранить и не логировать открытый digest телефона.
 */
import { createHmac } from "node:crypto";
import type { TimePreference } from "../../shared/contracts.ts";
import { moscowDay } from "./preference.ts";

export interface CanonicalLeadPayload {
  siteKey: string;
  configVersion: string;
  kind: string;
  serviceId: string;
  /** Ключи отсортированы; порядок не зависит от порядка в теле запроса. */
  serviceOptions: Record<string, string>;
  resourceId: string | null;
  /** Московский ISO-момент "YYYY-MM-DDTHH:mm+03:00" или null. */
  preferred: string | null;
  /** Нормализованный +7XXXXXXXXXX. */
  phone: string;
  name: string | null;
  consentVersion: string;
  attribution: Record<string, string> | null;
}

export function sortedOptions(options: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(options).sort()) out[key] = options[key];
  return out;
}

/** ISO-представление московского момента для канона. */
export function moscowIso(preferenceAt: Date): string {
  const shifted = new Date(preferenceAt.getTime() + 3 * 60 * 60 * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  const d = moscowDay(preferenceAt);
  return (
    `${p(d.year, 4)}-${p(d.month)}-${p(d.day)}` +
    `T${p(shifted.getUTCHours())}:${p(shifted.getUTCMinutes())}+03:00`
  );
}

/** Строит канон из уже нормализованных частей. */
export function buildCanonical(input: {
  siteKey: string;
  configVersion: string;
  kind: string;
  serviceId: string;
  serviceOptions: Record<string, string>;
  resourceId: string | null;
  /** Московский ISO-момент или null; строится вне функции (чистый парсинг). */
  preferredIso: string | null;
  phone: string;
  name: string | null;
  consentVersion: string;
  attribution: Record<string, string> | null;
}): CanonicalLeadPayload {
  return {
    siteKey: input.siteKey,
    configVersion: input.configVersion,
    kind: input.kind,
    serviceId: input.serviceId,
    serviceOptions: sortedOptions(input.serviceOptions),
    resourceId: input.resourceId,
    preferred: input.preferredIso,
    phone: input.phone,
    name: input.name,
    consentVersion: input.consentVersion,
    attribution: input.attribution,
  };
}

/** Стабильная JSON-строка: фиксированный порядок ключей объекта канона. */
export function canonicalJson(payload: CanonicalLeadPayload): string {
  const sortedAttribution = ((): Record<string, string> | null => {
    if (payload.attribution === null) return null;
    const source: Record<string, string> = payload.attribution;
    const out: Record<string, string> = {};
    for (const k of Object.keys(source).sort()) out[k] = source[k];
    return out;
  })();
  const ordered = [
    payload.siteKey,
    payload.configVersion,
    payload.kind,
    payload.serviceId,
    Object.entries(payload.serviceOptions), // уже отсортированы
    payload.resourceId,
    payload.preferred,
    payload.phone,
    payload.name,
    payload.consentVersion,
    sortedAttribution,
  ];
  return JSON.stringify(ordered);
}

/** HMAC-SHA256 канона серверным секретом (>=32 символа, отдельный от IP-HMAC). */
export function computePayloadHmac(hmacKey: string, payload: CanonicalLeadPayload): string {
  return createHmac("sha256", hmacKey).update(canonicalJson(payload), "utf8").digest("hex");
}

/** HMAC стабильного ключа клиента (IP) — отдельный секрет, сырой IP не хранить. */
export function computeClientHmac(rateLimitKey: string, rawClientKey: string): string {
  return createHmac("sha256", rateLimitKey).update(rawClientKey, "utf8").digest("hex");
}

export type { TimePreference };
