/**
 * System-контур PR-3 (§17): guard тестового DSN, миграции, test-only секреты
 * в env дочернего процесса (значения не выводятся), Playwright с
 * playwright.system.config.ts (webServer: 127.0.0.1:3023). Завершает только
 * собственные дочерние процессы.
 */
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { assertSafeTestDatabaseUrl } from "../../src/server/config/guards.ts";

const ROOT = process.cwd();
const FIXTURE_DSN = "postgresql://lsf_test:lsf_test_only@127.0.0.1:55543/lsf_test_backend";
const TEST_DSN = assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL || FIXTURE_DSN);
const secret = () => randomBytes(24).toString("hex"); // 48 символов

const childEnv = {
  ...process.env,
  NODE_ENV: "production",
  DATABASE_URL: TEST_DSN,
  ALLOWED_ORIGINS: "http://127.0.0.1:3023",
  ALLOWED_SITE_KEYS: "auto,beauty",
  ENABLE_LIVE_LEADS: "false",
  TRUSTED_IP_HEADER: "X-Test-Client",
  IDEMPOTENCY_HMAC_KEY: secret(),
  RATE_LIMIT_HMAC_KEY: secret(),
  OUTBOX_SECRET: secret(),
  SITE_DESTINATIONS_JSON: JSON.stringify({
    auto: { destinationKey: "demo-auto-v1", version: 1 },
    beauty: { destinationKey: "demo-beauty-v1", version: 1 },
  }),
  NOTIFICATION_DESTINATIONS_JSON: JSON.stringify({
    "demo-auto-v1": { adapterId: "recording" },
    "demo-beauty-v1": { adapterId: "recording" },
  }),
  TEST_DATABASE_URL: TEST_DSN,
  TEST_SYSTEM_BASE_URL: "http://127.0.0.1:3023",
};
childEnv.TEST_OUTBOX_SECRET = childEnv.OUTBOX_SECRET;

const migration = spawnSync(
  process.execPath,
  ["--experimental-strip-types", path.join(ROOT, "scripts", "backend", "migrate.ts")],
  {
    cwd: ROOT,
    stdio: "ignore",
    env: { ...childEnv, DATABASE_URL: TEST_DSN, TEST_DATABASE_URL: TEST_DSN, LSF_MIGRATE_TEST_MODE: "1" },
  },
);
if (migration.status !== 0) {
  console.error("system harness: миграции не применились");
  process.exitCode = 1;
} else {
  const playwrightBin = path.join(ROOT, "node_modules", "@playwright", "test", "cli.js");
  const child = spawn(
    process.execPath,
    [playwrightBin, "test", "--config", "playwright.system.config.ts"],
    { cwd: ROOT, env: childEnv, stdio: "inherit" },
  );
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
  process.on("SIGINT", () => child.kill("SIGTERM"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
}
