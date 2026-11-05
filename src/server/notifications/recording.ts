/**
 * Recording-адаптер уведомлений (PR3, §12): локальное долговременное
 * свидетельство в notification_receipts. Содержит только синтетические
 * демо-данные; удаляется каскадом по retention. Реальным каналом
 * администратора не является.
 *
 * UNIQUE(outbox_id): после crash до markSent повтор возвращает прежнюю
 * receipt (BI26). Отправка не создаёт второй бесконтрольный контакт.
 */
import type { Pool } from "pg";
import { NotificationSendError } from "../leads/ports.ts";
import type { NotificationJob, NotificationPort, NotificationResult } from "../leads/ports.ts";

interface LeadSnapshot {
  lead_id: string;
  site_key: string;
  customer_phone: string;
  customer_name: string | null;
  preferred_at: string | null;
  created_at: string;
  price_snapshot: { name?: string };
  destination_key: string;
  adapter_id: string;
}

export class RecordingAdapter implements NotificationPort {
  #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async send(job: NotificationJob, signal: AbortSignal): Promise<NotificationResult> {
    if (signal.aborted) throw new NotificationSendError("TIMEOUT");
    let client;
    try {
      client = await this.#pool.connect();
    } catch {
      throw new NotificationSendError("STORAGE_UNAVAILABLE");
    }
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ id: string }>(
        "SELECT id FROM notification_receipts WHERE outbox_id = $1",
        [job.id],
      );
      if (existing.rows[0]) {
        await client.query("COMMIT");
        return { receiptId: existing.rows[0].id };
      }
      const lead = await client.query<LeadSnapshot>(
        `SELECT l.id AS lead_id, l.site_key, l.customer_phone, l.customer_name,
                to_char(l.preferred_at AT TIME ZONE 'Europe/Moscow' AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS+03:00') AS preferred_at,
                to_char(l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS+00:00') AS created_at,
                l.price_snapshot, o.destination_key, o.adapter_id
         FROM leads l
         JOIN notification_outbox o ON o.lead_id = l.id
         WHERE o.id = $1`,
        [job.id],
      );
      if (!lead.rows[0]) {
        await client.query("ROLLBACK");
        throw new NotificationSendError("LEAD_NOT_FOUND");
      }
      const snapshot = lead.rows[0];
      const payload = {
        kind: "demo-recording",
        synthetic: true,
        leadId: snapshot.lead_id,
        siteKey: snapshot.site_key,
        destinationKey: snapshot.destination_key,
        adapterId: snapshot.adapter_id,
        service: snapshot.price_snapshot?.name ?? null,
        preferredAt: snapshot.preferred_at,
        leadCreatedAt: snapshot.created_at,
        phone: snapshot.customer_phone,
        name: snapshot.customer_name,
      };
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO notification_receipts (outbox_id, lead_id, site_key, destination_key, adapter_id, payload)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (outbox_id) DO NOTHING
         RETURNING id`,
        [job.id, snapshot.lead_id, snapshot.site_key, snapshot.destination_key, snapshot.adapter_id, JSON.stringify(payload)],
      );
      if (inserted.rows[0]) {
        await client.query("COMMIT");
        return { receiptId: inserted.rows[0].id };
      }
      // Параллельная вставка: вернуть прежнюю receipt.
      const after = await client.query<{ id: string }>(
        "SELECT id FROM notification_receipts WHERE outbox_id = $1",
        [job.id],
      );
      await client.query("COMMIT");
      if (!after.rows[0]) throw new NotificationSendError("RECORDING_FAILED");
      return { receiptId: after.rows[0].id };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof NotificationSendError) throw error;
      throw new NotificationSendError("RECORDING_FAILED");
    } finally {
      client?.release();
    }
  }
}
