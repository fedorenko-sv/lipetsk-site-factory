// BU20, BU21: канон и HMAC — эквивалентные формы совпадают, значимые
// различия различаются.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCanonical, canonicalJson, computePayloadHmac, moscowIso,
} from "../../src/server/leads/canonical.ts";
import { normalizePhone } from "../../src/server/leads/phone.ts";
import { parseMoscowInstant } from "../../src/server/leads/preference.ts";

const KEY = "unit-hmac-key-0000000000000000000000";
const SYNTH = "+7" + "0".repeat(10);

function canonicalFor(over = {}) {
  const base = {
    siteKey: "auto",
    configVersion: "demo-2026-11-04",
    kind: "booking",
    serviceId: "tire-change",
    serviceOptions: { "wheel-size": "R16" },
    resourceId: null,
    preferredIso: "2026-11-10T10:30+03:00",
    phone: SYNTH,
    name: null,
    consentVersion: "demo-2026-11-04",
    attribution: null,
  };
  return buildCanonical({ ...base, ...over });
}

test("BU20 порядок опций и форматирование телефона дают один HMAC", () => {
  const c1 = canonicalFor({ serviceOptions: { "b-opt": "2", "a-opt": "1", "wheel-size": "R16" } });
  const c2 = canonicalFor({ serviceOptions: { "a-opt": "1", "wheel-size": "R16", "b-opt": "2" } });
  assert.equal(canonicalJson(c1), canonicalJson(c2));
  assert.equal(computePayloadHmac(KEY, c1), computePayloadHmac(KEY, c2));

  const digits = SYNTH.slice(2); // десять нулей
  const phoneA = normalizePhone(SYNTH, "demo");
  const phoneB = normalizePhone(
    `8 ${digits.slice(0, 3)} ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`,
    "demo",
  );
  assert.equal(phoneA, phoneB);
  assert.equal(
    computePayloadHmac(KEY, canonicalFor({ phone: phoneA })),
    computePayloadHmac(KEY, canonicalFor({ phone: phoneB })),
  );
});

test("BU21 другой контакт/услуга/версия — другой HMAC", () => {
  const base = computePayloadHmac(KEY, canonicalFor());
  assert.notEqual(base, computePayloadHmac(KEY, canonicalFor({ phone: "+70000000001" })));
  assert.notEqual(base, computePayloadHmac(KEY, canonicalFor({ serviceId: "balancing" })));
  assert.notEqual(base, computePayloadHmac(KEY, canonicalFor({ configVersion: "v2" })));
  assert.notEqual(base, computePayloadHmac(KEY, canonicalFor({ name: "Иван" })));
  assert.notEqual(base, computePayloadHmac(KEY, canonicalFor({ preferredIso: "2026-11-10T11:00+03:00" })));
  assert.notEqual(
    computePayloadHmac(KEY, canonicalFor()),
    computePayloadHmac("another-secret-key-0000000000000000000", canonicalFor()),
  );
});

test("BU20moscowIso стабильно для московского момента", () => {
  const instant = parseMoscowInstant("2026-11-10", "10:30");
  assert.ok(instant instanceof Date);
  assert.equal(moscowIso(instant), "2026-11-10T10:30+03:00");
});
