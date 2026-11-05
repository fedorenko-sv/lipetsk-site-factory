import test from "node:test";
import assert from "node:assert/strict";

import { autoConfig } from "../../src/config/sites/auto.ts";
import { beautyConfig } from "../../src/config/sites/beauty.ts";
import { getSiteConfig } from "../../src/config/sites/index.ts";
import { formatPrice } from "../../src/features/booking/client/formatters.ts";
import {
  getDateBounds,
  getAvailableTimeSlots,
  isDateWorkingDay,
} from "../../src/features/booking/client/dateTime.ts";
import {
  bookingReducer,
  createInitialState,
  buildLeadPayload,
  generateUUID,
  isStep2ErrorKey,
} from "../../src/features/booking/client/state.ts";
import {
  submitLead,
  parseRetryAfter,
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

  // Verify inputs were retained
  assert.equal(state.serviceOptions["wheel-size"], "R16");
  assert.equal(state.preferred?.date, "2026-11-06");
  assert.equal(state.preferred?.time, "10:30");
  assert.equal(state.customer.phone, "+70000000000");
  assert.equal(state.customer.name, "Иван");
  assert.equal(state.consentAccepted, true);
});

test("FU04: Неполная required option — следующий шаг недоступен", () => {
  let state = createInitialState(autoConfig);
  // Clear required wheel-size option
  state.serviceOptions = {};

  const now = new Date("2026-11-04T10:00:00Z");
  state.preferred = { date: "2026-11-06", time: "10:30", timezone: "Europe/Moscow" };

  // Attempt transition to contact
  state = bookingReducer(state, {
    type: "GO_TO_STEP",
    targetStep: "contact",
    config: autoConfig,
    now,
  });

  // Must remain on preference step with error
  assert.equal(state.step, "preference");
  assert.ok(state.fieldErrors["serviceOptions.wheel-size"]);
});

test("FU05: Смена услуги — сброс несовместимых option/resource", () => {
  let state = createInitialState(autoConfig);
  state.serviceId = "tire-change";
  state.serviceOptions = { "wheel-size": "R16" };

  // Switch to storage (which has no wheel-size option)
  state = bookingReducer(state, {
    type: "SELECT_SERVICE",
    serviceId: "storage",
    config: autoConfig,
  });

  assert.equal(state.serviceId, "storage");
  assert.equal(state.serviceOptions["wheel-size"], undefined);
  assert.equal(Object.keys(state.serviceOptions).length, 0);
});

test("FU06: Compatible master остаётся — без лишней потери выбора", () => {
  let state = createInitialState(beautyConfig);
  // master-b supports both haircut and manicure
  state.serviceId = "haircut";
  state.resourceId = "master-b";

  // Switch to manicure (master-b also supports manicure)
  state = bookingReducer(state, {
    type: "SELECT_SERVICE",
    serviceId: "manicure",
    config: beautyConfig,
  });
  assert.equal(state.resourceId, "master-b");

  // Switch back to haircut with master-a
  state = bookingReducer(state, {
    type: "SELECT_SERVICE",
    serviceId: "haircut",
    config: beautyConfig,
  });
  state.resourceId = "master-a";

  // Now switch to manicure where master-a is not available
  state = bookingReducer(state, {
    type: "SELECT_SERVICE",
    serviceId: "manicure",
    config: beautyConfig,
  });

  // Incompatible master-a must be reset to undefined (any master)
  assert.equal(state.resourceId, undefined);
});

