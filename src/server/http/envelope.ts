/**
 * HTTP-конверт ответов (PR3, §6, §docs/09). Каждый ответ: Cache-Control
 * no-store. Ошибки — ErrorEnvelope без stack/SQL/PII (BU28).
 */
import type { ApiErrorCode, LeadReceipt } from "../../shared/contracts.ts";

export const NO_STORE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

/** Только документированные соответствия кода ошибки и статуса. */
export const ERROR_HTTP_STATUS: Record<ApiErrorCode, number> = {
  INVALID_JSON: 400,
  IDEMPOTENCY_REQUIRED: 400,
  ORIGIN_NOT_ALLOWED: 403,
  SITE_NOT_FOUND: 404,
  IDEMPOTENCY_CONFLICT: 409,
  CONFIG_CHANGED: 409,
  CONSENT_CHANGED: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  VALIDATION_FAILED: 422,
  REQUEST_REJECTED: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  STORAGE_UNAVAILABLE: 503,
  DEMO_NOT_READY: 503,
  LIVE_NOT_READY: 503,
};

const SAFE_DEFAULT_MESSAGES: Record<ApiErrorCode, string> = {
  INVALID_JSON: "Некорректные данные запроса.",
  IDEMPOTENCY_REQUIRED: "Отсутствует или некорректен ключ повторной отправки.",
  ORIGIN_NOT_ALLOWED: "Запросы с этого источника не принимаются.",
  SITE_NOT_FOUND: "Страница не найдена.",
  IDEMPOTENCY_CONFLICT: "Такой ключ уже использован с другими данными.",
  CONFIG_CHANGED: "Условия обновились. Обновите страницу и повторите.",
  CONSENT_CHANGED: "Правила обновились. Обновите страницу и повторите.",
  PAYLOAD_TOO_LARGE: "Слишком большой запрос.",
  UNSUPPORTED_MEDIA_TYPE: "Неподдерживаемый формат запроса.",
  VALIDATION_FAILED: "Проверьте поля формы.",
  REQUEST_REJECTED: "Заявка отклонена.",
  RATE_LIMITED: "Слишком много заявок. Повторите позже.",
  INTERNAL_ERROR: "Внутренняя ошибка. Попробуйте позже.",
  STORAGE_UNAVAILABLE: "Сервис временно недоступен. Попробуйте позже.",
  DEMO_NOT_READY: "Демонстрационный режим временно недоступен.",
  LIVE_NOT_READY: "Приём заявок временно недоступен.",
};

export interface ErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    fieldErrors?: Record<string, string>;
  };
}

export function buildErrorBody(
  code: ApiErrorCode,
  requestId: string,
  options: { message?: string; fieldErrors?: Record<string, string> } = {},
): ErrorBody {
  const error: ErrorBody["error"] = {
    code,
    message: options.message ?? SAFE_DEFAULT_MESSAGES[code],
    requestId,
  };
  if (options.fieldErrors && Object.keys(options.fieldErrors).length > 0) {
    error.fieldErrors = options.fieldErrors;
  }
  return { error };
}

export function buildReceipt(leadId: string, replayed: boolean): LeadReceipt {
  return {
    leadId,
    status: "received",
    replayed,
    message: "Заявка получена. Администратор подтвердит удобное время.",
  };
}
