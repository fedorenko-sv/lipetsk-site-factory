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
      }>(
        `WITH picked AS (
           SELECT id FROM notification_outbox
           WHERE attempts < 8
             AND (
               (status = 'pending' AND next_attempt_at <= $2)
               OR (status = 'processing' AND lease_until < $2)
             )
           ORDER BY next_attempt_at
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         UPDATE notification_outbox o
         SET status = 'processing',
             claim_token = $3,
             lease_until = $2 + make_interval(secs => $4::int),
             attempts = o.attempts + 1,
             updated_at = now()
         FROM picked p
         WHERE o.id = p.id
         RETURNING o.id, o.lead_id, o.site_key, o.destination_key, o.adapter_id, o.attempts`,
        [limit, now, claimToken, LEASE_SECONDS],
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
 * Одна пачка: claim -> send вне SQL-транзакции -> итог по claim_token.
 * Возвращает только агрегатные счётчики (для internal route без контактов).
 */
export async function runOutboxBatch(
  repo: OutboxRepo,
  registry: AdapterRegistry,
  clock: Clock,
  limit: number = CLAIM_BATCH_LIMIT,
): Promise<OutboxCounts> {
  const counts: OutboxCounts = { processed: 0, sent: 0, retried: 0, dead: 0 };
  const jobs = await repo.claimBatch(Math.min(limit, CLAIM_BATCH_LIMIT), clock.now());
  for (const job of jobs) {
    counts.processed += 1;
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
      continue;
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
  return counts;
}
