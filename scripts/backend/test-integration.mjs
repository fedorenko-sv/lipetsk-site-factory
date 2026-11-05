/**
 * Интеграционный harness (PR3, §13). Порядок:
 *  1) guard TEST_DATABASE_URL (loopback + lsf_test_); при провале — выход без SQL;
 *  2) миграции дважды (идемпотентность мигратора additionally проверяет тест BI01);
 *  3) требование свежей сборки (.next/BUILD_ID) — build делает verify:backend;
 *  4) запуск Next на 3022 (рабочий) и 3024 (DATABASE_URL на закрытый порт
 *     для честной проверки 503 STORAGE_UNAVAILABLE, BI09);
 *  5) ожидание HTTP readiness с ограниченным timeout;
 *  6) запуск tests/integration/*.test.mjs;
 *  7) в finally завершение только собственных дочерних процессов.
 * Значения тестовых секретов не выводятся.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { assertSafeTestDatabaseUrl } from "../../src/server/config/guards.ts";

const ROOT = process.cwd();
const FIXTURE_DSN = "postgresql://lsf_test:lsf_test_only@127.0.0.1:55543/lsf_test_backend";
const MAIN_PORT = 3022;
const DOWN_PORT = 3024;
const NEXT_BIN = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");

const TEST_DSN = assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL || FIXTURE_DSN);

const hmacKey = () => randomUUID().replace(/-/g, ""); // 32 символа
const envSecrets = {
  IDEMPOTENCY_HMAC_KEY: process.env.TEST_PAYLOAD_HMAC_KEY || hmacKey(),
  RATE_LIMIT_HMAC_KEY: process.env.TEST_RATE_HMAC_KEY || hmacKey(),
  OUTBOX_SECRET: process.env.TEST_OUTBOX_SECRET || hmacKey(),
};

const destinations = {
  SITE_DESTINATIONS_JSON: JSON.stringify({
    auto: { destinationKey: "demo-auto-v1", version: 1 },
    beauty: { destinationKey: "demo-beauty-v1", version: 1 },
  }),
  NOTIFICATION_DESTINATIONS_JSON: JSON.stringify({
    "demo-auto-v1": { adapterId: "recording" },
    "demo-beauty-v1": { adapterId: "recording" },
  }),
};

function appEnv(port, databaseUrl) {
  return {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: databaseUrl,
    ALLOWED_ORIGINS: `http://127.0.0.1:${port}`,
    ALLOWED_SITE_KEYS: "auto,beauty",
    ENABLE_LIVE_LEADS: "false",
    TRUSTED_IP_HEADER: "X-Test-Client",
    ...envSecrets,
    ...destinations,
  };
}

const logDir = mkdtempSync(path.join(tmpdir(), "lsf-int-"));
const children = [];

function startApp(port, databaseUrl, logName) {
  const logFile = path.join(logDir, logName);
  const stream = createWriteStream(logFile, { flags: "a" });
  const child = spawn(
    process.execPath,
    [NEXT_BIN, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd: ROOT, env: appEnv(port, databaseUrl), stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout.pipe(stream);
  child.stderr.pipe(stream);
  children.push(child);
  return { child, logFile };
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 600) return true;
    } catch {
      /* ещё не готов */
    }
    await delay(500);
  }
  return false;
}

function killTree(child) {
  if (child.killed || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

async function runMigrate(expectApplied) {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", path.join(ROOT, "scripts", "backend", "migrate.ts")],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: TEST_DSN,
        TEST_DATABASE_URL: TEST_DSN,
        LSF_MIGRATE_TEST_MODE: "1",
      },
    },
  );
  if (result.status !== 0) {
    throw new Error(expectApplied ? "миграции не применились" : "повтор миграций упал");
  }
  return result.stdout ?? "";
}

async function main() {
  if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
    console.error("нет свежей сборки: выполните npm run build (часть verify:backend)");
    process.exitCode = 1;
    return;
  }
  await runMigrate(true);
  await runMigrate(false);

  const mainApp = startApp(MAIN_PORT, TEST_DSN, "main.log");
  startApp(DOWN_PORT, "postgresql://lsf_test:lsf_test_only@127.0.0.1:59999/lsf_test_backend", "down.log");
  try {
    if (!(await waitForHttp(`http://127.0.0.1:${MAIN_PORT}/`, 90_000))) {
      throw new Error("основное приложение не поднялось на 3022");
    }
    if (!(await waitForHttp(`http://127.0.0.1:${DOWN_PORT}/`, 90_000))) {
      throw new Error("деградированное приложение не поднялось на 3024");
    }
    const testList = ["tests", "integration"];
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--test",
        // Один PostgreSQL на все сценарии: файлы обязаны идти последовательно.
        "--test-concurrency=1",
        ...["idempotency", "leads-http", "limits", "outbox", "maintenance"].map(
          (name) => path.join(...testList, `${name}.test.mjs`),
        ),
      ],
      {
        cwd: ROOT,
        stdio: "inherit",
        env: {
          ...process.env,
          TEST_BASE_URL: `http://127.0.0.1:${MAIN_PORT}`,
          TEST_BASE_URL_DOWN: `http://127.0.0.1:${DOWN_PORT}`,
          TEST_DATABASE_URL: TEST_DSN,
          TEST_PAYLOAD_HMAC_KEY: envSecrets.IDEMPOTENCY_HMAC_KEY,
          TEST_RATE_LIMIT_HMAC_KEY: envSecrets.RATE_LIMIT_HMAC_KEY,
          TEST_OUTBOX_SECRET: envSecrets.OUTBOX_SECRET,
          TEST_APP_LOG: mainApp.logFile,
          TEST_ALLOWED_ORIGIN: `http://127.0.0.1:${MAIN_PORT}`,
          TEST_NEXT_BIN: NEXT_BIN,
        },
      },
    );
    process.exitCode = result.status ?? 1;
  } finally {
    for (const child of children) killTree(child);
  }
}

main().catch((error) => {
  console.error(`harness: ${error instanceof Error ? error.message : "ошибка"}`);
  for (const child of children) killTree(child);
  process.exitCode = 1;
});
