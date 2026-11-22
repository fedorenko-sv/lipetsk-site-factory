/**
 * Расписание повторов worker (PR3, §12): после попыток 1–7 задержки
 * 1/5/15/30/60/120/240 минут; после неудачи попытки 8 — dead.
 * Чистые функции, момент времени передаётся Clock.
 */

export const MAX_ATTEMPTS = 8;
export const RETRY_DELAY_MINUTES: readonly number[] = [1, 5, 15, 30, 60, 120, 240];
export const LEASE_SECONDS = 120;
export const ADAPTER_TIMEOUT_MS = 10_000;
export const CLAIM_BATCH_LIMIT = 20;

export type AttemptDecision =
  | { kind: "retry"; nextAttemptAt: Date }
  | { kind: "dead" };

/**
 * Решение после неудачной попытки номера attempts (1-based, attempts увеличивается
 * при claim). attempts >= MAX_ATTEMPTS -> dead.
 */
export function decideAfterFailure(attempts: number, now: Date): AttemptDecision {
  if (attempts >= MAX_ATTEMPTS) return { kind: "dead" };
  const delayMinutes = RETRY_DELAY_MINUTES[attempts - 1];
  if (delayMinutes === undefined) return { kind: "dead" };
  return { kind: "retry", nextAttemptAt: new Date(now.getTime() + delayMinutes * 60_000) };
}

/** Нижняя граница из Retry-After провайдера (когда появится реальный адаптер). */
export function withProviderRetryFloor(
  decision: AttemptDecision,
  retryAfterSeconds: number | null,
  now: Date,
): AttemptDecision {
  if (decision.kind !== "retry" || retryAfterSeconds === null) return decision;
  const minDelayMs = Math.max(0, Math.floor(retryAfterSeconds)) * 1000;
  return {
    kind: "retry",
    nextAttemptAt: new Date(
      Math.max(decision.nextAttemptAt.getTime(), now.getTime() + minDelayMs),
    ),
  };
}
