/**
 * Нормализация телефона заявки (PR-3, задача B1).
 *
 * Чистая функция: не читает env, не логирует вход, не делает сетевых вызовов,
 * не бросает исключение на неверный пользовательский ввод — только
 * нормализованный +7XXXXXXXXXX или null.
 *
 * Правила взяты из docs/03-api-contract.md (валидация customer.phone)
 * и agents/tasks/B1-phone.md:
 * - формы +7XXXXXXXXXX и 8XXXXXXXXXX, форматирование пробелами (включая
 *   неразрывные), скобками и дефисами; внешние пробелы обрезаются;
 * - ровно 11 цифр; переносы строк и управляющие символы отклоняются;
 * - в live отклоняется синтетический номер, зарезервированный
 *   контрактом; в demo принимается только он.
 */

/** Синтетический тестовый номер, зарезервированный контрактом для demo. */
const SYNTHETIC_PHONE = "+7" + "0".repeat(10);

// После отсечения внешних пробелов: +7 или 8, далее цифры и разделители
// "пробел / неразрывный пробел / скобка / дефис". Плюс допускается только
// первым символом, поэтому ++, "8+", "(+7)", буквы и # не проходят.
const RU_PHONE_RE = /^(?:\+7|8)[\s\u00A0()\-\d]+$/;

// Только пробелы (обычный, неразрывные, узкий). \n, \r, \t — не пробелы:
// они не обрезаются и отклоняются проверкой управляющих символов.
const isSpace = (c: string): boolean =>
  c === " " || c === "\u00A0" || c === "\u202F" || c === "\u2009";

export function normalizePhone(input: unknown, mode: "demo" | "live"): string | null {
  if (typeof input !== "string") return null;

  // Внешние пробелы (обычные и неразрывные) обрезаются. Управляющие символы
  // (включая \r и \n) не обрезаются, а отклоняются следующим шагом.
  let s = input;
  while (s.length > 0 && isSpace(s[0])) s = s.slice(1);
  while (s.length > 0 && isSpace(s[s.length - 1])) s = s.slice(0, -1);
  if (s.length === 0) return null;

  // Управляющие символы (переносы строк, табуляция и т.п.) где угодно — отказ.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(s)) return null;

  if (!RU_PHONE_RE.test(s)) return null;

  const digits = s.replace(/\D/g, "");
  if (digits.length !== 11) return null;

  const normalized = `+7${digits.slice(1)}`; // 10 цифр после +7/8

  if (mode === "live") {
    return normalized === SYNTHETIC_PHONE ? null : normalized;
  }
  // demo: только зарезервированный синтетический ввод.
  return normalized === SYNTHETIC_PHONE ? normalized : null;
}
