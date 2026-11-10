import type {
  ApiErrorCode,
  ApiErrorEnvelope,
  LeadCreateRequest,
  LeadReceipt,
} from "../../../shared/contracts.ts";

export interface SubmitOptions {
  idempotencyKey: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface SubmitResult {
  httpStatus: 200 | 201;
  receipt: LeadReceipt;
}

export type SubmitErrorKind = "network" | "timeout" | "http" | "invalid-response";

export class SubmitError extends Error {
  readonly kind: SubmitErrorKind;
  readonly httpStatus?: number;
  readonly code?: ApiErrorCode;
  readonly requestId?: string;
  readonly fieldErrors?: Record<string, string>;
  readonly retryAfterSeconds?: number;

  constructor(params: {
    kind: SubmitErrorKind;
    message: string;
    httpStatus?: number;
    code?: ApiErrorCode;
    requestId?: string;
    fieldErrors?: Record<string, string>;
    retryAfterSeconds?: number;
  }) {
    super(params.message);
    this.name = "SubmitError";
    this.kind = params.kind;
    this.httpStatus = params.httpStatus;
    this.code = params.code;
    this.requestId = params.requestId;
    this.fieldErrors = params.fieldErrors;
    this.retryAfterSeconds = params.retryAfterSeconds;
  }
}

export const UUID_WIRE_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isReceiptValid(data: unknown): data is LeadReceipt {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const obj = data as Record<string, unknown>;

  const allowedKeys = new Set(["leadId", "status", "replayed", "message"]);
  const keys = Object.keys(obj);
  if (keys.length !== 4) return false;
  for (const k of keys) {
    if (!allowedKeys.has(k)) return false;
  }

  if (typeof obj.leadId !== "string" || !UUID_WIRE_REGEX.test(obj.leadId)) {
    return false;
  }
  if (obj.status !== "received") {
    return false;
  }
  if (typeof obj.replayed !== "boolean") {
    return false;
  }
  if (
    typeof obj.message !== "string" ||
    obj.message.length < 1 ||
    obj.message.length > 300
  ) {
    return false;
  }

  return true;
}

export function parseRetryAfter(headerValue: string | null | undefined): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();
  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }
  const parsed = parseInt(trimmed, 10);
  if (Number.isSafeInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return undefined;
}

export async function submitLead(
  body: LeadCreateRequest,
  options: SubmitOptions
): Promise<SubmitResult> {
  const timeoutMs = options.timeoutMs ?? 15000;
  const controller = new AbortController();

  let timedOut = false;
  let externallyAborted = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const abortListener = () => {
    externallyAborted = true;
    controller.abort();
  };

  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timer);
      throw new SubmitError({
        kind: "network",
        message: "Запрос был отменен",
      });
    }
    options.signal.addEventListener("abort", abortListener, { once: true });
  }

  try {
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": options.idempotencyKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const httpStatus = response.status;

    if (httpStatus === 200 || httpStatus === 201) {
      let data: unknown;
      try {
        data = await response.json();
      } catch (e) {
        if (timedOut) {
          throw e;
        }
        if (externallyAborted) {
          throw e;
        }
        throw new SubmitError({
          kind: "invalid-response",
          httpStatus,
          message: "Некорректный ответ сервера",
        });
      }

      if (!isReceiptValid(data)) {
        throw new SubmitError({
          kind: "invalid-response",
          httpStatus,
          message: "Ответ сервера не соответствует квитанции заявки",
        });
      }

      return {
        httpStatus: httpStatus as 200 | 201,
        receipt: data,
      };
    }

    // HTTP Error response
    let errorEnvelope: ApiErrorEnvelope | null = null;
    try {
      const errJson = await response.json();
      if (errJson && typeof errJson === "object" && "error" in errJson) {
        errorEnvelope = errJson as ApiErrorEnvelope;
      }
    } catch (e) {
      if (timedOut) {
        throw e;
      }
      if (externallyAborted) {
        throw e;
      }
      // Non-JSON or malformed error body
    }

    const retryHeader = response.headers.get("retry-after");
    const retryAfterSeconds = parseRetryAfter(retryHeader);

    throw new SubmitError({
      kind: "http",
      httpStatus,
      code: errorEnvelope?.error?.code,
      requestId: errorEnvelope?.error?.requestId,
      fieldErrors: errorEnvelope?.error?.fieldErrors,
      retryAfterSeconds,
      message: errorEnvelope?.error?.message ?? `Ошибка сервера: HTTP ${httpStatus}`,
    });
  } catch (err: unknown) {
    if (err instanceof SubmitError) {
      throw err;
    }

    if (timedOut) {
      throw new SubmitError({
        kind: "timeout",
        message: "Время ожидания ответа сервера истекло (15 с)",
      });
    }

    if (
      externallyAborted ||
      (err instanceof Error && err.name === "AbortError" && options.signal?.aborted)
    ) {
      throw new SubmitError({
        kind: "network",
        message: "Запрос был отменен",
      });
    }

    if (err instanceof Error && err.name === "AbortError") {
      throw new SubmitError({
        kind: timedOut ? "timeout" : "network",
        message: timedOut
          ? "Время ожидания ответа сервера истекло (15 с)"
          : "Запрос был отменен",
      });
    }

    throw new SubmitError({
      kind: "network",
      message: "Не удалось подключиться к серверу. Проверьте интернет-соединение.",
    });
  } finally {
    clearTimeout(timer);
    if (options.signal) {
      options.signal.removeEventListener("abort", abortListener);
    }
  }
}
