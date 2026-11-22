/**
 * Защитные проверки перед любыми разрушительными действиями (PR3, §13, BR2/BR3).
 * Harness и CLI обязаны вызвать assertSafeTestDatabaseUrl до очисток.
 * Проверяется эффективная цель соединения так, как её разберёт драйвер:
 * query-параметры не должны перенаправлять соединение за loopback или в другую БД.
 */
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

export class UnsafeDatabaseError extends Error {}

const ALLOWED_TEST_PROTOCOLS = new Set(["postgresql:", "postgres:"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);
/** libpq-параметры, способные сменить эффективный target соединения. */
const REDIRECTING_PARAMS = new Set(["host", "hostaddr", "port", "dbname", "database"]);

export interface EffectiveTarget {
  host: string;
  port: number;
  database: string;
}

/**
 * Разбирает DSN так, как его трактует pg-драйвер (libpq: conninfo-параметры
 * URI-query имеют приоритет над URI-компонентами). Любой параметр, способный
 * перенаправить target, запрещён — эффективные host/port/database обязаны
 * совпадать с URI-компонентами. Отказ бросается до любых SQL и подключений.
 */
export function effectiveTestTarget(raw: string | undefined): EffectiveTarget {
  if (!raw) throw new UnsafeDatabaseError("TEST_DATABASE_URL не задан");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new UnsafeDatabaseError("TEST_DATABASE_URL не является корректным URL");
  }
  if (!ALLOWED_TEST_PROTOCOLS.has(parsed.protocol)) {
    throw new UnsafeDatabaseError("тестовый DSN допускает только протокол PostgreSQL");
  }
  if (parsed.hostname.includes(",")) {
    throw new UnsafeDatabaseError("несколько host в тестовом DSN запрещены");
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new UnsafeDatabaseError("тестовый DSN разрешён только на 127.0.0.1/localhost");
  }
  // Дубликаты query-ключей и libpq-алиасы (host, hostaddr, port, dbname)
  // запрещены: драйвер выбрал бы одно значение, а проверка видела бы другое.
  const seenKeys = new Set<string>();
  for (const [key] of parsed.searchParams.entries()) {
    const lower = key.toLowerCase();
    if (seenKeys.has(lower)) {
      throw new UnsafeDatabaseError(`дублированный query-параметр ${key} в тестовом DSN`);
    }
    seenKeys.add(lower);
    if (REDIRECTING_PARAMS.has(lower)) {
      throw new UnsafeDatabaseError(`query-параметр ${key} не может переопределять цель тестового DSN`);
    }
  }
  const port = parsed.port === "" ? 5432 : Number(parsed.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new UnsafeDatabaseError("некорректный порт в тестовом DSN");
  }
  const segments = parsed.pathname.split("/").filter((s) => s.length > 0);
  if (segments.length !== 1) {
    throw new UnsafeDatabaseError("тестовый DSN обязан указывать ровно одну базу");
  }
  const database = decodeURIComponent(segments[0] ?? "");
  if (!database.startsWith("lsf_test_")) {
    throw new UnsafeDatabaseError("тестовая база обязана начинаться с lsf_test_");
  }
  return { host: parsed.hostname, port, database };
}

/** Разрешены только loopback PostgreSQL и базы с префиксом lsf_test_. */
export function assertSafeTestDatabaseUrl(url: string | undefined): string {
  if (!url) throw new UnsafeDatabaseError("TEST_DATABASE_URL не задан");
  effectiveTestTarget(url);
  return url;
}

/** Один и тот же эффективный target у двух строк подключения? */
export function sameEffectiveTarget(a: string, b: string): boolean {
  const ta = effectiveTestTarget(a);
  const tb = effectiveTestTarget(b);
  return ta.host === tb.host && ta.port === tb.port && ta.database === tb.database;
}

/**
 * Нормализует путь, разрешая симлинки/junction у ближайшего существующего
 * предка: ссылка снаружи, ведущая внутрь checkout, даёт реальный внутренний
 * путь, который затем отклоняется границей.
 */
function resolveRealPath(target: string): string {
  let current = path.resolve(target);
  const missing: string[] = [];
  while (!existsSync(current)) {
    missing.unshift(path.basename(current));
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  let real = current;
  try {
    real = realpathSync(current);
  } catch {
    // нет доступа к realpath — работаем с разрешённым путём
  }
  return missing.length > 0 ? path.resolve(real, ...missing.reverse()) : real;
}

const caseFold = (): boolean => process.platform === "win32" || process.platform === "darwin";

/**
 * Файл экспорта: вне Git checkout. Сначала фактический нормализованный
 * абсолютный путь (dot segments, симлинки/junction), затем проверка границы.
 * Возвращает разрешённый путь — CLI обязан писать именно в него.
 */
export function assertExportPathOutsideRepo(outPath: string, repoRoot: string): string {
  const rootReal = resolveRealPath(repoRoot);
  const targetReal = resolveRealPath(outPath);
  const fold = caseFold();
  const target = fold ? targetReal.toLowerCase() : targetReal;
  const root = fold ? rootReal.toLowerCase() : rootReal;
  if (target === root || target.startsWith(root + path.sep)) {
    throw new UnsafeDatabaseError("файл экспорта должен лежать вне папки репозитория");
  }
  return targetReal;
}
