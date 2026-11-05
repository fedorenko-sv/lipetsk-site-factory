// BR1 + BR6: надёжность очереди на настоящем PgOutboxRepo/PostgreSQL.
// BR1a crash на попытке 8 до receipt -> dead (LEASE_EXPIRED), не processing.
// BR1b receipt записана до crash -> согласованное sent без повторной отправки.
// BR1c два worker на expired claim -> один владелец.
// BR1d lease-бюджет пачки -> отправка не начинается при потерянном lease.
// BR1e обычный отказ попытки 8 -> dead без девятой попытки.
// Плюс: лестница 8 повторов на пачке из 20, реальная конкурентность claim
// двух соединений с барьером (BR6/BI22), ровно одна receipt на задачу.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  BASE, TEST_DSN, db, makeBody, post, postOutboxRun, bearer, freshClient,
} from "./helpers.mjs";
import { PgOutboxRepo, runOutboxBatch } from "../../src/server/notifications/worker.ts";
import { AdapterRegistry } from "../../src/server/notifications/registry.ts";
import { RecordingAdapter } from "../../src/server/notifications/recording.ts";
import { NotificationSendError } from "../../src/server/leads/ports.ts";

const pool = new Pool({ connectionString: TEST_DSN, max: 12 });
const repo = new PgOutboxRepo(pool);

function clockAt(getMs) {
  return { now: () => new Date(getMs()) };
}

function failingRegistry() {
  const registry = new AdapterRegistry();
  registry.register("recording", () => ({
    async send() {
      throw new NotificationSendError("PROVIDER_UNAVAILABLE");
    },
  }));
  return registry;
}

function workingRegistry(spy = { sends: 0 }) {
  const registry = new AdapterRegistry();
  registry.register("recording", () => ({
    async send(job, signal) {
      spy.sends += 1;
      const adapter = new RecordingAdapter(pool);
      return adapter.send(job, signal);
    },
  }));
  return registry;
}

async function drainOutbox() {
  for (let i = 0; i < 30; i += 1) {
    const run = await postOutboxRun(BASE, bearer());
    assert.equal(run.status, 200, `worker-пачка при drainage вернула ${run.status}`);
    if (!run.json || run.json.processed === 0) return;
  }
  throw new Error("очередь не дренируется за 30 пачек");
}

async function createLeadViaHttp() {
  const key = randomUUID();
  const response = await post(BASE, makeBody(), { key, client: freshClient() });
  assert.equal(response.status, 201, "синтетическая заявка не создана");
  return { key, leadId: response.json.leadId };
}

// Чужие pending/processing строки (например, из соседних файлов с фиктивным
// будущим next_attempt_at) не должны попадать в claim наших пачек: паркуем их
// на 30 дней и возвращаем обратно в finally.
async function parkOthers(mineIds) {
  await db((c) => c.query(
    `UPDATE notification_outbox
     SET next_attempt_at = next_attempt_at + interval '30 days',
         lease_until = CASE WHEN lease_until IS NOT NULL
           THEN lease_until + interval '30 days' ELSE lease_until END
     WHERE NOT (lead_id = ANY($1)) AND status IN ('pending', 'processing')`,
    [mineIds],
  ));
}

async function unparkOthers(mineIds) {
  await db((c) => c.query(
    `UPDATE notification_outbox
     SET next_attempt_at = next_attempt_at - interval '30 days',
         lease_until = CASE WHEN lease_until IS NOT NULL
           THEN lease_until - interval '30 days' ELSE lease_until END
     WHERE NOT (lead_id = ANY($1)) AND status IN ('pending', 'processing')
       AND next_attempt_at > now() + interval '10 days'`,
    [mineIds],
  ));
}

async function outboxByLead(leadId) {
  const result = await db((c) => c.query(
    `SELECT o.id, o.status, o.attempts, o.claim_token, o.last_error_code,
            (SELECT count(*) FROM notification_receipts r WHERE r.outbox_id=o.id)::int AS receipts
     FROM notification_outbox o WHERE o.lead_id = $1`,
    [leadId],
  ));
  return result.rows[0];
}

