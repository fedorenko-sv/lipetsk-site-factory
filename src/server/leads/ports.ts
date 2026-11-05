/**
 * Внутренние порты серверного сценария (PR3, раздел 5 ТЗ).
 * Сценарий CreateLead зависит только от этих интерфейсов; конкретные
 * реализации (PostgreSQL, recording-адаптер, системные часы) внедряются
 * снаружи. Публичные типы — из src/shared/contracts.ts.
 */

export interface Clock {
  now(): Date;
}

export interface RequestContext {
  requestId: string;
  idempotencyKey: string;
  /** Стабильный ключ клиента для rate-limit (HMAC IP или "unknown"). */
  clientKey: string;
}

export interface NotificationJob {
  id: string;
  leadId: string;
  siteKey: string;
  destinationKey: string;
  adapterId: string;
  claimToken: string;
}

export interface NotificationResult {
  receiptId: string;
}

export interface NotificationPort {
  send(job: NotificationJob, signal: AbortSignal): Promise<NotificationResult>;
}

/** Исключение адаптера: только безопасный код, без PII и сырых ответов. */
export class NotificationSendError extends Error {
  readonly safeCode: string;
  constructor(safeCode: string) {
    super(safeCode);
    this.safeCode = safeCode;
  }
}

export const SYSTEM_CLOCK: Clock = { now: () => new Date() };
