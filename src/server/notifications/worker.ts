/**
 * Worker очереди уведомлений (PR3, §12).
 * Claim: FOR UPDATE SKIP LOCKED, до 20 задач, processing, новый claim_token,
 * lease 120 секунд, attempts+1. SQL-транзакция claim завершается до send.
 * Итог обновляется по id+claim_token — просроченный worker не перезаписывает
 * новую попытку. Истёкший lease возвращается в обработку следующим claim.
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { NotificationSendError } from "../leads/ports.ts";
import type { Clock } from "../leads/ports.ts";
import {
  ADAPTER_TIMEOUT_MS,
  CLAIM_BATCH_LIMIT,
  LEASE_SECONDS,
  MAX_ATTEMPTS,
  decideAfterFailure,
} from "./schedule.ts";
import type { AdapterRegistry } from "./registry.ts";

export interface ClaimedJob {
  id: string;
  leadId: string;
  siteKey: string;
  destinationKey: string;
  adapterId: string;
  claimToken: string;
  attempts: number;
  /**
   * BR1: восстановление задачи, у которой уже исчерпан бюджет попыток
   * (processing + просроченный lease при attempts >= MAX_ATTEMPTS).
   * Такая задача не отправляется повторно: сверка receipt -> sent, иначе dead.
   */
  recovery: boolean;
}

export interface OutboxCounts {
  processed: number;
  sent: number;
  retried: number;
  dead: number;
}

export interface OutboxRepo {
  claimBatch(limit: number, now: Date): Promise<ClaimedJob[]>;
  markSent(id: string, claimToken: string, now: Date): Promise<boolean>;
  scheduleRetry(id: string, claimToken: string, nextAttemptAt: Date, errorCode: string, now: Date): Promise<boolean>;
  markDead(id: string, claimToken: string, errorCode: string, now: Date): Promise<boolean>;
  hasReceipt(id: string): Promise<boolean>;
}

