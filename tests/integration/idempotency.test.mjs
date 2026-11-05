// BI02–BI07: сохранение, повтор, конкурентная идемпотентность.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  BASE, db, makeBody, post, leadByKey, freshClient, clearRateLimits,
  HMAC_KEY, SYNTHETIC_PHONE, CONFIG_VERSION, futureWorkingDate,
} from "./helpers.mjs";
import { buildCanonical, computePayloadHmac } from "../../src/server/leads/canonical.ts";

test("BI02 обычный POST: 201, один lead, один pending outbox, snapshot", async () => {
  const key = randomUUID();
  const client = freshClient();
  const response = await post(BASE, makeBody(), { key, client });
  assert.equal(response.status, 201);
  assert.equal(response.json.status, "received");
  assert.equal(response.json.replayed, false);
  assert.ok(response.json.leadId);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const row = await db((c) => leadByKey(c, "auto", key));
  assert.ok(row);
  assert.equal(row.outbox_count, 1);
  assert.equal(row.outbox_status, "pending");
  const lead = await db((c) => c.query(
    "SELECT price_snapshot, service_options, consent_at, status FROM leads WHERE id=$1",
    [row.id],
  ));
  const snap = lead.rows[0].price_snapshot;
  assert.equal(snap.amountMinor, 180000); // цена только из серверной конфигурации
  assert.equal(lead.rows[0].service_options["wheel-size"], "R16");
  assert.equal(lead.rows[0].status, "new");
});

test("BI03 один payload/ключ повторно: 200, тот же leadId, replayed", async () => {
  const key = randomUUID();
  const client = freshClient();
  const body = makeBody();
  const first = await post(BASE, body, { key, client });
  assert.equal(first.status, 201);
  const second = await post(BASE, body, { key, client });
  assert.equal(second.status, 200);
  assert.equal(second.json.replayed, true);
  assert.equal(second.json.leadId, first.json.leadId);
});

test("BI04 двадцать конкурентных одинаковых POST: одна пара строк", async () => {
  const date = futureWorkingDate();
  const body = {
    siteKey: "auto", configVersion: CONFIG_VERSION, kind: "booking",
    serviceId: "tire-change", serviceOptions: { "wheel-size": "R16" },
    preferred: { date, time: "10:30", timezone: "Europe/Moscow" },
    customer: { phone: SYNTHETIC_PHONE },
    consent: { accepted: true, version: CONFIG_VERSION },
    antiBot: { website: "" },
  };
  const key = randomUUID();
  const client = freshClient();
  const send = () => fetch(BASE + "/api/leads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      "Idempotency-Key": key,
      "X-Test-Client": client,
    },
    body: JSON.stringify(body),
  });
  const responses = await Promise.all(Array.from({ length: 20 }, send));
  assert.equal(responses.filter((r) => r.status === 201).length, 1);
  assert.equal(responses.filter((r) => r.status === 200).length, 19);
  const receipts = await Promise.all(responses.map((r) => r.json()));
  assert.equal(new Set(receipts.map((r) => r.leadId)).size, 1);
  // SQL-assert: ровно один lead по паре и ровно один outbox по lead_id.
  const rows = await db((c) => c.query(
    `SELECT (SELECT count(*) FROM leads WHERE site_key='auto' AND idempotency_key=$1) AS leads,
            (SELECT count(*) FROM notification_outbox o
              JOIN leads l ON l.id=o.lead_id
             WHERE l.site_key='auto' AND l.idempotency_key=$1) AS outbox`,
    [key],
  ));
  assert.equal(Number(rows.rows[0].leads), 1);
  assert.equal(Number(rows.rows[0].outbox), 1);
  await clearRateLimits();
});

