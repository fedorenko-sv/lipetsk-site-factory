/**
 * Обработчик POST /api/leads (PR3, §6). Возвращает стандартный Response —
 * Next route.ts вызывает его с боевыми зависимостями, unit-тесты — с
 * фикстурами. Никаких PII в ответах и заголовках.
 */
import { randomUUID, createHash } from "node:crypto";
import type { RuntimeConfig } from "../config/runtime.ts";
import { loadRuntimeConfig, resolveAllowedSite } from "../config/runtime.ts";
import { computeClientHmac } from "../leads/canonical.ts";
import { createLead } from "../leads/create-lead.ts";
import { StorageUnavailableError } from "../leads/store-port.ts";
import type { LeadStore } from "../leads/store-port.ts";
import { validateLeadRequest } from "../leads/schema.ts";
import { ConfigProblem } from "../config/runtime.ts";
import { ERROR_HTTP_STATUS, buildErrorBody, buildReceipt, NO_STORE_HEADERS } from "./envelope.ts";
import {
  honeypotFilled,
  isAllowedOrigin,
  isJsonContentType,
  isValidIdempotencyKey,
  rawClientKey,
  readCappedBody,
} from "./io.ts";
import type { Clock } from "../leads/ports.ts";
import type { ApiErrorCode } from "../../shared/contracts.ts";

export interface LeadHandlerDeps {
  clock: Clock;
  env: NodeJS.ProcessEnv;
  makeStore: (runtime: RuntimeConfig) => LeadStore;
}

function jsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...NO_STORE_HEADERS, ...extraHeaders },
  });
}

function errorResponse(code: ApiErrorCode, requestId: string, options: { message?: string; fieldErrors?: Record<string, string>; retryAfterSeconds?: number } = {}): Response {
  const status = ERROR_HTTP_STATUS[code];
  const headers: Record<string, string> = {};
  if (code === "RATE_LIMITED") {
    headers["Retry-After"] = String(Math.max(1, Math.ceil(options.retryAfterSeconds ?? 60)));
  }
  return jsonResponse(status, buildErrorBody(code, requestId, options), headers);
}

export async function handleLeadCreate(request: Request, deps: LeadHandlerDeps): Promise<Response> {
  const requestId = randomUUID();

  let runtime: RuntimeConfig;
  try {
    runtime = loadRuntimeConfig(deps.env);
  } catch (problem) {
    if (problem instanceof ConfigProblem) {
      return errorResponse(problem.notReadyCode, requestId);
    }
    return errorResponse("INTERNAL_ERROR", requestId);
  }

  // 1. Origin по явному allowlist.
  if (!isAllowedOrigin(request.headers.get("origin"), runtime.allowedOrigins)) {
    return errorResponse("ORIGIN_NOT_ALLOWED", requestId);
  }
  // 2. application/json с необязательным charset.
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return errorResponse("UNSUPPORTED_MEDIA_TYPE", requestId);
  }
  // 3. Не более 16 KiB фактических байт; Content-Length не доверяется.
  const body = await readCappedBody(request);
  if (!body.ok) {
    return errorResponse(body.reason === "too-large" ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON", requestId);
  }
  // 4. Некорректный UTF-8/JSON.
  let parsed: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body.bytes);
    parsed = JSON.parse(text) as unknown;
  } catch {
    return errorResponse("INVALID_JSON", requestId);
  }
  // 5. Idempotency-Key: обязателен, UUID.
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey === null || !isValidIdempotencyKey(idempotencyKey)) {
    return errorResponse("IDEMPOTENCY_REQUIRED", requestId);
  }
  // 6. Honeypot до строгой схемы.
  if (honeypotFilled(parsed)) {
    return errorResponse("REQUEST_REJECTED", requestId);
  }
  // 7. Полная строгая схема.
  const schemaResult = validateLeadRequest(parsed);
  if (!schemaResult.ok) {
    return errorResponse("VALIDATION_FAILED", requestId, { fieldErrors: schemaResult.fieldErrors });
  }
  const wire = schemaResult.data;
  // 8. Разрешённый siteKey/привязка deployment -> 404.
  if (resolveAllowedSite(deps.env, wire.siteKey) === null) {
    return errorResponse("SITE_NOT_FOUND", requestId);
  }

  const clientHmac = createHash("sha256")
    .update(computeClientHmac(runtime.rateLimitHmacKey, rawClientKey(request, runtime.trustedIpHeader)))
    .digest("hex");

  // 9–11. Сценарий: нормализация, повтор, проверки, лимиты, транзакция.
  try {
    const result = await createLead(
      {
        runtime,
        siteLoader: (siteKey) => resolveAllowedSite(deps.env, siteKey),
        store: deps.makeStore(runtime),
        clock: deps.clock,
      },
      { idempotencyKey, clientHmac },
      wire,
    );
    switch (result.kind) {
      case "created":
        return jsonResponse(201, buildReceipt(result.leadId, false));
      case "replayed":
        return jsonResponse(200, buildReceipt(result.leadId, true));
      case "field-error":
        return errorResponse("VALIDATION_FAILED", requestId, { fieldErrors: result.fieldErrors });
      case "error": {
        if (result.code === "INTERNAL_ERROR") return errorResponse("INTERNAL_ERROR", requestId);
        return errorResponse(result.code, requestId, { retryAfterSeconds: result.retryAfterSeconds });
      }
    }
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      return errorResponse("STORAGE_UNAVAILABLE", requestId);
    }
    if (error instanceof ConfigProblem) {
      return errorResponse(error.notReadyCode, requestId);
    }
    return errorResponse("INTERNAL_ERROR", requestId);
  }
}
