/**
 * Разбор HTTP-входа (PR3, §6): Origin-allowlist, media type, ограничение
 * фактических байтов потока, honeypot, Idempotency-Key, ключ клиента.
 * Чистые хелперы — тестируются без Next.
 */

export const MAX_BODY_BYTES = 16 * 1024;

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isAllowedOrigin(origin: string | null, allowed: string[]): boolean {
  if (origin === null) return false;
  return allowed.includes(origin);
}

/** application/json с необязательным charset; всё остальное — false. */
export function isJsonContentType(contentType: string | null): boolean {
  if (contentType === null) return false;
  const [main, ...params] = contentType.split(";");
  if (main.trim().toLowerCase() !== "application/json") return false;
  for (const param of params) {
    const [name, value] = param.split("=");
    if (name?.trim().toLowerCase() === "charset") {
      const v = (value ?? "").trim().replace(/^"|"$/g, "").toLowerCase();
      if (v !== "utf-8") return false;
    }
  }
  return true;
}

export function isValidIdempotencyKey(key: string | null): boolean {
  return key !== null && UUID_RE.test(key);
}

export type BodyReadOutcome =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: "too-large" | "unreadable" };

/**
 * Читает поток тела с пределом фактических байт (Content-Length не доверяется).
 * При превышении чтение немедленно прекращается.
 */
export async function readCappedBody(
  request: Request,
  maxBytes: number = MAX_BODY_BYTES,
): Promise<BodyReadOutcome> {
  const body = request.body;
  if (body === null) return { ok: true, bytes: new Uint8Array(0) };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return { ok: false, reason: "unreadable" };
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes: out };
}

/**
 * Безопасное распознавание заполненного honeypot до строгой схемы:
 * непустая строка antiBot.website у объектоподобного теле.
 */
export function honeypotFilled(parsed: unknown): boolean {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const antiBot = (parsed as Record<string, unknown>)["antiBot"];
  if (antiBot === null || typeof antiBot !== "object" || Array.isArray(antiBot)) return false;
  const website = (antiBot as Record<string, unknown>)["website"];
  return typeof website === "string" && website.length > 0;
}

/**
 * Ключ клиента для rate-limit. X-Forwarded-For произвольно не доверяется:
 * без документированного доверенного ingress — общий ключ "unknown".
 */
export function rawClientKey(
  request: Request,
  trustedIpHeader: string | null,
): string {
  if (!trustedIpHeader) return "unknown";
  const value = request.headers.get(trustedIpHeader);
  if (value === null || value.trim().length === 0) return "unknown";
  return value.trim().slice(0, 128);
}