test("BI36 лестница повторов на пачке из 20: 8 попыток -> dead, без девятой", async () => {
  await drainOutbox();
  const leads = [];
  for (let i = 0; i < 20; i += 1) leads.push(await createLeadViaHttp());
  const ids = leads.map((l) => l.leadId);
  await parkOthers(ids);
  const delays = [60, 300, 900, 1800, 3600, 7200, 14400]; // секунды после попыток 1..7
  let t = Date.now();
  const now = { value: t };
  const registry = failingRegistry();
  try {
  for (let round = 1; round <= 8; round += 1) {
    now.value = t;
    const counts = await runOutboxBatch(repo, registry, clockAt(() => now.value), 20);
    assert.deepEqual(
      { processed: counts.processed, sent: counts.sent },
      { processed: 20, sent: 0 },
      `раунд ${round}: все 20 обрабатываются, успеха нет`,
    );
    if (round < 8) {
      assert.equal(counts.retried, 20, `раунд ${round}: перенесены все`);
      assert.equal(counts.dead, 0);
      t += (delays[round - 1] + 10) * 1000;
    } else {
      assert.equal(counts.dead, 20, "попытка 8 -> dead");
      assert.equal(counts.retried, 0);
    }
  }
  // Повторный прогон: девятой попытки нет, мёртвые не меняются.
  const extra = await runOutboxBatch(repo, failingRegistry(), clockAt(() => now.value + 1), 20);
  assert.equal(extra.processed, 0);
  const rows = await db((c) => c.query(
    `SELECT o.status, o.attempts, o.last_error_code,
            (SELECT count(*) FROM notification_receipts r WHERE r.outbox_id=o.id)::int AS receipts
     FROM notification_outbox o WHERE o.lead_id = ANY($1)`,
    [ids],
  ));
  assert.equal(rows.rowCount, 20);
  for (const row of rows.rows) {
    assert.deepEqual(
      { status: row.status, attempts: row.attempts, code: row.last_error_code, receipts: row.receipts },
      { status: "dead", attempts: 8, code: "PROVIDER_UNAVAILABLE", receipts: 0 },
    );
  }
  const alive = await db((c) => c.query(
    "SELECT count(*)::int AS n FROM leads WHERE id = ANY($1)", [ids],
  ));
  assert.equal(alive.rows[0].n, 20, "lead остаются, dead — это канал, не заявка");
  } finally {
    await unparkOthers(ids);
  }
  // Очистка: удалить свои строки (каскад на outbox/receipts).
  await db((c) => c.query("DELETE FROM leads WHERE id = ANY($1)", [ids]));
});

test("BR1 конкурентность: две пачки параллельно, 12 задач, ровно одна receipt на задачу", async () => {
  await drainOutbox();
  const leads = [];
  for (let i = 0; i < 12; i += 1) leads.push(await createLeadViaHttp());
  const ids = leads.map((l) => l.leadId);
  const nowValue = Date.now();
  const spy = { sends: 0 };
  const [a, b] = await Promise.all([
    runOutboxBatch(repo, workingRegistry(spy), clockAt(() => nowValue), 20),
    runOutboxBatch(repo, workingRegistry(spy), clockAt(() => nowValue), 20),
  ]);
  assert.equal(a.processed + b.processed, 12, "каждая задача обработана ровно один раз");
  assert.equal(a.sent + b.sent, 12);
  assert.equal(spy.sends, 12, "зависших/пропущенных отправок нет");
  const rows = await db((c) => c.query(
    `SELECT o.status, (SELECT count(*) FROM notification_receipts r WHERE r.outbox_id=o.id)::int AS receipts
     FROM notification_outbox o WHERE o.lead_id = ANY($1)`,
    [ids],
  ));
  for (const row of rows.rows) {
    assert.equal(row.status, "sent");
    assert.equal(row.receipts, 1);
  }
  await db((c) => c.query("DELETE FROM leads WHERE id = ANY($1)", [ids]));
});

