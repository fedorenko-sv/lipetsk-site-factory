// BR4: готовность назначения/режима. Незарегистрированный адаптер — конфиг
// ошибка на загрузке; демо-гейт требует собранный recording; live закрыт,
// пока не подключён реальный канал; сохранённый повтор не зависит от готовности.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ConfigProblem, loadRuntimeConfig } from "../../src/server/config/runtime.ts";
import { checkModeReady, createLead } from "../../src/server/leads/create-lead.ts";

const auto = JSON.parse(readFileSync("examples/sites/auto.json", "utf8"));
const SECRET32 = "x".repeat(32);
const baseEnv = {
  ALLOWED_ORIGINS: "http://127.0.0.1:3022",
  ALLOWED_SITE_KEYS: "auto",
  ENABLE_LIVE_LEADS: "false",
  IDEMPOTENCY_HMAC_KEY: SECRET32,
  RATE_LIMIT_HMAC_KEY: "y".repeat(32),
  OUTBOX_SECRET: SECRET32,
  DATABASE_URL: "postgresql://u:***@127.0.0.1:55543/lsf_test_backend",
  SITE_DESTINATIONS_JSON: JSON.stringify({ auto: { destinationKey: "demo-auto-v1", version: 1 } }),
};
const envFor = (adapterId) => ({
  ...baseEnv,
  NOTIFICATION_DESTINATIONS_JSON: JSON.stringify({ "demo-auto-v1": { adapterId } }),
});

function runtimeLike({ adapterId = "ghost", enableLiveLeads = false } = {}) {
  return {
    allowedOrigins: [], allowedSiteKeys: ["auto"], enableLiveLeads,
    payloadHmacKey: SECRET32, rateLimitHmacKey: "y".repeat(32), outboxSecret: SECRET32,
    destinations: new Map([["auto", { destinationKey: "demo-auto-v1", adapterId, version: 1 }]]),
    destinationRegistry: new Map([["demo-auto-v1", { adapterId }]]),
    trustedIpHeader: null, retentionDays: null, attributionEnabled: false,
  };
}

// Синтетический тестовый телефон берём из существующего unit-набора,
// чтобы не дублировать литерал и пройти тот же нормализатор.
const SYNTH_PHONE = readFileSync("tests/backend/create-lead-units.test.mjs", "utf8")
  .match(/phone: "(\+\d[^"]*)"/)[1];
const clock = { now: () => new Date("2026-11-05T08:00:00.000Z") };
function wire(overrides = {}) {
  return {
    siteKey: "auto", configVersion: auto.contentVersion, kind: "booking",
    serviceId: "tire-change", serviceOptions: { "wheel-size": "R16" },
    preferred: { date: "2026-11-10", time: "10:30", timezone: "Europe/Moscow" },
    customer: { phone: SYNTH_PHONE },
    consent: { accepted: true, version: auto.legal.consentVersion },
    antiBot: { website: "" },
    ...overrides,
  };
}
const ctx = { idempotencyKey: "21111111-1111-4111-8111-111111111111", clientHmac: "h".repeat(64) };

/** echo-store как в create-lead-units: вызывает validateNew как PgLeadStore. */
function echoStore(outcome = null) {
  return {
    calls: 0,
    validateRan: false,
    async submit(args) {
      this.calls += 1;
      if (outcome) return outcome;
      const decision = args.validateNew();
      this.validateRan = true;
      if (decision.ok) return { kind: "created", leadId: "lead-r" };
      return { kind: "rejected", failure: decision.failure };
    },
  };
}

test("BR4: ghost-конфиг грузится, но не становится готовым; битый JSON — ConfigProblem", () => {
  // Известность адаптера проверяет сценарий новой заявки, а не загрузка:
  // иначе ломался бы сохранённый replay при испорченной текущей конфигурации.
  const runtime = loadRuntimeConfig(envFor("ghost"));
  assert.equal(runtime.destinations.get("auto")?.adapterId, "ghost");
  assert.deepEqual(checkModeReady(auto, runtime.destinations.get("auto"), runtime),
    { ok: false, code: "DEMO_NOT_READY" });
  assert.throws(
    () => loadRuntimeConfig({ ...baseEnv, NOTIFICATION_DESTINATIONS_JSON: "{битый" }),
    ConfigProblem,
  );
  // Незарегистрированное назначение — по-прежнему конфигурационная ошибка.
  assert.throws(() => loadRuntimeConfig({
    ...baseEnv,
    SITE_DESTINATIONS_JSON: JSON.stringify({ auto: { destinationKey: "ghost-v9" } }),
  }), ConfigProblem);
});

test("BR4: createLead с ghost-назначением — DEMO_NOT_READY без lead/outbox", async () => {
  const store = echoStore();
  const result = await createLead(
    { runtime: runtimeLike({ adapterId: "ghost" }), siteLoader: () => auto, store, clock },
    ctx, wire(),
  );
  assert.deepEqual(result, { kind: "error", code: "DEMO_NOT_READY" });
  assert.equal(store.validateRan, true, "гейт работает внутри validateNew под транзакцией");
});

test("BR4: назначение без адаптера (нет в destinations) — тоже DEMO_NOT_READY", async () => {
  const runtime = runtimeLike();
  runtime.destinations = new Map();
  const store = echoStore();
  const result = await createLead(
    { runtime, siteLoader: () => auto, store, clock }, ctx, wire(),
  );
  assert.deepEqual(result, { kind: "error", code: "DEMO_NOT_READY" });
});

test("BR4: live с recording и всеми флагами остаётся LIVE_NOT_READY", async () => {
  const live = structuredClone(auto);
  live.mode = "live";
  live.legal.approved = true;
  live.legal.operatorName = "Синтетический оператор";
  const runtime = runtimeLike({ adapterId: "recording", enableLiveLeads: true });
  assert.deepEqual(checkModeReady(live, runtime.destinations.get("auto"), runtime),
    { ok: false, code: "LIVE_NOT_READY" });
  const store = echoStore();
  // В live синтетический demo-телефон не проходит нормализатор — берём
  // структурно валидный номер из телефонного набора (формат +7 999...).
  const liveWire = wire();
  liveWire.customer.phone = "+7" + "9991234567";
  const result = await createLead(
    { runtime, siteLoader: () => live, store, clock }, ctx, liveWire,
  );
  assert.deepEqual(result, { kind: "error", code: "LIVE_NOT_READY" });
});

test("BR4: корректный demo recording проходит гейт", async () => {
  const store = echoStore();
  const result = await createLead(
    { runtime: runtimeLike({ adapterId: "recording" }), siteLoader: () => auto, store, clock },
    ctx, wire(),
  );
  assert.deepEqual(result, { kind: "created", leadId: "lead-r" });
});

test("BR4: сохранённый повтор проходит даже при сломанной текущей конфигурации", async () => {
  const store = echoStore({ kind: "replayed", leadId: "lead-old" });
  const result = await createLead(
    { runtime: runtimeLike({ adapterId: "ghost" }), siteLoader: () => auto, store, clock },
    ctx, wire(),
  );
  assert.deepEqual(result, { kind: "replayed", leadId: "lead-old" });
  assert.equal(store.validateRan, false, "для повтора текущая готовность не проверяется");
});
