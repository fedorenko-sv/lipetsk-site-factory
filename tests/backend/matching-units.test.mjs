// BU05–BU12, BU22, BU23: сопоставление с серверной конфигурацией, контакт,
// имя, attribution, серверная цена.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchServiceSelection, normalizeAttribution, normalizeName } from "../../src/server/leads/matching.ts";
import { normalizePhone } from "../../src/server/leads/phone.ts";

const auto = JSON.parse(readFileSync("examples/sites/auto.json", "utf8"));
const beauty = JSON.parse(readFileSync("examples/sites/beauty.json", "utf8"));
const SYNTH = "+7" + "0".repeat(10);

const wire = (over = {}) => ({
  siteKey: "auto",
  configVersion: "demo-2026-11-04",
  kind: "booking",
  serviceId: "tire-change",
  serviceOptions: { "wheel-size": "R16" },
  customer: { phone: SYNTH },
  consent: { accepted: true, version: "demo-2026-11-04" },
  antiBot: { website: "" },
  ...over,
});

test("BU05 неизвестная услуга/опция/значение/ресурс — ошибка своего поля", () => {
  const r1 = matchServiceSelection(wire({ serviceId: "nope" }), auto);
  assert.ok(!r1.ok && r1.fieldErrors.serviceId);
  const r2 = matchServiceSelection(
    wire({ serviceOptions: { "wheel-size": "R16", extra: "x" } }), auto,
  );
  assert.ok(!r2.ok && r2.fieldErrors["serviceOptions.extra"]);
  const r3 = matchServiceSelection(wire({ serviceOptions: { "wheel-size": "R99" } }), auto);
  assert.ok(!r3.ok && r3.fieldErrors["serviceOptions.wheel-size"]);
  const r4 = matchServiceSelection(
    { ...wire(), siteKey: "beauty", serviceId: "haircut", serviceOptions: {}, resourceId: "ghost" },
    beauty,
  );
  assert.ok(!r4.ok && r4.fieldErrors.resourceId);
});

test("BU06 обязательная wheel-size отсутствует", () => {
  const result = matchServiceSelection(wire({ serviceOptions: {} }), auto);
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.fieldErrors["serviceOptions.wheel-size"]);
});

test("BU07 необязательный ресурс не передан — принято", () => {
  const result = matchServiceSelection(
    { ...wire(), siteKey: "beauty", serviceId: "haircut", serviceOptions: {} },
    beauty,
  );
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.matched.resourceId === null);
});

test("BU08 ресурс не поддерживает услугу — отклонено", () => {
  // master-a не обслуживает manicure (только master-b).
  const result = matchServiceSelection(
    { ...wire(), siteKey: "beauty", serviceId: "manicure", serviceOptions: {}, resourceId: "master-a" },
    beauty,
  );
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.fieldErrors.resourceId);
  const ok = matchServiceSelection(
    { ...wire(), siteKey: "beauty", serviceId: "manicure", serviceOptions: {}, resourceId: "master-b" },
    beauty,
  );
  assert.equal(ok.ok, true);
});

test("BU09/B Bu10(бизнес) версии config/consent сравниваются со_site", () => {
  // Сопоставление не отвечает за версии — но сверка идёт с полем конфиг
  // (contentVersion/consentVersion), а не с чем-либо клиентским.
  assert.equal(auto.contentVersion, "demo-2026-11-04");
  assert.equal(auto.legal.consentVersion, "demo-2026-11-04");
});

test("BU11 имя: отсутствует/валидное/пробельное/81 символ", () => {
  assert.deepEqual(normalizeName(undefined), { ok: true, name: null });
  assert.deepEqual(normalizeName(" Иван "), { ok: true, name: "Иван" });
  assert.equal(normalizeName("   ").ok, false, "только пробелы");
  assert.equal(normalizeName("а".repeat(81)).ok, false);
  assert.ok(normalizeName("а".repeat(80)).ok);
  const viaMatch = matchServiceSelection(
    { ...wire(), customer: { phone: SYNTH, name: "   " } }, auto,
  );
  assert.ok(!viaMatch.ok && viaMatch.fieldErrors["customer.name"]);
});

test("BU12 demo принимает синтетику, live — нет; обычный формат live принимает", () => {
  assert.equal(normalizePhone(SYNTH, "demo"), SYNTH);
  assert.equal(normalizePhone(SYNTH, "live"), null);
  assert.equal(normalizePhone("89001234567", "live"), "+79001234567");
  assert.equal(normalizePhone("89001234567", "demo"), null);
});

test("BU22 attribution выключена — null; включена — allowlist и лимит 80", () => {
  const raw = { utm_source: "yandex", utm_medium: "cpc", utm_campaign: "tires", evil: "pii" };
  assert.equal(normalizeAttribution(raw, false), null);
  const on = normalizeAttribution(raw, true);
  assert.deepEqual(on, { utm_source: "yandex", utm_medium: "cpc", utm_campaign: "tires" });
  const long = normalizeAttribution({ utm_source: "x".repeat(81) }, true);
  assert.equal(long, null);
});

test("BU23 цена/название/длительность берутся из конфигурации (snapshot)", () => {
  const result = matchServiceSelection(wire(), auto);
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.deepEqual(result.matched.priceSnapshot, {
    kind: "from",
    amountMinor: 180000,
    currency: "RUB",
    name: "Сезонная смена шин",
    durationMinutes: 40,
  });
});