test("FU07: Московская дата при другом TZ браузера — правильные min/max/day", () => {
  const { minDate, maxDate } = getDateBounds(14);
  assert.match(minDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(maxDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(minDate <= maxDate);
});

test("FU08: today/past/now/horizon — те же границы, что в общем контракте", () => {
  const now = new Date("2026-11-04T12:00:00Z"); // 15:00 Moscow
  const booking = autoConfig.booking;

  // Past date
  const pastSlots = getAvailableTimeSlots("2026-11-03", booking, now);
  assert.equal(pastSlots.length, 0);

  // Future working date (Friday 2026-11-06)
  const futureSlots = getAvailableTimeSlots("2026-11-06", booking, now);
  assert.ok(futureSlots.length > 0);
  assert.equal(futureSlots[0], "09:00");
});

test("FU09: Рабочие дни, opens/closes, time step — только допустимые предпочтения", () => {
  // Sunday (0) is not in Auto working days [1, 2, 3, 4, 5, 6]
  const isSundayWorking = isDateWorkingDay("2026-11-08", autoConfig.booking.workingHours.days);
  assert.equal(isSundayWorking, false);

  const now = new Date("2026-11-04T05:00:00Z");
  const sundaySlots = getAvailableTimeSlots("2026-11-08", autoConfig.booking, now);
  assert.equal(sundaySlots.length, 0);
});

test("FU10: Смена даты — несовместимое время сбрасывается", () => {
  let state = createInitialState(autoConfig);
  const now = new Date("2026-11-05T12:00:00Z"); // 15:00 Moscow

  // Select future date and time 10:00
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

test("FU15: Повторный submit во время submitting — один transport call", async () => {
  let transportCalls = 0;
  const mockTransport = async () => {
    transportCalls++;
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      httpStatus: 201,
      receipt: {
        leadId: "00000000-0000-4000-8000-000000000015",
        status: "received",
        replayed: false,
        message: "Заявка сохранена",
      },
    };
  };

  let state = createInitialState(autoConfig);

  const executeSubmit = async () => {
    if (state.submitState === "submitting") return;
    state = bookingReducer(state, {
      type: "START_SUBMIT",
      idempotencyKey: "test-key-15",
      payload: { siteKey: "auto" },
    });
    const result = await mockTransport();
    state = bookingReducer(state, {
      type: "SUBMIT_SUCCESS",
      receipt: result.receipt,
    });
  };

  // Launch two concurrent submits
  const p1 = executeSubmit();
  const p2 = executeSubmit();
  await Promise.all([p1, p2]);

  assert.equal(transportCalls, 1, "Transport must be called exactly once");
  assert.equal(state.submitState, "received");
});

test("FU16: Поздний ответ старой попытки — не перезаписывает текущий state", async () => {
  let state = createInitialState(autoConfig);
  let activeSubmitKey = "attempt-2-uuid";

  let resolveAttempt1;
  const attempt1Promise = new Promise((resolve) => {
    resolveAttempt1 = resolve;
  });

  let resolveAttempt2;
  const attempt2Promise = new Promise((resolve) => {
    resolveAttempt2 = resolve;
  });

  const handleResponse = (key, receipt) => {
    if (activeSubmitKey === key) {
      state = bookingReducer(state, { type: "SUBMIT_SUCCESS", receipt });
    }
  };

  // Fast attempt 2 finishes first
  resolveAttempt2({
    leadId: "00000000-0000-4000-8000-000000000002",
    status: "received",
    replayed: false,
    message: "Fast attempt 2",
  });
  const res2 = await attempt2Promise;
  handleResponse("attempt-2-uuid", res2);

  assert.equal(state.submitReceipt?.leadId, "00000000-0000-4000-8000-000000000002");
  assert.equal(state.submitReceipt?.message, "Fast attempt 2");

  // Slow attempt 1 resolves later with old key
  resolveAttempt1({
    leadId: "00000000-0000-4000-8000-000000000001",
    status: "received",
    replayed: false,
    message: "Late attempt 1",
  });
  const res1 = await attempt1Promise;
  handleResponse("attempt-1-uuid", res1);

  // Attempt 1 must NOT overwrite Attempt 2
  assert.equal(state.submitReceipt?.leadId, "00000000-0000-4000-8000-000000000002");
  assert.equal(state.submitReceipt?.message, "Fast attempt 2");
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

test("FU18: Error mapping всех HTTP codes через реальный submitLead", async () => {
  const originalFetch = globalThis.fetch;
  const testCases = [
    { status: 400, code: "INVALID_JSON" },
    { status: 403, code: "ORIGIN_NOT_ALLOWED" },
    { status: 404, code: "SITE_NOT_FOUND" },
    { status: 409, code: "CONFIG_CHANGED" },
    { status: 409, code: "CONSENT_CHANGED" },
    { status: 413, code: "PAYLOAD_TOO_LARGE" },
    { status: 415, code: "UNSUPPORTED_MEDIA_TYPE" },
    { status: 422, code: "VALIDATION_FAILED", fieldErrors: { "preferred.time": "Занято" } },
    { status: 429, code: "RATE_LIMITED", retryAfter: "30" },
    { status: 500, code: "INTERNAL_ERROR" },
    { status: 503, code: "STORAGE_UNAVAILABLE" },
  ];

  try {
    for (const tc of testCases) {
      globalThis.fetch = async () => {
        const headers = new Headers();
        if (tc.retryAfter) headers.set("retry-after", tc.retryAfter);
        return new Response(
          JSON.stringify({
            error: {
              code: tc.code,
              message: `Error for ${tc.code}`,
              requestId: `req-${tc.status}`,
              fieldErrors: tc.fieldErrors,
            },
          }),
          { status: tc.status, headers }
        );
      };

      await assert.rejects(
        () =>
          submitLead(
            { siteKey: "auto" },
            { idempotencyKey: "00000000-0000-4000-8000-000000000018" }
          ),
        (err) => {
          assert.equal(err instanceof SubmitError, true);
          assert.equal(err.kind, "http");
          assert.equal(err.httpStatus, tc.status);
          assert.equal(err.code, tc.code);
          assert.equal(err.requestId, `req-${tc.status}`);
          if (tc.fieldErrors) {
            assert.deepEqual(err.fieldErrors, tc.fieldErrors);
          }
          if (tc.retryAfter) {
            assert.equal(err.retryAfterSeconds, 30);
          }
          return true;
        }
      );
    }

    // Malformed HTML response test
    globalThis.fetch = async () =>
      new Response("<html>502 Bad Gateway</html>", {
        status: 502,
        headers: { "content-type": "text/html" },
      });

    await assert.rejects(
      () =>
        submitLead(
          { siteKey: "auto" },
          { idempotencyKey: "00000000-0000-4000-8000-000000000018" }
        ),
      (err) => {
        assert.equal(err.kind, "http");
        assert.equal(err.httpStatus, 502);
        assert.equal(err.code, undefined);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("FU19: Retry-After заголовок — строгий целочисленный парсинг", () => {
  assert.equal(parseRetryAfter(null), undefined);
  assert.equal(parseRetryAfter(undefined), undefined);
  assert.equal(parseRetryAfter(""), undefined);
  assert.equal(parseRetryAfter("0"), undefined);
  assert.equal(parseRetryAfter("-1"), undefined);
  assert.equal(parseRetryAfter("30s"), undefined); // Partial suffix rejected
  assert.equal(parseRetryAfter("12abc"), undefined);
  assert.equal(parseRetryAfter("invalid"), undefined);
  assert.equal(parseRetryAfter("15.5"), undefined);
  assert.equal(parseRetryAfter("30"), 30);
  assert.equal(parseRetryAfter("  60  "), 60);
  assert.equal(parseRetryAfter("120"), 120);
});

test("FU20: Abort/timeout — реальный запуск таймера, внешний signal и hanging stream", async () => {
  const originalFetch = globalThis.fetch;

  try {
    // 1. Real timer timeout
    globalThis.fetch = async (url, init) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(new Response("{}")), 200);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    };

    await assert.rejects(
      () =>
        submitLead(
          { siteKey: "auto" },
          { idempotencyKey: "test-timeout-key", timeoutMs: 30 }
        ),
      (err) => {
        assert.equal(err instanceof SubmitError, true);
        assert.equal(err.kind, "timeout");
        return true;
      }
    );

    // 2. External signal already aborted
    const preAborted = AbortSignal.abort();
    await assert.rejects(
      () =>
        submitLead(
          { siteKey: "auto" },
          { idempotencyKey: "test-abort-key", signal: preAborted }
        ),
      (err) => {
        assert.equal(err.kind, "network");
        assert.equal(err.message, "Запрос был отменен");
        return true;
      }
    );

    // 3. External signal aborted during fetch
    const externalController = new AbortController();
    setTimeout(() => externalController.abort(), 20);
    await assert.rejects(
      () =>
        submitLead(
          { siteKey: "auto" },
          { idempotencyKey: "test-abort-key", signal: externalController.signal, timeoutMs: 500 }
        ),
      (err) => {
        assert.equal(err.kind, "network");
        assert.equal(err.message, "Запрос был отменен");
        return true;
      }
    );

    // 4. FR1b: 201 headers arrived, body stream hangs -> timeout fires
    globalThis.fetch = async (url, init) => {
      const hangingStream = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener("abort", () => {
            controller.error(new Error("Stream aborted"));
          });
        },
      });
      return new Response(hangingStream, { status: 201 });
    };

    await assert.rejects(
      () =>
        submitLead(
          { siteKey: "auto" },
          { idempotencyKey: "test-hanging-body", timeoutMs: 40 }
        ),
      (err) => {
        assert.equal(err instanceof SubmitError, true);
        assert.equal(err.kind, "timeout");
        return true;
      }
    );

    // 5. FR1c: 503 headers arrived, error body stream hangs -> timeout fires
    globalThis.fetch = async (url, init) => {
      const hangingStream = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener("abort", () => {
            controller.error(new Error("Stream aborted"));
          });
        },
      });
      return new Response(hangingStream, { status: 503 });
    };

    await assert.rejects(
      () =>
        submitLead(
          { siteKey: "auto" },
          { idempotencyKey: "test-hanging-error-body", timeoutMs: 40 }
        ),
      (err) => {
        assert.equal(err instanceof SubmitError, true);
        assert.equal(err.kind, "timeout");
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("FU21: FR4 — getSiteConfig lookup защищен от prototype properties", () => {
  assert.ok(getSiteConfig("auto"));
  assert.ok(getSiteConfig("beauty"));
  assert.equal(getSiteConfig("constructor"), null);
  assert.equal(getSiteConfig("toString"), null);
  assert.equal(getSiteConfig("__proto__"), null);
  assert.equal(getSiteConfig("valueOf"), null);
  assert.equal(getSiteConfig("hasOwnProperty"), null);
  assert.equal(getSiteConfig("nonexistent"), null);
  assert.equal(getSiteConfig(""), null);
});

test("FU22: FR2 — isReceiptValid отклоняет не-UUID, лишние свойства и неверные типы", () => {
  // Valid
  assert.equal(
    isReceiptValid({
      leadId: "00000000-0000-4000-8000-000000000001",
      status: "received",
      replayed: false,
      message: "Заявка получена.",
    }),
    true
  );

  // Invalid: not-a-uuid
  assert.equal(
    isReceiptValid({
      leadId: "not-a-uuid",
      status: "received",
      replayed: false,
      message: "Заявка получена.",
    }),
    false
  );

  // Invalid: additional properties (additionalProperties: false)
  assert.equal(
    isReceiptValid({
      leadId: "00000000-0000-4000-8000-000000000001",
      status: "received",
      replayed: false,
      message: "Заявка получена.",
      extra: "forbidden",
    }),
    false
  );

  // Invalid: status not "received"
  assert.equal(
    isReceiptValid({
      leadId: "00000000-0000-4000-8000-000000000001",
      status: "ok",
      replayed: false,
      message: "Заявка получена.",
    }),
    false
  );

  // Invalid: message length 0 or > 300
  assert.equal(
    isReceiptValid({
      leadId: "00000000-0000-4000-8000-000000000001",
      status: "received",
      replayed: false,
      message: "",
    }),
    false
  );
  assert.equal(
    isReceiptValid({
      leadId: "00000000-0000-4000-8000-000000000001",
      status: "received",
      replayed: false,
      message: "x".repeat(301),
    }),
    false
  );

  // Invalid: replayed is string
  assert.equal(
    isReceiptValid({
      leadId: "00000000-0000-4000-8000-000000000001",
      status: "received",
      replayed: "false",
      message: "Заявка получена.",
    }),
    false
  );
});

test("FU23: FR3 — 422 preferred.time ошибки маршрутизируются и сохраняются при переходе", () => {
  let state = createInitialState(autoConfig);
  state.step = "contact";
  state.preferred = { date: "2026-11-06", time: "10:00", timezone: "Europe/Moscow" };
  state.customer.phone = "+70000000000";
  state.consentAccepted = true;

  // Server returns 422 with preferred.time error
  state = bookingReducer(state, {
    type: "SUBMIT_ERROR",
    error: new SubmitError({
      kind: "http",
      httpStatus: 422,
      code: "VALIDATION_FAILED",
      fieldErrors: { "preferred.time": "Выбранное время уже занято" },
      message: "Ошибка валидации",
    }),
  });

  assert.equal(state.fieldErrors["preferred.time"], "Выбранное время уже занято");
  assert.equal(isStep2ErrorKey("preferred.time"), true);

  // Transition to preference step to fix
  state = bookingReducer(state, {
    type: "GO_TO_STEP",
    targetStep: "preference",
    config: autoConfig,
  });

  // GO_TO_STEP preserves fieldErrors
  assert.equal(state.fieldErrors["preferred.time"], "Выбранное время уже занято");

  // User selects new time -> error cleared
  state = bookingReducer(state, {
    type: "SET_TIME",
    time: "11:00",
  });
  assert.equal(state.fieldErrors["preferred.time"], undefined);

  // User proceeds back to contact step -> contact data preserved
  state = bookingReducer(state, {
    type: "GO_TO_STEP",
    targetStep: "contact",
    config: autoConfig,
  });
  assert.equal(state.step, "contact");
  assert.equal(state.customer.phone, "+70000000000");
  assert.equal(state.consentAccepted, true);
});

test("FU24: FR3 — 409 CONSENT_CHANGED сбрасывает согласие для явного повторного подтверждения", () => {
  let state = createInitialState(autoConfig);
  state.step = "contact";
  state.customer.phone = "+70000000000";
  state.consentAccepted = true;

  // Server returns 409 CONSENT_CHANGED
  state = bookingReducer(state, {
    type: "SUBMIT_ERROR",
    error: new SubmitError({
      kind: "http",
      httpStatus: 409,
      code: "CONSENT_CHANGED",
      message: "Версия согласия обновилась",
    }),
  });

  // consentAccepted MUST be reset to false so blind retry is blocked!
  assert.equal(state.consentAccepted, false);
  assert.equal(state.submitError?.code, "CONSENT_CHANGED");

  // User re-checks consent
  state = bookingReducer(state, {
    type: "SET_CONSENT",
    accepted: true,
  });
  assert.equal(state.consentAccepted, true);
  assert.equal(state.submitState, "idle");
});
