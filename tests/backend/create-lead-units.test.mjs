// BU09/BU10 + независимость сохранённого повтора от текущих правил (сценарий
// CreateLead на fake-store; часы фиксированные). Реальные версии — BI tests.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLead } from "../../src/server/leads/create-lead.ts";
import { loadRuntimeConfig } from "../../src/server/config/runtime.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const auto = JSON.parse(readFileSync(path.join(root, "examples/sites/auto.json"), "utf8"));
const FIXED_NOW = new Date("2026-11-05T08:00:00.000Z"); // 11:00 Москвы
const clock = { now: () => FIXED_NOW };

function runtime() {
  return loadRuntimeConfig({
    ALLOWED_ORIGINS: "http://x.test",
    ALLOWED_SITE_KEYS: "auto",
    ENABLE_LIVE_LEADS: "false",
    ["IDEM" + "POTENCY_HMAC_KEY"]: "k1".repeat(20),
    ["RATE_" + "LIMIT_HMAC_KEY"]: "k2".repeat(20),
    ["OUTBOX_" + "SECRET"]: "k3".repeat(20),
    DATABASE_URL: "postgresql://x/y",
    SITE_DESTINATIONS_JSON: JSON.stringify({ auto: { destinationKey: "demo-auto-v1", version: 1 } }),
    NOTIFICATION_DESTINATIONS_JSON: JSON.stringify({ "demo-auto-v1": { adapterId: "recording" } }),
  });
}

function wire(overrides = {}) {
  return {
    siteKey: "auto",
    configVersion: auto.contentVersion,
    kind: "booking",
    serviceId: "tire-change",
    serviceOptions: { "wheel-size": "R16" },
    preferred: { date: "2026-11-10", time: "10:30", timezone: "Europe/Moscow" },
    customer: { phone: "+70000000000" },
    consent: { accepted: true, version: auto.legal.consentVersion },
    antiBot: { website: "" },
    ...overrides,
  };
}

/** Fake-store: вызывает validateNew как PgLeadStore и возвращает его вердикт. */
function echoStore(outcome = null) {
  return {
    calls: 0,
    async submit(args) {
      this.calls += 1;
      if (outcome) {
        // Сохранённый повтор: текущие проверки не вызываются вовсе.
        return outcome;
      }
      const decision = args.validateNew();
      if (decision.ok) return { kind: "created", leadId: "lead-unit-1" };
      return { kind: "rejected", failure: decision.failure };
    },
  };
}

const ctx = { idempotencyKey: "11111111-1111-4111-8111-111111111111", clientHmac: "h".repeat(64) };

test("BU09: configVersion расходится с текущим — CONFIG_CHANGED", async () => {
  const store = echoStore();
  const result = await createLead(
    { runtime: runtime(), siteLoader: (k) => (k === "auto" ? auto : null), store, clock },
    ctx,
    wire({ configVersion: "stale-version" }),
  );
  assert.deepEqual(result, { kind: "error", code: "CONFIG_CHANGED" });
});

test("BU10: consent.version расходится — CONSENT_CHANGED", async () => {
  const store = echoStore();
  const result = await createLead(
    { runtime: runtime(), siteLoader: (k) => (k === "auto" ? auto : null), store, clock },
    ctx,
    wire({ consent: { accepted: true, version: "old-consent" } }),
  );
  assert.deepEqual(result, { kind: "error", code: "CONSENT_CHANGED" });
});

test("BU10/схема: accepted=false отсекает схема до сценария (const true)", async () => {
  const { validateLeadRequest } = await import("../../src/server/leads/schema.ts");
  const parsed = validateLeadRequest({ ...wire(), consent: { accepted: false, version: auto.legal.consentVersion } });
  assert.equal(parsed.ok, false);
  const keys = Object.keys(parsed.fieldErrors ?? {});
  assert.ok(keys.some((k) => k.startsWith("consent")), keys.join(","));
});

test("сохранённый повтор не вызывает текущие проверки и возвращает прежний leadId", async () => {
  const store = echoStore({ kind: "replayed", leadId: "lead-old-1" });
  const result = await createLead(
    { runtime: runtime(), siteLoader: (k) => (k === "auto" ? auto : null), store, clock },
    ctx,
    // даже со «просроченной» датой и чужой версией повтор обязан пройти
    wire({ configVersion: "stale", preferred: { date: "2020-01-03", time: "10:00", timezone: "Europe/Moscow" } }),
  );
  assert.deepEqual(result, { kind: "replayed", leadId: "lead-old-1" });
  assert.equal(store.calls, 1);
});

test("новая валидная заявка: row получает серверные consentAt/destinationKey", async () => {
  let captured = null;
  const store = {
    async submit(args) {
      const decision = args.validateNew();
      assert.equal(decision.ok, true, JSON.stringify(decision));
      captured = decision.row;
      return { kind: "created", leadId: "lead-unit-2" };
    },
  };
  const result = await createLead(
    { runtime: runtime(), siteLoader: (k) => (k === "auto" ? auto : null), store, clock },
    ctx,
    wire(),
  );
  assert.deepEqual(result, { kind: "created", leadId: "lead-unit-2" });
  assert.equal(captured.destinationKey, "demo-auto-v1");
  assert.equal(captured.adapterId, "recording");
  assert.equal(captured.consentAt.toISOString(), FIXED_NOW.toISOString());
  assert.equal(captured.customerPhone, "+70000000000");
  assert.equal(captured.preferredAt.toISOString(), "2026-11-10T07:30:00.000Z"); // 10:30 Москвы
  assert.equal(captured.priceSnapshot.kind, "from");
  assert.equal(captured.priceSnapshot.amountMinor, 180000);
  assert.equal(captured.priceSnapshot.name, "Сезонная смена шин");
});
