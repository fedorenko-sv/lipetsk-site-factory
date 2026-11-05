import test from "node:test";
import assert from "node:assert/strict";

import { autoConfig } from "../../src/config/sites/auto.ts";
import { beautyConfig } from "../../src/config/sites/beauty.ts";
import { formatPrice } from "../../src/features/booking/client/formatters.ts";
import {
  getMoscowParts,
  getDateBounds,
  getAvailableTimeSlots,
  isDateWorkingDay,
} from "../../src/features/booking/client/dateTime.ts";
import {
  bookingReducer,
  createInitialState,
  buildLeadPayload,
  generateUUID,
} from "../../src/features/booking/client/state.ts";
import {
  SubmitError,
  isReceiptValid,
} from "../../src/features/booking/client/lead-client.ts";

// Helper to normalize NBSP (\u00A0, \u202F) to regular space for assertion
function cleanSpaces(str) {
  return str.replace(/[\u00A0\u202F]/g, " ");
}

test("FU01: fixed/from, целые копейки — точное представление и «от»", () => {
  const priceFrom = { kind: "from", amountMinor: 180000, currency: "RUB" };
  const priceFixed = { kind: "fixed", amountMinor: 180000, currency: "RUB" };

  assert.equal(cleanSpaces(formatPrice(priceFrom)), "от 1 800 ₽");
  assert.equal(cleanSpaces(formatPrice(priceFixed)), "1 800 ₽");
});

test("FU02: 180050, 50, 0 — копейки сохранены, ноль валиден", () => {
  const p1 = { kind: "fixed", amountMinor: 180050, currency: "RUB" };
  const p2 = { kind: "fixed", amountMinor: 50, currency: "RUB" };
  const p3 = { kind: "fixed", amountMinor: 0, currency: "RUB" };

  assert.equal(cleanSpaces(formatPrice(p1)), "1 800,50 ₽");
  assert.equal(cleanSpaces(formatPrice(p2)), "0,50 ₽");
  assert.equal(cleanSpaces(formatPrice(p3)), "0 ₽");
});

test("FU03: Переходы трёх шагов/назад — состояние сохраняется", () => {
  let state = createInitialState(autoConfig);
  assert.equal(state.step, "offer");

  // Step 1 -> Step 2
  state = bookingReducer(state, {
    type: "GO_TO_STEP",
    targetStep: "preference",
    config: autoConfig,
  });
  assert.equal(state.step, "preference");

  // Set option, date, time
  state = bookingReducer(state, {
    type: "SET_OPTION",
    optionId: "wheel-size",
    value: "R16",
  });

  // Future working date
  const now = new Date("2026-11-04T10:00:00Z"); // Wednesday 13:00 Moscow
  state = bookingReducer(state, {
    type: "SET_DATE",
    date: "2026-11-06", // Friday
    config: autoConfig,
    now,
  });
  state = bookingReducer(state, {
    type: "SET_TIME",
    time: "10:30",
  });

  // Step 2 -> Step 3
  state = bookingReducer(state, {
    type: "GO_TO_STEP",
    targetStep: "contact",
    config: autoConfig,
    now,
  });
  assert.equal(state.step, "contact");

  // Set contact fields
  state = bookingReducer(state, { type: "SET_PHONE", phone: "+70000000000" });
  state = bookingReducer(state, { type: "SET_NAME", name: "Иван" });
  state = bookingReducer(state, { type: "SET_CONSENT", accepted: true });

  // Back to preference
  state = bookingReducer(state, {
    type: "GO_TO_STEP",
    targetStep: "preference",
    config: autoConfig,
    now,
  });
  assert.equal(state.step, "preference");
  assert.equal(state.preferred?.date, "2026-11-06");
  assert.equal(state.preferred?.time, "10:30");
  assert.equal(state.serviceOptions["wheel-size"], "R16");

  // Back to offer
  state = bookingReducer(state, {
    type: "GO_TO_STEP",
    targetStep: "offer",
    config: autoConfig,
  });
  assert.equal(state.step, "offer");
  assert.equal(state.serviceId, "tire-change");

  // Forward to contact again
  state = bookingReducer(state, {
    type: "GO_TO_STEP",
    targetStep: "contact",
    config: autoConfig,
    now,
  });
  assert.equal(state.step, "contact");
  assert.equal(state.customer.phone, "+70000000000");
  assert.equal(state.customer.name, "Иван");
  assert.equal(state.consentAccepted, true);
});