test("BR6/BI22 барьер: два соединения claimBatch одновременно — пересечений нет", async () => {
  await drainOutbox();
  const leads = [];
  for (let i = 0; i < 6; i += 1) leads.push(await createLeadViaHttp());
  const mine = new Set(leads.map((l) => l.leadId));
  const poolA = new Pool({ connectionString: TEST_DSN, max: 4 });
  const poolB = new Pool({ connectionString: TEST_DSN, max: 4 });
  const repoA = new PgOutboxRepo(poolA);
  const repoB = new PgOutboxRepo(poolB);
  const nowValue = Date.now();
  // Барьер: оба claim стартуют в одном tick и ждут друг друга до завершения.
  const [claimedA, claimedB] = await Promise.all([
    repoA.claimBatch(20, new Date(nowValue)),
    repoB.claimBatch(20, new Date(nowValue)),
  ]);
  const idsA = new Set(claimedA.filter((j) => mine.has(j.leadId)).map((j) => j.id));
  const idsB = new Set(claimedB.filter((j) => mine.has(j.leadId)).map((j) => j.id));
  for (const id of idsA) assert.ok(!idsB.has(id), "одна задача не может достаться обоим");
  assert.equal(idsA.size + idsB.size, 6, "все шесть заявок разобраны соединениями");
  const tokensA = new Set(claimedA.map((j) => j.claimToken));
  const tokensB = new Set(claimedB.map((j) => j.claimToken));
  assert.ok(tokensA.size <= 1 && tokensB.size <= 1, "один батч — один claim token");
  for (const ta of tokensA) for (const tb of tokensB) assert.notEqual(ta, tb);
  // Завершаем забранное реальным recording-адаптером с правильным токеном.
  const adapter = new RecordingAdapter(pool);
  for (const job of [...claimedA, ...claimedB].filter((j) => mine.has(j.leadId))) {
    await adapter.send(job, new AbortController().signal);
    const owner = idsA.has(job.id) ? repoA : repoB;
    assert.equal(await owner.markSent(job.id, job.claimToken, new Date()), true);
  }
  const rows = await db((c) => c.query(
    `SELECT o.status, (SELECT count(*) FROM notification_receipts r WHERE r.outbox_id=o.id)::int AS receipts
     FROM notification_outbox o WHERE o.lead_id = ANY($1)`,
    [[...mine]],
  ));
  for (const row of rows.rows) {
    assert.equal(row.status, "sent");
    assert.equal(row.receipts, 1);
  }
  await db((c) => c.query("DELETE FROM leads WHERE id = ANY($1)", [[...mine]]));
  await poolA.end().catch(() => undefined);
  await poolB.end().catch(() => undefined);
});

test("BR1e обычный отказ попытки 8: dead без автоматической девятой", async () => {
  await drainOutbox();
  const { leadId } = await createLeadViaHttp();
  await parkOthers([leadId]);
  await db((c) => c.query(
    `UPDATE notification_outbox SET attempts = 7, status='pending',
            next_attempt_at = now() - interval '1 second'
     WHERE lead_id = $1`,
    [leadId],
  ));
  const nowValue = Date.now();
  const spy = { sends: 0 };
  const registry = failingRegistry();
  const counts = await runOutboxBatch(repo, registry, clockAt(() => nowValue), 20);
  assert.equal(counts.dead, 1);
  const job = await outboxByLead(leadId);
  assert.deepEqual(
    { status: job.status, attempts: job.attempts, code: job.last_error_code, receipts: job.receipts },
    { status: "dead", attempts: 8, code: "PROVIDER_UNAVAILABLE", receipts: 0 },
  );
  const again = await runOutboxBatch(repo, registry, clockAt(() => nowValue + 86_400_000), 20);
  assert.equal(again.processed, 0, "девятой попытки нет");
  const lead = await db((c) => c.query("SELECT 1 FROM leads WHERE id=$1", [leadId]));
  assert.equal(lead.rowCount, 1);
  await unparkOthers([leadId]);
  await db((c) => c.query("DELETE FROM leads WHERE id = $1", [leadId]));
  void spy;
});

