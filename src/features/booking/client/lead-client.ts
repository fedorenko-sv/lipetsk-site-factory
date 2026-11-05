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

export function isReceiptValid(data: unknown): data is LeadReceipt {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.leadId === "string" &&
    obj.leadId.length > 0 &&
    obj.status === "received" &&
    typeof obj.replayed === "boolean" &&
    typeof obj.message === "string"
  );
}

export async function submitLead(
  body: LeadCreateRequest,
  options: SubmitOptions
): Promise<SubmitResult> {
  const timeoutMs = options.timeoutMs ?? 15000;
  const controller = new AbortController();

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const abortListener = () => {
    controller.abort();
  };

  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timer);
      throw new SubmitError({
        kind: "network",
        message: "Запрос был отменён",
      });
    }
    options.signal.addEventListener("abort", abortListener);
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

    clearTimeout(timer);

    const httpStatus = response.status;

    if (httpStatus === 200 || httpStatus === 201) {
      let data: unknown;
      try {
        data = await response.json();
      } catch {
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

    // HTTP Error
    let errorEnvelope: ApiErrorEnvelope | null = null;
    try {
      const errJson = await response.json();
      if (errJson && typeof errJson === "object" && "error" in errJson) {
        errorEnvelope = errJson as ApiErrorEnvelope;
      }
    } catch {
      // response was not JSON
    }

    let retryAfterSeconds: number | undefined;
    const retryHeader = response.headers.get("retry-after");
    if (retryHeader) {
      const parsedSeconds = parseInt(retryHeader, 10);
      if (Number.isInteger(parsedSeconds) && parsedSeconds > 0) {
        retryAfterSeconds = parsedSeconds;
      }
    }

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
    clearTimeout(timer);

    if (err instanceof SubmitError) {
      throw err;
    }

    if (timedOut) {
      throw new SubmitError({
        kind: "timeout",
        message: "Время ожидания ответа сервера истекло (15 с)",
      });
    }

    if (err instanceof Error && err.name === "AbortError") {
      throw new SubmitError({
        kind: "network",
        message: "Запрос был отменен",
      });
    }

    throw new SubmitError({
      kind: "network",
      message: "Не удалось подключиться к серверу. Проверьте интернет-соединение.",
    });
  } finally {
    if (options.signal) {
      options.signal.removeEventListener("abort", abortListener);
    }
  }
}