export class PgOutboxRepo implements OutboxRepo {
  #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async claimBatch(limit: number, now: Date): Promise<ClaimedJob[]> {
    const claimToken = randomUUID();
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{
        id: string; lead_id: string; site_key: string;
        destination_key: string; adapter_id: string; attempts: number;
        prev_attempts: number;
      }>(
        // BR1: истёкшая processing возвращается всегда (любой attempts) —
        // иначе задача с attempts=8 зависает в processing навсегда. При
        // исчерпанном бюджете attempts не увеличивается: повторной отправки
        // быть не должно, исход решает runOutboxBatch (receipt->sent / dead).
        `WITH picked AS (
           SELECT id, attempts AS prev_attempts FROM notification_outbox
           WHERE
             (status = 'pending' AND next_attempt_at <= $2 AND attempts < $5)
             OR (status = 'processing' AND lease_until < $2)
           ORDER BY next_attempt_at
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         UPDATE notification_outbox o
         SET status = 'processing',
             claim_token = $3,
             lease_until = $2 + make_interval(secs => $4::int),
             attempts = CASE WHEN o.attempts < $5 THEN o.attempts + 1 ELSE o.attempts END,
             updated_at = now()
         FROM picked p
         WHERE o.id = p.id
         RETURNING o.id, o.lead_id, o.site_key, o.destination_key, o.adapter_id,
                   o.attempts, p.prev_attempts`,
        [limit, now, claimToken, LEASE_SECONDS, MAX_ATTEMPTS],
      );
      await client.query("COMMIT");
      return result.rows.map((r) => ({
        id: r.id,
        leadId: r.lead_id,
        siteKey: r.site_key,
        destinationKey: r.destination_key,
        adapterId: r.adapter_id,
        claimToken,
        attempts: r.attempts,
        recovery: r.prev_attempts >= MAX_ATTEMPTS,
      }));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async markSent(id: string, claimToken: string, now: Date): Promise<boolean> {
    const result = await this.#pool.query(
      `UPDATE notification_outbox
       SET status = 'sent', lease_until = NULL, claim_token = NULL,
           last_error_code = NULL, updated_at = $3
       WHERE id = $1 AND claim_token = $2 AND status = 'processing'`,
      [id, claimToken, now],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async scheduleRetry(
    id: string, claimToken: string, nextAttemptAt: Date, errorCode: string, now: Date,
  ): Promise<boolean> {
    const result = await this.#pool.query(
      `UPDATE notification_outbox
       SET status = 'pending', next_attempt_at = $3, lease_until = NULL,
           claim_token = NULL, last_error_code = $4, updated_at = $5
       WHERE id = $1 AND claim_token = $2 AND status = 'processing'`,
      [id, claimToken, nextAttemptAt, errorCode, now],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markDead(id: string, claimToken: string, errorCode: string, now: Date): Promise<boolean> {
    const result = await this.#pool.query(
      `UPDATE notification_outbox
       SET status = 'dead', lease_until = NULL,
           claim_token = NULL, last_error_code = $3, updated_at = $4
       WHERE id = $1 AND claim_token = $2 AND status = 'processing'`,
      [id, claimToken, errorCode, now],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** BR1: есть ли уже долговременное свидетельство по этой задаче. */
  async hasReceipt(id: string): Promise<boolean> {
    const result = await this.#pool.query(
      "SELECT 1 FROM notification_receipts WHERE outbox_id = $1",
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

/** Отправка с таймаутом адаптера 10 секунд через AbortSignal. */
async function sendWithTimeout(
  port: { send(job: ClaimedJob, signal: AbortSignal): Promise<unknown> },
  job: ClaimedJob,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ADAPTER_TIMEOUT_MS);
  try {
    await port.send(job, controller.signal);
  } catch (error) {
    if (controller.signal.aborted) throw new NotificationSendError("TIMEOUT");
    if (error instanceof NotificationSendError) throw error;
    throw new NotificationSendError("SEND_FAILED");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Одна пачка: claim -> обработка вне SQL-транзакции -> итог по claim_token.
 * BR1d: ограниченная конкурентность (BATCH_CONCURRENCY) держит худшее время
 * пачки (ceil(20/4)*10 с = 50 с) заметно ниже lease 120 с; перед стартом
 * отправки задача проверяется по lease-бюджету — отправка с уже потерянным
 * (по оценке) lease не начинается, а уходит запланированный повтор.
 * Возвращает только агрегатные счётчики (для internal route без контактов).
 */
export const BATCH_CONCURRENCY = 4;

async function processJob(
  repo: OutboxRepo,
  registry: AdapterRegistry,
  clock: Clock,
  job: ClaimedJob,
  claimAtMs: number,
  counts: OutboxCounts,
): Promise<void> {
  counts.processed += 1;

  // BR1a/BR1b: восстановление задачи с исчерпанным бюджетом попыток.
  // Повторной (девятой) отправки нет: есть свидетельство -> sent, нет -> dead.
  if (job.recovery) {
    const now = clock.now();
    if (await repo.hasReceipt(job.id)) {
      const updated = await repo.markSent(job.id, job.claimToken, now);
      if (updated) counts.sent += 1;
    } else {
      const updated = await repo.markDead(job.id, job.claimToken, "LEASE_EXPIRED", now);
      if (updated) counts.dead += 1;
    }
    return;
  }

  // BR1d: не начинать отправку, если lease почти гарантированно потерян.
  const leaseEndsAtMs = claimAtMs + LEASE_SECONDS * 1000;
  if (clock.now().getTime() + ADAPTER_TIMEOUT_MS >= leaseEndsAtMs) {
    const now = clock.now();
    const decision = decideAfterFailure(job.attempts, now);
    if (decision.kind === "dead") {
      const updated = await repo.markDead(job.id, job.claimToken, "SEND_BUDGET", now);
      if (updated) counts.dead += 1;
    } else {
      const updated = await repo.scheduleRetry(
        job.id, job.claimToken, decision.nextAttemptAt, "SEND_BUDGET", now,
      );
      if (updated) counts.retried += 1;
    }
    return;
  }

  let adapter;
  try {
    adapter = registry.get(job.adapterId);
  } catch {
    // Неизвестный адаптер — конфигурационная ошибка; fake-success нет.
    adapter = null;
  }
  const now = clock.now();
  if (adapter === null) {
    const decision = decideAfterFailure(job.attempts, now);
    if (decision.kind === "dead") {
      const updated = await repo.markDead(job.id, job.claimToken, "CONFIG_ERROR", now);
      if (updated) counts.dead += 1;
    } else {
      const updated = await repo.scheduleRetry(
        job.id, job.claimToken, decision.nextAttemptAt, "CONFIG_ERROR", now,
      );
      if (updated) counts.retried += 1;
    }
    return;
  }
  try {
    await sendWithTimeout(adapter, job);
    const updated = await repo.markSent(job.id, job.claimToken, clock.now());
    if (updated) counts.sent += 1;
    // updated=false: lease истёк во время send, задачу уже забрал другой worker.
  } catch (error) {
    const safeCode = error instanceof NotificationSendError ? error.safeCode : "SEND_FAILED";
    const decision = decideAfterFailure(job.attempts, clock.now());
    const failNow = clock.now();
    if (decision.kind === "dead") {
      const updated = await repo.markDead(job.id, job.claimToken, safeCode, failNow);
      if (updated) counts.dead += 1;
    } else {
      const updated = await repo.scheduleRetry(
        job.id, job.claimToken, decision.nextAttemptAt, safeCode, failNow,
      );
      if (updated) counts.retried += 1;
    }
  }
}

export async function runOutboxBatch(
  repo: OutboxRepo,
  registry: AdapterRegistry,
  clock: Clock,
  limit: number = CLAIM_BATCH_LIMIT,
): Promise<OutboxCounts> {
  const counts: OutboxCounts = { processed: 0, sent: 0, retried: 0, dead: 0 };
  const claimAtMs = clock.now().getTime();
  const jobs = await repo.claimBatch(Math.min(limit, CLAIM_BATCH_LIMIT), clock.now());
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(BATCH_CONCURRENCY, Math.max(1, jobs.length)) },
    async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor];
        cursor += 1;
        await processJob(repo, registry, clock, job, claimAtMs, counts);
      }
    },
  );
  await Promise.all(workers);
  return counts;
}
