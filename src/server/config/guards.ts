/**
 * Защитные проверки перед любыми разрушительными действиями (PR3, §13).
 * Harness и CLI обязаны вызвать assertSafeTestDatabaseUrl до очисток.
 */

export class UnsafeDatabaseError extends Error {}

/**
 * Разрешены только loopback-хосты и базы с префиксом lsf_test_.
 * Неверный DSN — ошибка без выполнения SQL.
 */
export function assertSafeTestDatabaseUrl(url: string | undefined): string {
  if (!url) throw new UnsafeDatabaseError("TEST_DATABASE_URL не задан");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafeDatabaseError("TEST_DATABASE_URL не является корректным URL");
  }
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new UnsafeDatabaseError("тестовый DSN разрешён только на 127.0.0.1/localhost");
  }
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!dbName.startsWith("lsf_test_")) {
    throw new UnsafeDatabaseError("тестовая база обязана начинаться с lsf_test_");
  }
  return url;
}

/** Файл экспорта: вне Git checkout и не в самой папке репозитория. */
export function assertExportPathOutsideRepo(outPath: string, repoRoot: string): void {
  const normalizedRoot = repoRoot.replace(/[\\/]+$/, "").toLowerCase();
  const joined = outPath.includes(":") || outPath.startsWith("/") || outPath.startsWith("\\")
    ? outPath
    : `${normalizedRoot}/${outPath}`;
  const normJoined = joined.replace(/[\\/]+/g, "/").toLowerCase();
  const normRoot = normalizedRoot.replace(/[\\/]+/g, "/");
  if (normJoined.startsWith(`${normRoot}/`) || normJoined === normRoot) {
    throw new UnsafeDatabaseError("файл экспорта должен лежать вне папки репозитория");
  }
}
