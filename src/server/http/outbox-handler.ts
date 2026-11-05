/**
 * Защищённый запуск пачки worker (PR3, §12): Bearer OUTBOX_SECRET, no-store.
 * Неверный/отсутствующий секрет — 401 без действий. Ответ — только агрегатные
 * счётчики; контактов и SQL-параметров нет. Параметры запроса игнорируются:
 * размер пачки ограничен сервером.
 */
import { timingSafeEqual } from "node:crypto";
import { loadRuntimeConfig, ConfigProblem } from "../config/runtime.ts";
import { NO_STORE_HEADERS } from "./envelope.ts";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...NO_STORE_HEADERS } });
}

export interface OutboxHandlerDeps {
  env: NodeJS.ProcessEnv;
  runBatch: () => Promise<{ processed: number; sent: number; retried: number; dead: number }>;
}

export async function handleOutboxRun(request: Request, deps: OutboxHandlerDeps): Promise<Response> {
  let secret: string;
  try {
    secret = loadRuntimeConfig(deps.env).outboxSecret;
  } catch (problem) {
    if (problem instanceof ConfigProblem) return json(503, { error: { message: "not ready" } });
    return json(500, { error: { message: "internal" } });
  }
  const auth = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(auth);
  if (!match || !safeEqual(match[1], secret)) {
    return json(401, { error: { message: "unauthorized" } });
  }
  try {
    const counts = await deps.runBatch();
    return json(200, counts);
  } catch (error) {
    // Безопасно в лог: только имя ошибки, без SQL, DSN и PII (BI33).
    console.error(`outbox run failed: ${error instanceof Error ? error.name : "unknown"}`);
    return json(503, { error: { message: "storage unavailable" } });
  }
}
