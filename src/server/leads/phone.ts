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

// Явный список допустимых символов (без общего whitespace-класса): после
// префикса +7 или 8 допускаются только ASCII-цифры, U+0020, U+00A0, скобки и
// дефис. Плюс — только первым символом перед начальной 7, поэтому ++, "8+",
// "(+7)", буквы, # и любые неперечисленные символы (U+2028, U+2029, U+FEFF,
// U+200B, узкие пробелы и т.п.) не проходят.
const RU_PHONE_RE = /^(?:\+7|8)[0-9\u0020\u00A0()\u002D]+$/;

// Разрешены к обрезке на краях ровно два символа: U+0020 и U+00A0.
// trim(), \s и другие пробелы запрещены ТЗ — они бы съели невидимые символы.
const ALLOWED_SPACES = ["\u0020", "\u00A0"];
const isAllowedSpace = (c: string): boolean => ALLOWED_SPACES.includes(c);

export function normalizePhone(input: unknown, mode: "demo" | "live"): string | null {
  if (typeof input !== "string") return null;

  // Внешние пробелы (обычные и неразрывные) обрезаются. Управляющие символы
  // (включая \r и \n) не обрезаются, а отклоняются следующим шагом.
  let s = input;
  while (s.length > 0 && isAllowedSpace(s[0])) s = s.slice(1);
  while (s.length > 0 && isAllowedSpace(s[s.length - 1])) s = s.slice(0, -1);
  if (s.length === 0) return null;

  // Управляющие символы (переносы строк, табуляция и т.п.) где угодно — отказ.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(s)) return null;

  if (!RU_PHONE_RE.test(s)) return null;

  const digits = s.replace(/[^0-9]/g, "");
  if (digits.length !== 11) return null;

  const normalized = `+7${digits.slice(1)}`; // 10 цифр после +7/8

  if (mode === "live") {
    return normalized === SYNTHETIC_PHONE ? null : normalized;
  }
  // demo: только зарезервированный синтетический ввод.
  return normalized === SYNTHETIC_PHONE ? normalized : null;
}
