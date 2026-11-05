/**
 * PgLeadStore: транзакционная конкурентная идемпотентность и персистентные
 * лимиты (PR3, §9–§11). Внутри одной транзакции:
 * pg_advisory_xact_lock(hash(siteKey,key)) -> чтение повтора -> validateNew ->
 * атомарные rate buckets (сначала site, затем site+client — единый порядок
 * блокировок) -> INSERT lead+outbox -> COMMIT.
 * Коллизия hashtext только сериализует лишние запросы; UNIQUE остаётся
 * главной гарантией. Внешних сетевых вызовов под транзакцией нет.
 */
import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { StorageUnavailableError } from "../leads/store-port.ts";
import type { LeadStore, SubmitArgs, SubmitOutcome } from "../leads/store-port.ts";

/** Ошибки доступа к БД наружу не выпускаются — только StorageUnavailableError. */
function storageUnavailable(error: unknown): never {
  void error;
  throw new StorageUnavailableError();
}

export const RATE_SITE_PER_HOUR = 100;
export const RATE_SITE_CLIENT_PER_10MIN = 5;
const SITE_WINDOW_SECONDS = 3600;
const CLIENT_WINDOW_SECONDS = 600;

function windowStartSeconds(epochSeconds: number, windowSeconds: number): number {
  return Math.floor(epochSeconds / windowSeconds) * windowSeconds;
}

export class PgLeadStore implements LeadStore {
  #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async #consumeBucket(
    client: PoolClient,
    scope: "site" | "site_client",
    keyHmac: string,
    nowMs: number,
    windowSeconds: number,
    limit: number,
  ): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
    const epochSeconds = Math.floor(nowMs / 1000);
    const windowStart = windowStartSeconds(epochSeconds, windowSeconds);
    const windowEnd = windowStart + windowSeconds;
    const result = await client.query(
      `INSERT INTO rate_limits (scope, key_hmac, window_start, count, expires_at)
       VALUES ($1, $2, to_timestamp($3), 1, to_timestamp($4))
       ON CONFLICT (scope, key_hmac, window_start)
       DO UPDATE SET count = rate_limits.count + 1, expires_at = EXCLUDED.expires_at
       WHERE rate_limits.count < $5
       RETURNING count`,
      [scope, keyHmac, windowStart, windowEnd + 86_400, limit],
    );
    if (result.rowCount === 0) {
      return { ok: false, retryAfterSeconds: Math.max(1, windowEnd - epochSeconds) };
    }
    return { ok: true };
  }

  async submit(args: SubmitArgs): Promise<SubmitOutcome> {
    const { siteKey, idempotencyKey, payloadHmac } = args;
    let client: PoolClient | null = null;
    try {
      client = await this.#pool.connect();
      await client.query("BEGIN");
      // Сериализация ключа: стабильный хэш пары site+key.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${siteKey}:${idempotencyKey}`]);

      const existing = await client.query<{ id: string; payload_hmac: string }>(
        "SELECT id, payload_hmac FROM leads WHERE site_key = $1 AND idempotency_key = $2",
        [siteKey, idempotencyKey],
      );
      if (existing.rowCount && existing.rows[0]) {
        const row = existing.rows[0];
        if (row.payload_hmac === payloadHmac) {
          await client.query("ROLLBACK");
          return { kind: "replayed", leadId: row.id };
        }
        await client.query("ROLLBACK");
        return { kind: "conflict" };
      }

      const decision = args.validateNew();
      if (!decision.ok) {
        await client.query("ROLLBACK");
        return { kind: "rejected", failure: decision.failure };
      }
      const row = decision.row;

      // Единый порядок bucket-блокировок: сначала site, затем site+client.
      const nowMs = args.clock.now().getTime();
      const siteBucket = await this.#consumeBucket(
        client, "site", row.siteKey, nowMs, SITE_WINDOW_SECONDS, RATE_SITE_PER_HOUR,
      );
      if (!siteBucket.ok) {
        await client.query("ROLLBACK");
        return { kind: "rate-limited", retryAfterSeconds: siteBucket.retryAfterSeconds };
      }
      const clientBucket = await this.#consumeBucket(
        client, "site_client", `${row.siteKey}|${args.clientHmac}`, nowMs,
        CLIENT_WINDOW_SECONDS, RATE_SITE_CLIENT_PER_10MIN,
      );
      if (!clientBucket.ok) {
        await client.query("ROLLBACK");
        return { kind: "rate-limited", retryAfterSeconds: clientBucket.retryAfterSeconds };
      }

      const leadId = randomUUID();
      try {
        await client.query(
          `INSERT INTO leads (
             id, site_key, config_version, kind, service_id, resource_id,
             service_options, preferred_at, timezone, customer_phone, customer_name,
             consent_version, consent_at, status, price_snapshot, attribution,
             idempotency_key, payload_hmac, created_at
           ) VALUES ($1,$2,$3,'booking',$4,$5,$6,$7,'Europe/Moscow',$8,$9,$10,$11,'new',$12,$13,$14,$15,$16)`,
          [
            leadId, row.siteKey, row.configVersion, row.serviceId, row.resourceId,
            JSON.stringify(row.serviceOptions), row.preferredAt, row.customerPhone,
            row.customerName, row.consentVersion, row.consentAt,
            JSON.stringify(row.priceSnapshot),
            row.attribution === null ? null : JSON.stringify(row.attribution),
            idempotencyKey, payloadHmac, row.createdAt,
          ],
        );
        // Ошибка вставки outbox откатывает и lead (BI08): один COMMIT на пару.
        await client.query(
          `INSERT INTO notification_outbox (lead_id, site_key, adapter_id, destination_key, status, next_attempt_at)
           VALUES ($1, $2, $3, $4, 'pending', now())`,
          [leadId, row.siteKey, row.adapterId, row.destinationKey],
        );
      } catch (insertError: unknown) {
        const code = (insertError as { code?: string }).code;
        if (code === "23505") {
          // Гонка identical-ключа: повторное чтение под блокировкой.
          await client.query("ROLLBACK");
          const raced = await this.#pool.query<{ id: string; payload_hmac: string }>(
            "SELECT id, payload_hmac FROM leads WHERE site_key = $1 AND idempotency_key = $2",
            [siteKey, idempotencyKey],
          );
          const raceRow = raced.rows[0];
          if (raceRow) {
            return raceRow.payload_hmac === payloadHmac
              ? { kind: "replayed", leadId: raceRow.id }
              : { kind: "conflict" };
          }
          return { kind: "conflict" };
        }
        throw insertError;
      }

      await client.query("COMMIT");
      return { kind: "created", leadId };
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof StorageUnavailableError) throw error;
      throw storageUnavailable(error);
    } finally {
      client?.release();
    }
  }
}
