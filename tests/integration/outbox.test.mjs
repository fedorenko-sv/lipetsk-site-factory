// BI21–BI29: worker, recording, internal route. Claim/lease/stale token —
// через PgOutboxRepo на отдельном соединении к той же БД.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { BASE, db, makeBody, post, postOutboxRun, bearer, freshClient } from "./helpers.mjs";
import { PgOutboxRepo } from "../../src/server/notifications/worker.ts";
import { getSharedPool } from "../../src/server/db/pool.ts";

const testPool = getSharedPool(process.env.TEST_DATABASE_URL);

async function createLead() {
  const key = randomUUID();
  const response = await post(BASE, makeBody(), { key, client: freshClient() });
  assert.equal(response.status, 201);
  return { key, leadId: response.json.leadId };
}

// Соседние наборы (BI12) оставляют очередь: пачка из 20 обязана коснуться
// собственной задачи теста — сначала дренируем чужие.
async function drainOutbox() {
  for (let i = 0; i < 15; i += 1) {
    const run = await postOutboxRun(BASE, bearer());
    assert.equal(run.status, 200, `worker-пачка при drainage вернула ${run.status}`);
    if (!run.json || run.json.processed === 0) return;
  }
  throw new Error("очередь не дренируется за 15 пачек");
}

async function outboxByLead(leadId) {
  return db((c) => c.query(
    `SELECT o.id, o.status, o.attempts, o.next_attempt_at, o.last_error_code,
            o.destination_key, o.adapter_id,
            (SELECT count(*) FROM notification_receipts r WHERE r.outbox_id = o.id)::int AS receipts
     FROM notification_outbox o WHERE o.lead_id = $1`,
    [leadId],
  ).then((r) => r.rows[0]));
}

test("BI21 worker recording: одна receipt, outbox sent", async () => {
  await drainOutbox();
  const { leadId } = await createLead();
  const run = await postOutboxRun(BASE, bearer());
  assert.equal(run.status, 200);
  assert.ok(run.json.sent >= 1);
  const job = await outboxByLead(leadId);
  assert.equal(job.status, "sent");
  assert.equal(job.receipts, 1);
  const receipt = await db((c) => c.query(
    "SELECT payload FROM notification_receipts WHERE outbox_id = $1", [job.id],
  ));
  assert.equal(receipt.rows[0].payload.synthetic, true);
});

test("BI22 два worker: задача не обрабатывается одновременно", async () => {
  await drainOutbox();
  const { leadId } = await createLead();
  const repo = new PgOutboxRepo(testPool);
  const claimed = await repo.claimBatch(20, new Date());
  const mine = claimed.find((j) => j.leadId === leadId);
  assert.ok(mine, "worker harness не забрал свою задачу");
  // Пока lease активен, внутренний worker не обязан трогать её повторно.
  const run = await postOutboxRun(BASE, bearer());
  assert.equal(run.status, 200);
  const job = await outboxByLead(leadId);
  assert.ok(job.status === "processing" || job.status === "sent");
  assert.ok(job.receipts <= 1, "одна задача — не более одной receipt");
  const { RecordingAdapter } = await import("../../src/server/notifications/recording.ts");
  const adapter = new RecordingAdapter(testPool);
  await adapter.send(mine, new AbortController().signal);
  await repo.markSent(mine.id, mine.claimToken, new Date());
  const after = await outboxByLead(leadId);
  assert.equal(after.status, "sent");
  const dupes = await db((c) => c.query(
    "SELECT count(*)::int AS n FROM notification_receipts WHERE outbox_id = $1", [mine.id],
  ));
  assert.ok(dupes.rows[0].n <= 1);
});

test("BI23 send отказ: lead сохранён, outbox перенесён, безопасный код", async () => {
  await drainOutbox();
  const { leadId } = await createLead();
  await db((c) => c.query(
    "UPDATE notification_outbox SET adapter_id='ghost-channel' WHERE lead_id=$1", [leadId],
  ));
  const run = await postOutboxRun(BASE, bearer());
  assert.equal(run.status, 200);
  assert.ok(run.json.retried >= 1, "отказ учтён как повтор");
  const job = await outboxByLead(leadId);
  assert.equal(job.status, "pending");
  assert.equal(job.attempts, 1);
  assert.equal(job.last_error_code, "CONFIG_ERROR");
  assert.ok(new Date(job.next_attempt_at).getTime() > Date.now() + 50_000);
  const lead = await db((c) => c.query("SELECT 1 FROM leads WHERE id=$1", [leadId]));
  assert.equal(lead.rowCount, 1, "отказ уведомления не удаляет lead");
  await db((c) => c.query("DELETE FROM notification_outbox WHERE lead_id=$1", [leadId]));
});

