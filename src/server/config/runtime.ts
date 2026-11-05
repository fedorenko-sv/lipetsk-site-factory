/**
 * Серверная конфигурация: приватный allowlist сайтов, режимы, версионированные
 * назначения уведомлений (PR3, §7, §12). Чтение env и JSON-файлов конфигурации.
 * Импорт не требует доступной БД и секретов; проверка — при вызове сценария.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SiteConfig } from "../../shared/contracts.ts";

export interface SiteDestination {
  destinationKey: string;
  adapterId: string;
  /** Версия назначения неизменяема для уже поставленных в очередь заявок. */
  version: number;
}

export interface RuntimeConfig {
  allowedOrigins: string[];
  allowedSiteKeys: string[];
  enableLiveLeads: boolean;
  /** Секрет HMAC канона заявки, минимум 32 символа. */
  payloadHmacKey: string;
  /** Отдельный секрет HMAC клиентского ключа (IP). */
  rateLimitHmacKey: string;
  outboxSecret: string;
  /** siteKey -> выбранное сервером назначение (клиент его не выбирает). */
  destinations: Map<string, SiteDestination>;
  /** destinationKey -> описание назначения (что известно реестру). */
  destinationRegistry: Map<string, { adapterId: string }>;
  /** Заголовок доверенного ingress для IP; null — IP недоступен. */
  trustedIpHeader: string | null;
  retentionDays: number | null;
  attributionEnabled: boolean;
}

/** Конфигурационная ошибка: безопасный код для 503 + внутреннее пояснение. */
export class ConfigProblem extends Error {
  readonly notReadyCode: "DEMO_NOT_READY" | "LIVE_NOT_READY" | "STORAGE_UNAVAILABLE";
  constructor(code: ConfigProblem["notReadyCode"], reason: string) {
    super(reason);
    this.notReadyCode = code;
  }
}

const MIN_SECRET = 32;

function readSecret(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name];
  if (typeof value !== "string" || value.length < MIN_SECRET) return null;
  return value;
}

function parseJsonMap<T>(raw: string | undefined): Map<string, T> | null {
  if (!raw) return new Map();
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return new Map(Object.entries(parsed as Record<string, T>));
  } catch {
    return null;
  }
}

/** Собирает RuntimeConfig из env. Бросает ConfigProblem при неготовности. */
export function loadRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const allowedOrigins = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const allowedSiteKeys = (env.ALLOWED_SITE_KEYS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const destinationRegistryRaw = parseJsonMap<{ adapterId: string }>(
    env.NOTIFICATION_DESTINATIONS_JSON,
  );
  if (destinationRegistryRaw === null) {
    throw new ConfigProblem("DEMO_NOT_READY", "NOTIFICATION_DESTINATIONS_JSON некорректен");
  }
  const destinationsRaw = parseJsonMap<{ destinationKey?: string; version?: number }>(
    env.SITE_DESTINATIONS_JSON,
  );
  if (destinationsRaw === null) {
    throw new ConfigProblem("DEMO_NOT_READY", "SITE_DESTINATIONS_JSON некорректен");
  }

  const destinations = new Map<string, SiteDestination>();
  for (const [siteKey, entry] of destinationsRaw) {
    const destinationKey = entry?.destinationKey;
    if (typeof destinationKey !== "string" || destinationKey.length === 0) {
      throw new ConfigProblem("DEMO_NOT_READY", `назначение для site ${siteKey} не задано`);
    }
    const known = destinationRegistryRaw.get(destinationKey);
    if (!known) {
      // Неизвестное назначение — конфигурационная ошибка, канал не подставляется.
      throw new ConfigProblem("DEMO_NOT_READY", `неизвестное назначение ${destinationKey}`);
    }
    destinations.set(siteKey, {
      destinationKey,
      adapterId: known.adapterId,
      version: Number.isInteger(entry.version) ? Number(entry.version) : 1,
    });
  }

  const payloadHmacKey = readSecret(env, "IDEMPOTENCY_HMAC_KEY");
  const rateLimitHmacKey = readSecret(env, "RATE_LIMIT_HMAC_KEY");
  const outboxSecretRaw = env.OUTBOX_SECRET ?? "";
  if (!payloadHmacKey || !rateLimitHmacKey || outboxSecretRaw.length < MIN_SECRET) {
    throw new ConfigProblem("STORAGE_UNAVAILABLE", "не заданы серверные секреты");
  }
  if (!env.DATABASE_URL) {
    throw new ConfigProblem("STORAGE_UNAVAILABLE", "DATABASE_URL не задан");
  }

  const retentionRaw = env.LEAD_RETENTION_DAYS;
  const retentionDays = retentionRaw ? Number(retentionRaw) : null;
  if (retentionDays !== null && (!Number.isInteger(retentionDays) || retentionDays < 1)) {
    throw new ConfigProblem("STORAGE_UNAVAILABLE", "LEAD_RETENTION_DAYS некорректен");
  }

  return {
    allowedOrigins,
    allowedSiteKeys,
    enableLiveLeads: env.ENABLE_LIVE_LEADS === "true",
    payloadHmacKey,
    rateLimitHmacKey,
    outboxSecret: outboxSecretRaw,
    destinations,
    destinationRegistry: destinationRegistryRaw,
    trustedIpHeader: env.TRUSTED_IP_HEADER || null,
    retentionDays,
    attributionEnabled: env.ATTRIBUTION_ENABLED === "true",
  };
}

const SITE_CONFIG_CACHE = new Map<string, SiteConfig>();

/**
 * Загрузка конфигурации сайта из утверждённого JSON (examples/sites/<key>.json).
 * Только сервер; клиентские компоненты это не импортируют.
 */
export function loadSiteConfig(siteKey: string): SiteConfig | null {
  const cached = SITE_CONFIG_CACHE.get(siteKey);
  if (cached) return cached;
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(siteKey)) return null;
  const file = path.join(process.cwd(), "examples", "sites", `${siteKey}.json`);
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as SiteConfig;
    if (parsed.id !== siteKey) return null;
    SITE_CONFIG_CACHE.set(siteKey, parsed);
    return parsed;
  } catch {
    return null;
  }
}

/** Разрешённый deployment-ом сайт: allowlist + наличие конфигурации. */
export function resolveAllowedSite(env: NodeJS.ProcessEnv, siteKey: string): SiteConfig | null {
  const allowed = (env.ALLOWED_SITE_KEYS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (!allowed.includes(siteKey)) return null;
  return loadSiteConfig(siteKey);
}
