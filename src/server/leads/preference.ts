/**
 * Проверка предпочтительного времени (PR3, раздел 8 ТЗ).
 * Чистая функция: Europe/Moscow фиксированным смещением +03:00 (Россия без
 * DST с 2014 г.), поэтому московский смысл не зависит от TZ процесса.
 */
import type { SiteConfig, TimePreference } from "../../shared/contracts.ts";

export const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
export const MOSCOW_TZ = "Europe/Moscow";

export type PreferenceIssue =
  | { field: "preferred"; message: string }
  | { field: "preferred.date"; message: string }
  | { field: "preferred.time"; message: string };

export type PreferenceOutcome =
  | { ok: true; preferredAt: Date | null }
  | { ok: false; issue: PreferenceIssue };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Московский календарный день абсолютного момента: {y, m, d, dayOfWeek ISO}. */
export function moscowDay(instant: Date): {
  year: number; month: number; day: number; isoDay: number;
} {
  const shifted = new Date(instant.getTime() + MOSCOW_OFFSET_MS);
  // ISO день недели: 1=понедельник..7=воскресенье.
  const jsDay = shifted.getUTCDay();
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    isoDay: jsDay === 0 ? 7 : jsDay,
  };
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseMoscowInstant(date: string, time: string): Date | null {
  const dm = DATE_RE.exec(date);
  const tm = TIME_RE.exec(time);
  if (!dm || !tm) return null;
  const year = Number(dm[1]);
  const month = Number(dm[2]);
  const day = Number(dm[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  // Московское время как UTC-мгновениe смещением +03:00.
  const instant = Date.UTC(year, month - 1, day, Number(tm[1]), Number(tm[2]), 0, 0);
  if (Number.isNaN(instant)) return null;
  const round = new Date(instant - MOSCOW_OFFSET_MS);
  const rt = moscowDay(round);
  if (rt.year !== year || rt.month !== month || rt.day !== day) return null;
  return round;
}

function parseMinutes(hhmm: string): number {
  const tm = TIME_RE.exec(hhmm);
  if (!tm) return NaN;
  return Number(tm[1]) * 60 + Number(tm[2]);
}

const FUTURE_MSG = "Укажите будущие дату и время.";
const HORIZON_MSG = "Дата слишком далеко.";
const WORKDAY_MSG = "В этот день приём заявок не выполняется.";
const RANGE_MSG = "Время вне рабочих часов.";
const STEP_MSG = "Время не совпадает с шагом расписания.";
const REQUIRED_MSG = "Укажите желаемые дату и время.";

/**
 * Валидация предпочтения относительно конфигурации и момента now.
 * preferred отсутствует: допустимо только при preferenceRequired=false.
 */
export function checkPreference(
  preferred: TimePreference | undefined,
  config: SiteConfig,
  now: Date,
): PreferenceOutcome {
  const booking = config.booking;
  if (preferred === undefined || preferred === null) {
    if (booking.preferenceRequired) {
      return { ok: false, issue: { field: "preferred", message: REQUIRED_MSG } };
    }
    return { ok: true, preferredAt: null };
  }
  if (preferred.timezone !== MOSCOW_TZ) {
    return { ok: false, issue: { field: "preferred", message: "Неподдерживаемая временная зона." } };
  }
  const instant = parseMoscowInstant(preferred.date, preferred.time);
  if (!instant) {
    return { ok: false, issue: { field: "preferred.date", message: "Некорректная дата или время." } };
  }
  if (!(instant.getTime() > now.getTime())) {
    return { ok: false, issue: { field: "preferred", message: FUTURE_MSG } };
  }
  // Горизонт: московское today + horizonDays включительно.
  const target = moscowDay(instant);
  const today = moscowDay(now);
  const targetOrdinal = Date.UTC(target.year, target.month - 1, target.day);
  const todayOrdinal = Date.UTC(today.year, today.month - 1, today.day);
  const diffDays = Math.round((targetOrdinal - todayOrdinal) / 86_400_000);
  if (diffDays > booking.horizonDays) {
    return { ok: false, issue: { field: "preferred.date", message: HORIZON_MSG } };
  }
  if (!booking.workingHours.days.includes(target.isoDay)) {
    return { ok: false, issue: { field: "preferred.date", message: WORKDAY_MSG } };
  }
  const startMin = parseMinutes(booking.workingHours.opens);
  const endMin = parseMinutes(booking.workingHours.closes);
  const min = parseMinutes(preferred.time);
  if (min < startMin || min >= endMin) {
    return { ok: false, issue: { field: "preferred.time", message: RANGE_MSG } };
  }
  if ((min - startMin) % booking.timeStepMinutes !== 0) {
    return { ok: false, issue: { field: "preferred.time", message: STEP_MSG } };
  }
  return { ok: true, preferredAt: instant };
}