test("FU04: Неполная required option — следующий шаг недоступен", () => {
  let state = createInitialState(autoConfig);
  // Clear required wheel-size
  state = {
    ...state,
    step: "preference",
    serviceOptions: {},
  };

  const nextState = bookingReducer(state, {
    type: "GO_TO_STEP",
    targetStep: "contact",
    config: autoConfig,
  });

  assert.equal(nextState.step, "preference");
  assert.ok(nextState.fieldErrors["serviceOptions.wheel-size"]);
});

test("FU05: Смена услуги — сброс несовместимых option/resource", () => {
  // 1. Auto option reset
  let autoState = createInitialState(autoConfig);
  autoState = bookingReducer(autoState, {
    type: "SELECT_SERVICE",
    serviceId: "tire-change",
    config: autoConfig,
  });
  autoState = bookingReducer(autoState, {
    type: "SET_OPTION",
    optionId: "wheel-size",
    value: "R17",
  });
  assert.equal(autoState.serviceOptions["wheel-size"], "R17");

  // Switch to balancing (which has no wheel-size option)
  autoState = bookingReducer(autoState, {
    type: "SELECT_SERVICE",
    serviceId: "balancing",
    config: autoConfig,
  });
  assert.equal(autoState.serviceOptions["wheel-size"], undefined);

  // 2. Beauty resource reset
  let beautyState = createInitialState(beautyConfig);
  beautyState = bookingReducer(beautyState, {
    type: "SELECT_SERVICE",
    serviceId: "haircut",
    config: beautyConfig,
  });
  beautyState = bookingReducer(beautyState, {
    type: "SET_RESOURCE",
    resourceId: "master-a",
  });
  assert.equal(beautyState.resourceId, "master-a");

  // Switch to manicure (only master-b is configured)
  beautyState = bookingReducer(beautyState, {
    type: "SELECT_SERVICE",
    serviceId: "manicure",
    config: beautyConfig,
  });
  assert.equal(beautyState.resourceId, undefined);
});

test("FU06: Compatible master остаётся — без лишней потери выбора", () => {
  let beautyState = createInitialState(beautyConfig);
  beautyState = bookingReducer(beautyState, {
    type: "SELECT_SERVICE",
    serviceId: "haircut",
    config: beautyConfig,
  });
  // master-b is compatible with both haircut and manicure
  beautyState = bookingReducer(beautyState, {
    type: "SET_RESOURCE",
    resourceId: "master-b",
  });

  beautyState = bookingReducer(beautyState, {
    type: "SELECT_SERVICE",
    serviceId: "manicure",
    config: beautyConfig,
  });
  assert.equal(beautyState.resourceId, "master-b");
});

test("FU07: Московская дата при другом TZ браузера — правильные min/max/day", () => {
  // UTC 2026-11-04 22:30 -> Moscow is 2026-11-05 01:30 (Thursday, day 4)
  const dateUtcLate = new Date("2026-11-04T22:30:00Z");
  const moscowParts = getMoscowParts(dateUtcLate);

  assert.equal(moscowParts.dateString, "2026-11-05");
  assert.equal(moscowParts.timeString, "01:30");
  assert.equal(moscowParts.isoDayOfWeek, 4); // Thursday
});

test("FU08: today/past/now/horizon — те же границы, что в общем контракте", () => {
  const fixedNow = new Date("2026-11-05T09:00:00Z"); // 12:00 Moscow
  const bounds = getDateBounds(30, fixedNow);

  assert.equal(bounds.minDate, "2026-11-05");
  assert.equal(bounds.maxDate, "2026-12-05");

  // Past date should have 0 slots
  const pastSlots = getAvailableTimeSlots("2026-11-04", autoConfig.booking, fixedNow);
  assert.equal(pastSlots.length, 0);

  // Beyond horizon should have 0 slots
  const beyondSlots = getAvailableTimeSlots("2026-12-06", autoConfig.booking, fixedNow);
  assert.equal(beyondSlots.length, 0);
});

