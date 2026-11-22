// BU13–BU19: дата и время (Europe/Moscow +03:00, чистая функция + Clock).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkPreference, moscowDay, parseMoscowInstant } from "../../src/server/leads/preference.ts";

const auto = JSON.parse(readFileSync("examples/sites/auto.json", "utf8"));
// Unit-clock из ТЗ: 2026-11-05T08:00:00.000Z = 11:00 Москвы.
const NOW = new Date("2026-11-05T08:00:00.000Z");

const pref = (date, time) => ({ date, time, timezone: "Europe/Moscow" });
const check = (p, config = auto) => checkPreference(p, config, NOW);

test("BU13 календарная реальность даты, включая високосность", () => {
  assert.equal(parseMoscowInstant("2027-02-30", "10:00"), null);
  assert.equal(parseMoscowInstant("2026-02-29", "10:00"), null, "2026 не високосный");
  assert.ok(parseMoscowInstant("2028-02-29", "10:00") instanceof Date, "2028 високосный");
  assert.equal(parseMoscowInstant("2027-04-31", "10:00"), null);
  assert.equal(check(pref("2027-02-30", "10:00")).ok, false);
});

test("BU14 прошлое время и ровно now отклонены", () => {
  const nowPref = check(pref("2026-11-05", "11:00")); // ровно now
  assert.equal(nowPref.ok, false);
  const past = check(pref("2026-11-05", "10:59"));
  assert.equal(past.ok, false);
  const future = check(pref("2026-11-06", "09:00"));
  assert.equal(future.ok, true);
});

test("BU15 московский день не зависит от локальной границы TZ", () => {
  // Полночь Москвы = 21:00 UTC: 20:59Z = 23:59 (день 5), 21:00Z = 00:00 (день 6).
  assert.equal(moscowDay(new Date("2026-11-05T20:59:00Z")).day, 5);
  const next = moscowDay(new Date("2026-11-05T21:00:00Z"));
  assert.equal(next.day, 6);
  assert.equal(next.isoDay, 5, "пятница ISO=5");
  // «сейчас» за полдень UTC остаётся текущим московским днём.
  const sameDay = check(pref("2026-11-05", "23:59"));
  assert.equal(sameDay.ok, false, "23:59 вне рабочих часов, но не другой день");
});

test("BU16 нерабочий день отклоняется", () => {
  const sunday = check(pref("2026-11-08", "10:00")); // воскресенье
  assert.equal(sunday.ok, false);
  assert.ok(!sunday.ok && sunday.issue.field === "preferred.date");
  const saturday = check(pref("2026-11-07", "10:00"));
  assert.equal(saturday.ok, true);
});

test("BU17 opens допустим, closes и некратное шагу — нет", () => {
  assert.equal(check(pref("2026-11-06", "09:00")).ok, true, "opens включён");
  const closes = check(pref("2026-11-06", "20:00"));
  assert.equal(closes.ok, false);
  assert.ok(!closes.ok && closes.issue.field === "preferred.time");
  const offStep = check(pref("2026-11-06", "09:15")); // шаг 30 от 09:00
  assert.equal(offStep.ok, false);
  assert.ok(!offStep.ok && offStep.issue.field === "preferred.time");
  assert.equal(check(pref("2026-11-06", "19:30")).ok, true);
});

test("BU18 горизонт: предельный день включительно, следующий — отказ", () => {
  // now = 05.11.2026 Мск, horizonDays=30 → 05.12.2026 включительно (суббота).
  assert.equal(check(pref("2026-12-05", "10:00")).ok, true);
  const beyond = check(pref("2026-12-07", "10:00")); // 06.12 воскресенье, берём 07.12=понедельник
  assert.equal(beyond.ok, false);
  assert.ok(!beyond.ok && beyond.issue.field === "preferred.date");
});

test("BU19 preferred обязателен только при preferenceRequired=true", () => {
  const required = check(undefined, auto);
  assert.equal(required.ok, false);
  assert.ok(!required.ok && required.issue.field === "preferred");
  const optional = structuredClone(auto);
  optional.booking.preferenceRequired = false;
  const ok = check(undefined, optional);
  assert.equal(ok.ok, true);
  assert.ok(ok.ok && ok.preferredAt === null);
});
