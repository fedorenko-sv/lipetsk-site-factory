import type { SiteConfig, TimePreference } from "../../../shared/contracts.ts";

export type SiteBookingConfig = SiteConfig["booking"];

export interface MoscowParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  isoDayOfWeek: number; // 1 = Monday, 7 = Sunday
  dateString: string; // YYYY-MM-DD
  timeString: string; // HH:MM
}

const WEEKDAY_MAP: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export function getMoscowParts(date: Date = new Date()): MoscowParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  const year = parseInt(get("year"), 10);
  const month = parseInt(get("month"), 10);
  const day = parseInt(get("day"), 10);
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0;
  const minute = parseInt(get("minute"), 10);
  const isoDayOfWeek = WEEKDAY_MAP[get("weekday")] ?? 1;

  const dateString = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const timeString = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  return { year, month, day, hour, minute, isoDayOfWeek, dateString, timeString };
}

export function parseMoscowDate(dateString: string): { year: number; month: number; day: number; isoDayOfWeek: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  // Validate calendar bounds
  const check = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  const parts = getMoscowParts(check);
  return { year, month, day, isoDayOfWeek: parts.isoDayOfWeek };
}

export function getDateBounds(horizonDays: number, now: Date = new Date()): { minDate: string; maxDate: string } {
  const moscowNow = getMoscowParts(now);
  const minDate = moscowNow.dateString;

  // Add horizonDays in UTC to avoid local timezone drift
  const maxUtc = new Date(Date.UTC(moscowNow.year, moscowNow.month - 1, moscowNow.day + horizonDays, 12, 0, 0));
  const maxParts = getMoscowParts(maxUtc);
  return { minDate, maxDate: maxParts.dateString };
}

export function parseMinutes(time: string): number {
  const [h, m] = time.split(":").map((v) => parseInt(v, 10));
  return h * 60 + m;
}

export function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function generateAllTimeSlots(opens: string, closes: string, stepMinutes: number): string[] {
  const start = parseMinutes(opens);
  const end = parseMinutes(closes);
  const slots: string[] = [];

  for (let current = start; current < end; current += stepMinutes) {
    slots.push(formatMinutes(current));
  }
  return slots;
}

export function getAvailableTimeSlots(
  dateString: string,
  booking: SiteBookingConfig,
  now: Date = new Date()
): string[] {
  const parsed = parseMoscowDate(dateString);
  if (!parsed) return [];

  const { minDate, maxDate } = getDateBounds(booking.horizonDays, now);
  if (dateString < minDate || dateString > maxDate) return [];

  // Check if working day
  if (!booking.workingHours.days.includes(parsed.isoDayOfWeek)) {
    return [];
  }

  const allSlots = generateAllTimeSlots(
    booking.workingHours.opens,
    booking.workingHours.closes,
    booking.timeStepMinutes
  );

  const moscowNow = getMoscowParts(now);
  if (dateString === moscowNow.dateString) {
    // Strictly in future
    return allSlots.filter((slot) => slot > moscowNow.timeString);
  }

  return allSlots;
}

export function isDateWorkingDay(dateString: string, workingDays: number[]): boolean {
  const parsed = parseMoscowDate(dateString);
  if (!parsed) return false;
  return workingDays.includes(parsed.isoDayOfWeek);
}

export function validateTimePreference(
  preference: TimePreference | undefined,
  booking: SiteBookingConfig,
  now: Date = new Date()
): { valid: boolean; error?: string } {
  if (!preference) {
    return { valid: false, error: "Выберите удобную дату и время" };
  }

  if (preference.timezone !== "Europe/Moscow") {
    return { valid: false, error: "Часовой пояс должен быть Europe/Moscow" };
  }

  const slots = getAvailableTimeSlots(preference.date, booking, now);
  if (slots.length === 0) {
    const parsed = parseMoscowDate(preference.date);
    if (parsed && !booking.workingHours.days.includes(parsed.isoDayOfWeek)) {
      return { valid: false, error: "Выбран нерабочий день" };
    }
    return { valid: false, error: "На эту дату нет доступного времени" };
  }

  if (!slots.includes(preference.time)) {
    return { valid: false, error: "Выбранное время недоступно" };
  }

  return { valid: true };
}