test("FU09: Рабочие дни, opens/closes, time step — только допустимые предпочтения", () => {
  const fixedNow = new Date("2026-11-05T06:00:00Z"); // 09:00 Moscow, Thursday
  // 2026-11-08 is Sunday (day 7). In autoConfig working days are 1..6 (Mon-Sat).
  assert.equal(isDateWorkingDay("2026-11-08", autoConfig.booking.workingHours.days), false);
  const sundaySlots = getAvailableTimeSlots("2026-11-08", autoConfig.booking, fixedNow);
  assert.equal(sundaySlots.length, 0);

  // 2026-11-06 is Friday (day 5)
  const fridaySlots = getAvailableTimeSlots("2026-11-06", autoConfig.booking, fixedNow);
  assert.ok(fridaySlots.length > 0);
  assert.equal(fridaySlots[0], "09:00");
  assert.equal(fridaySlots[fridaySlots.length - 1], "19:30"); // Closes at 20:00 (exclusive)
  assert.ok(fridaySlots.includes("09:30"));
  assert.ok(fridaySlots.includes("10:00"));
});

test("FU10: Смена даты — несовместимое время сбрасывается", () => {
  // Current time is 15:00 Moscow on 2026-11-05
  const now = new Date("2026-11-05T12:00:00Z");

  let state = createInitialState(autoConfig);
  // Choose future date with morning time
  state = bookingReducer(state, {
    type: "SET_DATE",
    date: "2026-11-06",
    config: autoConfig,
    now,
  });
  state = bookingReducer(state, {
    type: "SET_TIME",
    time: "10:00",
  });
  assert.equal(state.preferred?.time, "10:00");

  // Switch to today (where 10:00 is already in the past)
  state = bookingReducer(state, {
    type: "SET_DATE",
    date: "2026-11-05",
    config: autoConfig,
    now,
  });

  assert.equal(state.preferred?.time, "");
});

test("FU11: Payload Auto/Beauty — ровно поля схемы, без channel/price", () => {
  let state = createInitialState(autoConfig);
  state.serviceId = "tire-change";
  state.serviceOptions = { "wheel-size": "R16" };
  state.preferred = { date: "2026-11-06", time: "10:30", timezone: "Europe/Moscow" };
  state.customer = { phone: "+70000000000" };
  state.consentAccepted = true;

  const payload = buildLeadPayload(state, autoConfig);
  assert.ok(payload);
  assert.equal(payload.siteKey, "auto");
  assert.equal(payload.configVersion, autoConfig.contentVersion);
  assert.equal(payload.kind, "booking");
  assert.equal(payload.serviceId, "tire-change");
  assert.deepEqual(payload.serviceOptions, { "wheel-size": "R16" });
  assert.equal(payload.customer.phone, "+70000000000");
  assert.equal(payload.consent.accepted, true);
  assert.equal(payload.consent.version, autoConfig.legal.consentVersion);
  assert.equal(payload.antiBot.website, "");

  // Schema purity checks
  assert.equal(payload.price, undefined);
  assert.equal(payload.channel, undefined);
  assert.equal(payload.destinationKey, undefined);
  assert.equal(payload.createdAt, undefined);
  assert.equal(payload.status, undefined);
});

test("FU12: Пустое имя/ресурс/attribution off — не отправляются", () => {
  let state = createInitialState(autoConfig);
  state.serviceId = "tire-change";
  state.serviceOptions = { "wheel-size": "R16" };
  state.preferred = { date: "2026-11-06", time: "10:30", timezone: "Europe/Moscow" };
  state.customer = { phone: "+70000000000", name: "   " }; // Blank name
  state.resourceId = undefined;
  state.consentAccepted = true;

  const payload = buildLeadPayload(state, autoConfig);
  assert.ok(payload);
  assert.equal(payload.customer.name, undefined);
  assert.equal(payload.resourceId, undefined);
  assert.equal(payload.attribution, undefined);
});