test("BI24 worker crash, lease истёк: задача снова доступна", async () => {
  await drainOutbox();
  const { leadId } = await createLead();
  await db((c) => c.query(
    `UPDATE notification_outbox
     SET status='processing', lease_until = now() - interval '1 minute',
         claim_token = $2, attempts = 1
     WHERE lead_id = $1`,
    [leadId, randomUUID()],
  ));
  const run = await postOutboxRun(BASE, bearer());
  assert.equal(run.status, 200);
  const job = await outboxByLead(leadId);
  assert.equal(job.status, "sent");
});

test("BI25 stale claim_token не перезаписывает новую попытку", async () => {
  await drainOutbox();
  const { leadId } = await createLead();
  const repo = new PgOutboxRepo(testPool);
  const claimed = await repo.claimBatch(20, new Date());
  const mine = claimed.find((j) => j.leadId === leadId);
  assert.ok(mine);
  // Симулируем завершение попытки другим, новым работником.
  const newToken = randomUUID();
  await db((c) => c.query(
    `UPDATE notification_outbox
     SET status='pending', claim_token=$2, next_attempt_at=now(), lease_until=NULL
     WHERE id=$1`,
    [mine.id, newToken],
  ));
  const stale = await repo.markSent(mine.id, mine.claimToken, new Date());
  assert.equal(stale, false);
  const job = await outboxByLead(leadId);
  assert.equal(job.status, "pending");
  const row = await db((c) => c.query(
    "SELECT claim_token FROM notification_outbox WHERE id=$1", [mine.id],
  ));
  assert.equal(row.rows[0].claim_token, newToken);
});

test("BI26 recording успешна, crash до sent: повтор возвращает прежнюю receipt", async () => {
  await drainOutbox();
  const { leadId } = await createLead();
  const repo = new PgOutboxRepo(testPool);
  const { RecordingAdapter } = await import("../../src/server/notifications/recording.ts");
  const claimed = await repo.claimBatch(20, new Date());
  const mine = claimed.find((j) => j.leadId === leadId);
  assert.ok(mine);
  const adapter = new RecordingAdapter(testPool);
  const first = await adapter.send(mine, new AbortController().signal);
  // crash до markSent: lease принудительно истёк.
  await db((c) => c.query(
    "UPDATE notification_outbox SET lease_until = now() - interval '1 minute' WHERE id=$1",
    [mine.id],
  ));
  const run = await postOutboxRun(BASE, bearer());
  assert.equal(run.status, 200);
  const job = await outboxByLead(leadId);
  assert.equal(job.status, "sent");
  assert.equal(job.receipts, 1);
  const r = await db((c) => c.query(
    "SELECT id FROM notification_receipts WHERE outbox_id=$1", [job.id],
  ));
  assert.equal(r.rows[0].id, first.receiptId, "повтор обязан вернуть прежний receipt");
});

test("BI27 сохранённая очередь использует прежнее назначение", async () => {
  await drainOutbox();
  const { leadId } = await createLead();
  await db((c) => c.query(
    "UPDATE notification_outbox SET destination_key='demo-auto-v0' WHERE lead_id=$1",
    [leadId],
  ));
  await postOutboxRun(BASE, bearer());
  const job = await outboxByLead(leadId);
  assert.equal(job.status, "sent");
  const r = await db((c) => c.query(
    "SELECT destination_key FROM notification_receipts WHERE outbox_id=$1", [job.id],
  ));
  assert.equal(r.rows[0].destination_key, "demo-auto-v0");
});

test("BI28 internal route без/с неверным секретом: 401, очередь не тронута", async () => {
  await drainOutbox();
  const { leadId } = await createLead();
  const before = await outboxByLead(leadId);
  const noAuth = await postOutboxRun(BASE, null);
  assert.equal(noAuth.status, 401);
  const wrong = await postOutboxRun(BASE, "Bearer wrong-secret-value-0000000000000000");
  assert.equal(wrong.status, 401);
  const after = await outboxByLead(leadId);
  assert.deepEqual(
    [after.status, after.attempts, after.receipts],
    [before.status, before.attempts, before.receipts],
  );
});

test("BI29 internal route с секретом: только агрегатные числа", async () => {
  const run = await postOutboxRun(BASE, bearer());
  assert.equal(run.status, 200);
  assert.deepEqual(Object.keys(run.json).sort(), ["dead", "processed", "retried", "sent"]);
  const text = JSON.stringify(run.json);
  assert.ok(!/\+7\d{10}/.test(text));
  assert.ok(!/lead/i.test(text));
  await postOutboxRun(BASE, bearer()); // drain
});
