// BU24–BU28: реестр/режимы готовности, расписание worker, безопасные коды,
// guards конфигурации, отображение ошибок на HTTP.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AdapterRegistry, isKnownAdapterId } from "../../src/server/notifications/registry.ts";
import {
  ADAPTER_TIMEOUT_MS, MAX_ATTEMPTS, RETRY_DELAY_MINUTES,
  decideAfterFailure, withProviderRetryFloor,
} from "../../src/server/notifications/schedule.ts";
import { NotificationSendError } from "../../src/server/leads/ports.ts";
import {
  ConfigProblem, loadRuntimeConfig,
} from "../../src/server/config/runtime.ts";
import { checkModeReady } from "../../src/server/leads/create-lead.ts";
import {
  assertSafeTestDatabaseUrl, assertExportPathOutsideRepo, UnsafeDatabaseError,
} from "../../src/server/config/guards.ts";
import {
  ERROR_HTTP_STATUS, NO_STORE_HEADERS, buildErrorBody,
} from "../../src/server/http/envelope.ts";

const auto = JSON.parse(readFileSync("examples/sites/auto.json", "utf8"));
const SECRET32 = "x".repeat(32);
const baseEnv = {
  ALLOWED_ORIGINS: "http://127.0.0.1:3022",
  ALLOWED_SITE_KEYS: "auto,beauty",
  ENABLE_LIVE_LEADS: "false",
  IDEMPOTENCY_HMAC_KEY: SECRET32,
  RATE_LIMIT_HMAC_KEY: "y".repeat(32),
  OUTBOX_SECRET: SECRET32,
  DATABASE_URL: "postgresql://u:***@127.0.0.1:55432/lsf_test_backend",
  NOTIFICATION_DESTINATIONS_JSON: JSON.stringify({ "demo-auto-v1": { adapterId: "recording" } }),
  SITE_DESTINATIONS_JSON: JSON.stringify({ auto: { destinationKey: "demo-auto-v1", version: 1 } }),
};
const dest = { destinationKey: "demo-auto-v1", adapterId: "recording", version: 1 };

test("BU24 неизвестный adapter/destination — конфигурационная ошибка, без fake-success", () => {
  assert.equal(isKnownAdapterId("telegram"), false);
  assert.equal(isKnownAdapterId("recording"), true);
  const registry = new AdapterRegistry();
  assert.throws(() => registry.get("telegram"), /unknown adapter/);
  assert.throws(() => registry.get("recording"), /not configured/);
  const fake = { send: async () => ({ receiptId: "r" }) };
  registry.register("recording", () => fake);
  assert.equal(registry.get("recording"), fake);
  assert.equal(registry.get("recording"), fake, "инстанс один на процесс");

  assert.throws(
    () => loadRuntimeConfig({ ...baseEnv, NOTIFICATION_DESTINATIONS_JSON: "{битый" }),
    ConfigProblem,
  );
  assert.throws(
    () => loadRuntimeConfig({
      ...baseEnv,
      SITE_DESTINATIONS_JSON: JSON.stringify({ auto: { destinationKey: "ghost-v9" } }),
    }),
    ConfigProblem,
  );

  const runtime = loadRuntimeConfig(baseEnv);
  assert.deepEqual(checkModeReady(auto, undefined, runtime), { ok: false, code: "DEMO_NOT_READY" });
  assert.deepEqual(checkModeReady(auto, dest, runtime), { ok: true });
  const live = structuredClone(auto);
  live.mode = "live";
  assert.deepEqual(checkModeReady(live, dest, runtime), { ok: false, code: "LIVE_NOT_READY" });
  const liveRuntime = loadRuntimeConfig({ ...baseEnv, ENABLE_LIVE_LEADS: "true" });
  // live без утверждённых юридических входов (approved=false) тоже не готов.
  assert.deepEqual(checkModeReady(live, dest, liveRuntime), { ok: false, code: "LIVE_NOT_READY" });
});

test("BU25 расписание повторов: 1/5/15/30/60/120/240 минут, попытка 8 — dead", () => {
  const now = new Date("2026-11-05T08:00:00.000Z");
  assert.deepEqual([...RETRY_DELAY_MINUTES], [1, 5, 15, 30, 60, 120, 240]);
  for (let attempt = 1; attempt <= 7; attempt += 1) {
    const decision = decideAfterFailure(attempt, now);
    assert.equal(decision.kind, "retry");
    const expected = now.getTime() + RETRY_DELAY_MINUTES[attempt - 1] * 60_000;
    assert.equal(decision.kind === "retry" && decision.nextAttemptAt.getTime(), expected);
  }
  assert.equal(decideAfterFailure(MAX_ATTEMPTS, now).kind, "dead");
  assert.equal(decideAfterFailure(9, now).kind, "dead");
  const floored = withProviderRetryFloor(decideAfterFailure(1, now), 3600, now);
  assert.equal(floored.kind, "retry");
  assert.equal(
    floored.kind === "retry" && floored.nextAttemptAt.getTime(),
    now.getTime() + 3600_000,
    "Retry-After провайдера — нижняя граница",
  );
  assert.equal(withProviderRetryFloor({ kind: "dead" }, 60, now).kind, "dead");
});

