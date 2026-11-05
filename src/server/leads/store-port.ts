/**
 * Порт хранилища заявок (PR3, §9). Реализация на PostgreSQL обязана
 * внутри одной короткой транзакции: сериализация (siteKey, idempotencyKey)
 * -> чтение повтора -> проверки новой заявки (колбэк) -> атомарные лимиты
 * -> INSERT lead+outbox -> COMMIT. Внешних вызовов под транзакцией нет.
 */
import type { ApiErrorCode } from "../../shared/contracts.ts";
import type { PriceSnapshot } from "./matching.ts";
import type { Clock } from "./ports.ts";

export interface PreparedLeadRow {
  siteKey: string;
  configVersion: string;
  kind: "booking";
  serviceId: string;
  resourceId: string | null;
  serviceOptions: Record<string, string>;
  preferredAt: Date | null;
  /** Нормализованный телефон; вне БД/логов/URL не попадает. */
  customerPhone: string;
  customerName: string | null;
  consentVersion: string;
  consentAt: Date;
  priceSnapshot: PriceSnapshot;
  attribution: Record<string, string> | null;
  payloadHmac: string;
  destinationKey: string;
  adapterId: string;
  createdAt: Date;
}

export type FailureResult =
  | { code: "VALIDATION_FAILED"; fieldErrors: Record<string, string> }
  | { code: Exclude<ApiErrorCode, "VALIDATION_FAILED"> };

export type NewLeadDecision =
  | { ok: true; row: PreparedLeadRow }
  | { ok: false; failure: FailureResult };

export interface SubmitArgs {
  siteKey: string;
  idempotencyKey: string;
  payloadHmac: string;
  /** HMAC-ключ клиента (IP) для buckets; сырой IP не передаётся. */
  clientHmac: string;
  clock: Clock;
  /**
   * Текущие проверки новой заявки; вызываются только когда сохранённый
   * повтор не найден. Возврат ok:false откатывает транзакцию без записей.
   */
  validateNew: () => NewLeadDecision;
}

export type SubmitOutcome =
  | { kind: "created"; leadId: string }
  | { kind: "replayed"; leadId: string }
  | { kind: "conflict" }
  | { kind: "rate-limited"; retryAfterSeconds: number }
  | { kind: "rejected"; failure: FailureResult };

export interface LeadStore {
  submit(args: SubmitArgs): Promise<SubmitOutcome>;
}

/** Ошибка доступа к хранилищу (внешний вид — 503 STORAGE_UNAVAILABLE). */
export class StorageUnavailableError extends Error {
  constructor() {
    super("storage unavailable");
  }
}
