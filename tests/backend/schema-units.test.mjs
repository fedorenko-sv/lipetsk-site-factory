// BU02, BU03, BU10(схема), BU23(схема): строгая runtime-схема LeadCreateRequest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateLeadRequest } from "../../src/server/leads/schema.ts";

const BASE_VALID = {
  siteKey: "auto",
  configVersion: "demo-2026-11-04",
  kind: "booking",
  serviceId: "tire-change",
  serviceOptions: { "wheel-size": "R16" },
  preferred: { date: "2026-11-10", time: "10:30", timezone: "Europe/Moscow" },
  customer: { phone: "+7" + "0".repeat(10) },
  consent: { accepted: true, version: "demo-2026-11-04" },
  antiBot: { website: "" },
};

const clone = () => structuredClone(BASE_VALID);

test("BU02 неизвестные price/status/channel/consentAt отклоняются", () => {
  for (const field of ["price", "status", "channel", "consentAt"]) {
    const body = { ...clone(), [field]: field === "consentAt" ? "2026-11-05T00:00:00Z" : 1 };
    const result = validateLeadRequest(body);
    assert.equal(result.ok, false, field);
    assert.ok(!result.ok && result.fieldErrors?.[field], `fieldErrors.${field}`);
  }
});

test("BU03 root array/null, неверные типы, отсутствующие required", () => {
  assert.equal(validateLeadRequest([clone()]).ok, false);
  assert.equal(validateLeadRequest(null).ok, false);
  assert.equal(validateLeadRequest("text").ok, false);
  assert.equal(validateLeadRequest(42).ok, false);
  const wrongType = { ...clone(), serviceOptions: "R16" };
  const r1 = validateLeadRequest(wrongType);
  assert.equal(r1.ok, false);
  const noRequired = clone();
  delete noRequired.consent;
  const r2 = validateLeadRequest(noRequired);
  assert.equal(r2.ok, false);
  assert.ok(!r2.ok && r2.fieldErrors?.consent, "required consent");
  const badNested = clone();
  badNested.customer.phone = 12345678901;
  const r3 = validateLeadRequest(badNested);
  assert.equal(r3.ok, false);
  assert.ok(!r3.ok && r3.fieldErrors?.["customer.phone"], "тип customer.phone");
});

test("BU10-sхема consent.accepted не boolean и не true отклоняются", () => {
  const notBool = clone();
  notBool.consent.accepted = "true";
  assert.equal(validateLeadRequest(notBool).ok, false);
  const falseVal = clone();
  falseVal.consent.accepted = false;
  assert.equal(validateLeadRequest(falseVal).ok, false);
});

test("BU23-схема клиентская цена и серверные поля не принимаются", () => {
  const withPrice = clone();
  withPrice.customer.priceMinor = 100;
  const r1 = validateLeadRequest(withPrice);
  assert.equal(r1.ok, false);
  assert.ok(!r1.ok && r1.fieldErrors?.consentAt === undefined);
  const withCreatedAt = { ...clone(), createdAt: "2026-11-05T08:00:00Z" };
  assert.equal(validateLeadRequest(withCreatedAt).ok, false);
  const valid = validateLeadRequest(clone());
  assert.equal(valid.ok, true);
});