test("BI05 один ключ с разными payload: исходная строка не перезаписана", async () => {
  const key = randomUUID();
  const client = freshClient();
  const body = makeBody();
  const first = await post(BASE, body, { key, client });
  assert.equal(first.status, 201);
  const changed = await post(BASE, makeBody({ name: "Другое имя" }), { key, client });
  assert.equal(changed.status, 409);
  assert.equal(changed.json.error.code, "IDEMPOTENCY_CONFLICT");
  const row = await db((c) => leadByKey(c, "auto", key));
  assert.equal(row.customer_phone, SYNTHETIC_PHONE);
  const name = await db((c) => c.query("SELECT customer_name FROM leads WHERE id=$1", [row.id]));
  assert.equal(name.rows[0].customer_name, null);
});

test("BI06 два разных ключа: два lead, дедупликации по телефону нет", async () => {
  const client = freshClient();
  const a = await post(BASE, makeBody(), { key: randomUUID(), client });
  const b = await post(BASE, makeBody(), { key: randomUUID(), client });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.notEqual(a.json.leadId, b.json.leadId);
  const count = await db((c) => c.query(
    "SELECT count(*)::int AS n FROM leads WHERE id IN ($1,$2)",
    [a.json.leadId, b.json.leadId],
  ));
  assert.equal(count.rows[0].n, 2);
  await clearRateLimits();
});

test("BI07 сохранённый повтор не зависит от устаревания текущих правил", async () => {
  // Синтетический сохранённый lead: payload_hmac соответствует канону устаревшего
  // тела (консент предыдущей версии, дата в прошлом). Повтор обязан вернуть прежний
  // receipt; такое же тело как новая заявка — отклоняется текущими правилами.
  const { parseMoscowInstant } = await import("../../src/server/leads/preference.ts");
  const key = randomUUID();
  const pastDate = (() => {
    const moscow = new Date(Date.now() + 3 * 3_600_000);
    const d = new Date(Date.UTC(moscow.getUTCFullYear(), moscow.getUTCMonth(), moscow.getUTCDate() - 1));
    return d.toISOString().slice(0, 10);
  })();
  const staleBody = makeBody({ date: pastDate, consentVersion: "demo-2026-10-01" });
  const instant = parseMoscowInstant(pastDate, "10:30");
  const { moscowIso } = await import("../../src/server/leads/canonical.ts");
  const canonical = buildCanonical({
    siteKey: "auto",
    configVersion: CONFIG_VERSION,
    kind: "booking",
    serviceId: "tire-change",
    serviceOptions: { "wheel-size": "R16" },
    resourceId: null,
    preferredIso: moscowIso(instant),
    phone: SYNTHETIC_PHONE,
    name: null,
    consentVersion: "demo-2026-10-01",
    attribution: null,
  });
  const hmac = computePayloadHmac(HMAC_KEY, canonical);
  const leadId = randomUUID();
  await db((c) => c.query(
    `INSERT INTO leads (id, site_key, config_version, kind, service_id, service_options,
       preferred_at, timezone, customer_phone, consent_version, consent_at, status,
       price_snapshot, attribution, idempotency_key, payload_hmac, created_at)
     VALUES ($1,'auto',$2,'booking','tire-change','{"wheel-size":"R16"}',
       $3,'Europe/Moscow',$4,'demo-2026-10-01', now(),'new',
       '{"kind":"from","amountMinor":180000,"currency":"RUB","name":"Сезонная смена шин","durationMinutes":40}',
       null,$5,$6, now())`,
    [leadId, CONFIG_VERSION, instant, SYNTHETIC_PHONE, key, hmac],
  ));
  await db((c) => c.query(
    `INSERT INTO notification_outbox (lead_id, site_key, adapter_id, destination_key)
     VALUES ($1,'auto','recording','demo-auto-v1')`,
    [leadId],
  ));

  const client = freshClient();
  const replay = await post(BASE, staleBody, { key, client });
  assert.equal(replay.status, 200);
  assert.equal(replay.json.replayed, true);
  assert.equal(replay.json.leadId, leadId);

  const fresh = await post(BASE, staleBody, { key: randomUUID(), client: freshClient() });
  assert.equal(fresh.status, 409);
  assert.equal(fresh.json.error.code, "CONSENT_CHANGED");
  await clearRateLimits();
});