test("BR1a/BR1b/BR1c восстановление expired-claim: receipt->sent, нет receipt->dead, один владелец", async () => {
  await drainOutbox();
  const a = await createLeadViaHttp(); // crash ДО receipt
  const b = await createLeadViaHttp(); // crash ПОСЛЕ receipt, ДО markSent
  const jobA = await outboxByLead(a.leadId);
  const jobB = await outboxByLead(b.leadId);
  await db(async (c) => {
    for (const job of [jobA, jobB]) {
      await c.query(
        `UPDATE notification_outbox
         SET status='processing', attempts=8, claim_token='stale-token',
             lease_until = now() - interval '60 seconds'
         WHERE id = $1`,
        [job.id],
      );
    }
    await c.query(
      `INSERT INTO notification_receipts (outbox_id, lead_id, site_key, destination_key, adapter_id, payload)
       VALUES ($1,$2,'auto','demo-auto-v1','recording','{}')`,
      [jobB.id, b.leadId],
    );
  });
  const spy = { sends: 0 };
  // BR1c: два worker стартуют одновременно на те же expired-задачи.
  const nowValue = Date.now();
  const [counts1, counts2] = await Promise.all([
    runOutboxBatch(repo, workingRegistry(spy), clockAt(() => nowValue), 20),
    runOutboxBatch(repo, workingRegistry(spy), clockAt(() => nowValue), 20),
  ]);
  assert.equal(spy.sends, 0, "восстановление не выполняет повторную отправку");
  const rec1 = { sent: counts1.sent, dead: counts1.dead };
  const rec2 = { sent: counts2.sent, dead: counts2.dead };
  assert.equal(rec1.sent + rec2.sent >= 1, true);
  assert.equal(rec1.dead + rec2.dead >= 1, true);
  const rowA = await outboxByLead(a.leadId);
  const rowB = await outboxByLead(b.leadId);
  assert.deepEqual(
    { status: rowA.status, attempts: rowA.attempts, code: rowA.last_error_code, receipts: rowA.receipts },
    { status: "dead", attempts: 8, code: "LEASE_EXPIRED", receipts: 0 },
    "BR1a: crash до receipt на попытке 8 -> определённый dead, не processing",
  );
  assert.deepEqual(
    { status: rowB.status, attempts: rowB.attempts, receipts: rowB.receipts },
    { status: "sent", attempts: 8, receipts: 1 },
    "BR1b: существующая receipt -> sent с единственным свидетельством",
  );
  assert.equal(rowA.claim_token, null);
  assert.equal(rowB.claim_token, null);
  // Stale claim token не меняет завершённую строку.
  assert.equal(await repo.markSent(rowB.id, "stale-token", new Date()), false);
  assert.equal(await repo.markDead(rowA.id, "other-token", "X", new Date()), false);
  await db((c) => c.query("DELETE FROM leads WHERE id = ANY($1)", [[a.leadId, b.leadId]]));
});

test("BR1d lease-бюджет: отправка не начинается, если lease уже потерян", async () => {
  await drainOutbox();
  const { leadId } = await createLeadViaHttp();
  const jobBefore = await outboxByLead(leadId);
  let nowValue = Date.now();
  const clock = clockAt(() => nowValue);
  const spy = { sends: 0 };
  // Обёртка: сразу после claim часы уходят на 115 с — к моменту отправки
  // остаток lease (5 с) заведомо меньше timeout адаптера (10 с). Реальный
  // lease в БД при этом ещё активен, поэтому scheduleRetry проходит по токену.
  const wrapped = {
    claimBatch: async (limit, now) => {
      const jobs = await repo.claimBatch(limit, now);
      nowValue += 115_000;
      return jobs;
    },
    markSent: (id, token, now) => repo.markSent(id, token, now),
    scheduleRetry: (id, token, next, code, now) => repo.scheduleRetry(id, token, next, code, now),
    markDead: (id, token, code, now) => repo.markDead(id, token, code, now),
    hasReceipt: (id) => repo.hasReceipt(id),
  };
  const counts = await runOutboxBatch(wrapped, workingRegistry(spy), clock, 20);
  assert.equal(spy.sends, 0, "задача с потерянным lease не отправляется");
  assert.equal(counts.retried, 1, "утраченный lease -> запланированный повтор, не dead");
  const job = await db((c) => c.query(
    `SELECT status, attempts, last_error_code,
            (SELECT count(*) FROM notification_receipts r WHERE r.outbox_id=o.id)::int AS receipts
     FROM notification_outbox o WHERE lead_id=$1`,
    [leadId],
  ));
  const row = job.rows[0];
  assert.equal(row.last_error_code, "SEND_BUDGET");
  assert.equal(row.receipts, 0);
  assert.equal(row.attempts, 1);
  if (row.status === "pending" || row.status === "processing") {
    // Возвращаем задачу в живой pending и завершаем нормальным worker-путём.
    await db((c) => c.query(
      `UPDATE notification_outbox SET status='pending', next_attempt_at=now(),
              lease_until=NULL, attempts=0, last_error_code=NULL, claim_token=NULL
       WHERE id=$1`,
      [jobBefore.id],
    ));
    const run = await postOutboxRun(BASE, bearer());
    assert.equal(run.status, 200);
    const after = await outboxByLead(leadId);
    assert.equal(after.status, "sent");
    assert.equal(after.receipts, 1);
  }
  await db((c) => c.query("DELETE FROM leads WHERE id = $1", [leadId]));
});

test.after(async () => {
  await pool.end().catch(() => undefined);
});