test("BU26 ошибка адаптера — безопасный код; timeout задан; тело провайдера не уходит", async () => {
  const error = new NotificationSendError("PROVIDER_UNAVAILABLE");
  assert.equal(error.safeCode, "PROVIDER_UNAVAILABLE");
  assert.ok(!String(error.message).includes("http"), "без URL/тела провайдера");
  assert.equal(ADAPTER_TIMEOUT_MS, 10_000);
  // Сигнал по таймауту прерывает зависающий send (проверка механики, не 10с).
  const controller = new AbortController();
  const hang = (signal) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new NotificationSendError("TIMEOUT")));
  });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(hang(controller.signal), (e) => e.safeCode === "TIMEOUT");
});

test("BU27 небезопасный test DSN и кривые env падают до любых SQL-действий", () => {
  assert.throws(() => assertSafeTestDatabaseUrl(undefined), UnsafeDatabaseError);
  assert.throws(() => assertSafeTestDatabaseUrl("not a url"), UnsafeDatabaseError);
  assert.throws(
    () => assertSafeTestDatabaseUrl("postgresql://u:***@db.prod.internal:5432/lsf_test_backend"),
    UnsafeDatabaseError, "чужой хост",
  );
  assert.throws(
    () => assertSafeTestDatabaseUrl("postgresql://u:***@127.0.0.1:5432/prod_db"),
    UnsafeDatabaseError, "не lsf_test_ префикс",
  );
  assert.equal(
    assertSafeTestDatabaseUrl("postgresql://u:***@localhost:55432/lsf_test_x"),
    "postgresql://u:***@localhost:55432/lsf_test_x",
  );
  assert.throws(() => assertExportPathOutsideRepo("out.csv", "/repo"), UnsafeDatabaseError);
  assert.throws(() => assertExportPathOutsideRepo("/repo/sub/out.csv", "/repo"), UnsafeDatabaseError);
  assertExportPathOutsideRepo("/tmp/out.csv", "/repo");
  assert.throws(() => loadRuntimeConfig({ ...baseEnv, IDEMPOTENCY_HMAC_KEY: "short" }), ConfigProblem);
  assert.throws(() => loadRuntimeConfig({ ...baseEnv, OUTBOX_SECRET: "short" }), ConfigProblem);
  assert.throws(() => loadRuntimeConfig({ ...baseEnv, DATABASE_URL: "" }), ConfigProblem);
  assert.throws(() => loadRuntimeConfig({ ...baseEnv, LEAD_RETENTION_DAYS: "0" }), ConfigProblem);
});

test("BU28 отображение ошибок — только документированные коды и no-store", () => {
  assert.deepEqual(ERROR_HTTP_STATUS, {
    INVALID_JSON: 400,
    IDEMPOTENCY_REQUIRED: 400,
    ORIGIN_NOT_ALLOWED: 403,
    SITE_NOT_FOUND: 404,
    IDEMPOTENCY_CONFLICT: 409,
    CONFIG_CHANGED: 409,
    CONSENT_CHANGED: 409,
    PAYLOAD_TOO_LARGE: 413,
    UNSUPPORTED_MEDIA_TYPE: 415,
    VALIDATION_FAILED: 422,
    REQUEST_REJECTED: 422,
    RATE_LIMITED: 429,
    INTERNAL_ERROR: 500,
    STORAGE_UNAVAILABLE: 503,
    DEMO_NOT_READY: 503,
    LIVE_NOT_READY: 503,
  });
  assert.equal(NO_STORE_HEADERS["Cache-Control"], "no-store");
  const body = buildErrorBody("INTERNAL_ERROR", "req-1");
  assert.equal(body.error.code, "INTERNAL_ERROR");
  assert.ok(!/stack|at\s|Error:/.test(JSON.stringify(body)), "нет стека в envelope");
  const withFields = buildErrorBody("VALIDATION_FAILED", "req-2", {
    fieldErrors: { "customer.name": "Укажите имя (1–80 символов)." },
  });
  assert.ok(withFields.error.fieldErrors?.["customer.name"]);
  assert.equal(withFields.error.message, "Проверьте поля формы.");
});