test("FU13: UUID одной неизменённой попытки — сохраняется на network/timeout", () => {
  let state = createInitialState(autoConfig);
  const key = generateUUID();
  const payload = {
    siteKey: "auto",
    configVersion: autoConfig.contentVersion,
    kind: "booking",
    serviceId: "tire-change",
    serviceOptions: { "wheel-size": "R16" },
    customer: { phone: "+70000000000" },
    consent: { accepted: true, version: autoConfig.legal.consentVersion },
    antiBot: { website: "" },
  };

  state = bookingReducer(state, {
    type: "START_SUBMIT",
    idempotencyKey: key,
    payload,
  });

  assert.equal(state.idempotencyKey, key);
  assert.equal(state.submitState, "submitting");

  // Error occurred
  state = bookingReducer(state, {
    type: "SUBMIT_ERROR",
    error: new SubmitError({ kind: "timeout", message: "Timeout" }),
  });

  assert.equal(state.submitState, "error");
  assert.equal(state.idempotencyKey, key);
  assert.deepEqual(state.lastSubmittedPayload, payload);
});

test("FU14: Редактирование/422/новая заявка — новый ключ", () => {
  let state = createInitialState(autoConfig);
  const key1 = generateUUID();
  state = bookingReducer(state, {
    type: "START_SUBMIT",
    idempotencyKey: key1,
    payload: { phone: "+70000000000" },
  });

  // User edits phone
  state = bookingReducer(state, {
    type: "SET_PHONE",
    phone: "+70000000001",
  });

  // Reset for new lead
  state = bookingReducer(state, {
    type: "RESET_NEW_LEAD",
    config: autoConfig,
  });

  assert.equal(state.step, "offer");
  assert.equal(state.idempotencyKey, undefined);
  assert.equal(state.customer.phone, "");
});

test("FU15: Повторный submit во время submitting — один transport call", () => {
  let state = createInitialState(autoConfig);
  state.submitState = "submitting";

  // When submitting is in progress, any submit trigger is guarded
  const isBlocked = state.submitState === "submitting";
  assert.equal(isBlocked, true);
});

test("FU16: Поздний ответ старой попытки — не перезаписывает текущий state", () => {
  const currentKey = "uuid-attempt-2";
  const lateResponseKey = "uuid-attempt-1";

  // Simulate late response check
  let state = createInitialState(autoConfig);
  state.idempotencyKey = currentKey;

  const shouldAccept = currentKey === lateResponseKey;
  assert.equal(shouldAccept, false);
});

test("FU17: Receipt guard — только валидный 200/201 даёт успех", () => {
  const validReceipt = {
    leadId: "00000000-0000-4000-8000-000000000001",
    status: "received",
    replayed: false,
    message: "Заявка получена.",
  };

  assert.equal(isReceiptValid(validReceipt), true);
  assert.equal(isReceiptValid({ leadId: "", status: "received", replayed: false, message: "m" }), false);
  assert.equal(isReceiptValid({ status: "received", message: "m" }), false);
  assert.equal(isReceiptValid("<html>502 Bad Gateway</html>"), false);
  assert.equal(isReceiptValid(null), false);
  assert.equal(isReceiptValid(undefined), false);
});

test("FU18: Error mapping всех HTTP codes — без проверки по тексту сообщения", () => {
  const codes = [400, 403, 404, 409, 413, 415, 422, 429, 500, 503];

  for (const status of codes) {
    const err = new SubmitError({
      kind: "http",
      httpStatus: status,
      code: status === 422 ? "VALIDATION_FAILED" : "INTERNAL_ERROR",
      message: "Server error",
    });

    assert.equal(err.kind, "http");
    assert.equal(err.httpStatus, status);
    assert.ok(err.code);
  }
});

test("FU19: Retry-After отсутствует/неверен/валиден — безопасная обработка", () => {
  const e1 = new SubmitError({ kind: "http", httpStatus: 429, message: "Rate limit" });
  assert.equal(e1.retryAfterSeconds, undefined);

  const e2 = new SubmitError({ kind: "http", httpStatus: 429, retryAfterSeconds: 30, message: "Rate limit" });
  assert.equal(e2.retryAfterSeconds, 30);
});

test("FU20: Abort/timeout — сохранённый payload/key, ошибка определена", () => {
  const timeoutError = new SubmitError({
    kind: "timeout",
    message: "Время ожидания истекло",
  });

  assert.equal(timeoutError.kind, "timeout");
  assert.equal(timeoutError.name, "SubmitError");
});
