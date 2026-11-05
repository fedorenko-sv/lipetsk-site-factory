// BI01, BI08, BI30–BI33: миграции, откат вставки outbox, maintenance CLI,
// backup/restore и приватность логов.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { BASE, TEST_DSN, OUTBOX_SECRET, SYNTHETIC_PHONE, db, makeBody, post, freshClient, clearRateLimits } from "./helpers.mjs";

const repoRoot = process.cwd();
const container = "lsf-test-backend-pg";

function docker(args, options = {}) {
  return execFileSync("docker", ["exec", container, ...args], {
    encoding: "buffer", maxBuffer: 64 * 1024 * 1024, ...options,
  });
}

test("BI01 повтор миграций не меняет схему", async () => {
  const before = await db((c) => c.query(
    `SELECT table_name, column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' ORDER BY 1,2,3`,
  ));
  const run = spawnSync(
    process.execPath,
    ["--experimental-strip-types", path.join(repoRoot, "scripts/backend/migrate.ts")],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: TEST_DSN, TEST_DATABASE_URL: TEST_DSN, LSF_MIGRATE_TEST_MODE: "1" },
    },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stdout.includes("skip 001_core"), run.stdout);
  const after = await db((c) => c.query(
    `SELECT table_name, column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' ORDER BY 1,2,3`,
  ));
  assert.deepEqual(after.rows.filter((r) => r.table_name !== "pg_%"), before.rows);
  const versions = await db((c) => c.query("SELECT count(*)::int AS n FROM schema_migrations"));
  assert.equal(versions.rows[0].n, 2);
});

test("BI08 ошибка вставки outbox: rollback lead, 503, ни одной неполной пары", async () => {
  const key = randomUUID();
  await db((c) => c.query(`
    CREATE OR REPLACE FUNCTION test_block_outbox() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'blocked by BI08'; END $$ LANGUAGE plpgsql;
    CREATE TRIGGER bi08_block BEFORE INSERT ON notification_outbox
      FOR EACH ROW EXECUTE FUNCTION test_block_outbox();
  `));
  try {
    const response = await post(BASE, makeBody(), { key, client: freshClient() });
    assert.equal(response.status, 503);
    assert.equal(response.json.error.code, "STORAGE_UNAVAILABLE");
    const rows = await db((c) => c.query(
      "SELECT count(*)::int AS leads FROM leads WHERE idempotency_key=$1", [key],
    ));
    assert.equal(rows.rows[0].leads, 0);
    assert.match(response.headers.get("cache-control"), /no-store/);
  } finally {
    await db((c) => c.query("DROP TRIGGER bi08_block ON notification_outbox; DROP FUNCTION test_block_outbox();"));
  }
});

test("BI30 purge и retention: только старые строки, корректный CASCADE", async () => {
  const marker = randomUUID();
  const leadId = randomUUID();
  await db(async (c) => {
    await c.query(
      `INSERT INTO leads (id, site_key, config_version, kind, service_id, service_options,
         preferred_at, timezone, customer_phone, consent_version, consent_at, status,
         price_snapshot, attribution, idempotency_key, payload_hmac, created_at)
       VALUES ($1,'auto','v','booking','s','{}',NULL,'Europe/Moscow','p','v',now(),'new',
         '{}',NULL,$2,'h', now() - interval '8 days')`,
      [leadId, marker],
    );
    const outbox = await c.query(
      `INSERT INTO notification_outbox (lead_id, site_key, adapter_id, destination_key)
       VALUES ($1,'auto','recording','d') RETURNING id`,
      [leadId],
    );
    await c.query(
      `INSERT INTO notification_receipts (outbox_id, lead_id, site_key, destination_key, adapter_id, payload)
       VALUES ($1,$2,'auto','d','recording','{}')`,
      [outbox.rows[0].id, leadId],
    );
    await c.query(
      `INSERT INTO rate_limits (scope, key_hmac, window_start, count, expires_at)
       VALUES ('site','BI30-expired', now() - interval '2 days', 1, now() - interval '1 day')`,
    );
  });
  const cli = (args) => spawnSync(
    process.execPath,
    ["--experimental-strip-types", path.join(repoRoot, "scripts/backend/purge-leads.ts"), ...args],
    { cwd: repoRoot, encoding: "utf8", env: { ...process.env, TEST_DATABASE_URL: TEST_DSN } },
  );
  const dry = cli(["--retention-days", "7"]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.ok(dry.stdout.includes("dry-run"));
  const stillThere = await db((c) => c.query("SELECT 1 FROM leads WHERE id=$1", [leadId]));
  assert.equal(stillThere.rowCount, 1);
  const bad = cli([]);
  assert.equal(bad.status, 1, "без --retention-days отказ");

  const exec = cli(["--retention-days", "7", "--execute"]);
  assert.equal(exec.status, 0, exec.stderr);
  const gone = await db(async (c) => {
    const l = await c.query("SELECT 1 FROM leads WHERE id=$1", [leadId]);
    const o = await c.query("SELECT 1 FROM notification_outbox WHERE lead_id=$1", [leadId]);
    const r = await c.query("SELECT 1 FROM notification_receipts WHERE lead_id=$1", [leadId]);
    const b = await c.query("SELECT 1 FROM rate_limits WHERE key_hmac='BI30-expired'");
    const freshLead = await c.query(
      "SELECT count(*)::int AS n FROM leads WHERE created_at > now() - interval '1 hour'",
    );
    return {
      lead: l.rowCount, outbox: o.rowCount, receipt: r.rowCount, bucket: b.rowCount,
      fresh: freshLead.rows[0].n,
    };
  });
  assert.deepEqual(gone, { lead: 0, outbox: 0, receipt: 0, bucket: 0, fresh: gone.fresh });
  assert.ok(gone.fresh >= 1, "свежие заявки не удалены");
});

test("BI31 export: файл вне Git, без перезаписи, без PII в stdout", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lsf-export-"));
  const outFile = path.join(dir, "leads.csv");
  const cli = (args) => spawnSync(
    process.execPath,
    ["--experimental-strip-types", path.join(repoRoot, "scripts/backend/export-leads.ts"), ...args],
    { cwd: repoRoot, encoding: "utf8", env: { ...process.env, DATABASE_URL: TEST_DSN } },
  );
  try {
    const first = cli(["--out", outFile, "--site", "auto"]);
    assert.equal(first.status, 0, first.stderr);
    assert.ok(existsSync(outFile));
    const content = readFileSync(outFile, "utf8");
    assert.ok(content.startsWith("id,site_key,service_id"));
    assert.ok(!first.stdout.includes("customer_phone"));
    // контакт не печатается в stdout
    const phoneDigits = /\+7\d{10}/;
    assert.ok(!phoneDigits.test(first.stdout));
    const second = cli(["--out", outFile, "--site", "auto"]);
    assert.equal(second.status, 1, "перезапись запрещена");
    const insideRepo = cli(["--out", path.join(repoRoot, "export-inside.csv")]);
    assert.equal(insideRepo.status, 1, "файл внутри репозитория запрещён");
    assert.ok(!existsSync(path.join(repoRoot, "export-inside.csv")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("BI32 backup/restore на синтетике: связи восстановлены", async () => {
  // Реальный pg_dump/pg_restore внутри тестового контейнера.
  const marker = randomUUID();
  const leadId = randomUUID();
  await db(async (c) => {
    await c.query(
      `INSERT INTO leads (id, site_key, config_version, kind, service_id, service_options,
         preferred_at, timezone, customer_phone, consent_version, consent_at, status,
         price_snapshot, attribution, idempotency_key, payload_hmac, created_at)
       VALUES ($1,'auto','v','booking','s','{}',now(),'Europe/Moscow','p','v',now(),'new',
         '{}',NULL,$2,'h', now())`,
      [leadId, marker],
    );
    const outbox = await c.query(
      `INSERT INTO notification_outbox (lead_id, site_key, adapter_id, destination_key)
       VALUES ($1,'auto','recording','d') RETURNING id`,
      [leadId],
    );
    await c.query(
      `INSERT INTO notification_receipts (outbox_id, lead_id, site_key, destination_key, adapter_id, payload)
       VALUES ($1,$2,'auto','d','recording','{}')`,
      [outbox.rows[0].id, leadId],
    );
  });
  const dir = mkdtempSync(path.join(tmpdir(), "lsf-bk-"));
  const dumpPath = path.join(dir, "backup.sql");
  try {
    const dump = docker(["pg_dump", "-U", "lsf_test", "-d", "lsf_test_backend", "--no-owner"]);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(dumpPath, dump);
    docker(["psql", "-U", "lsf_test", "-d", "postgres", "-c", "DROP DATABASE IF EXISTS lsf_test_backend_r"]);
    docker(["psql", "-U", "lsf_test", "-d", "postgres", "-c", "CREATE DATABASE lsf_test_backend_r OWNER lsf_test"]);
    const { spawnSync: sh } = await import("node:child_process");
    const restore = sh(
      "docker",
      ["exec", "-i", container, "psql", "-U", "lsf_test", "-d", "lsf_test_backend_r", "-v", "ON_ERROR_STOP=1", "-q"],
      { input: readFileSync(dumpPath), maxBuffer: 64 * 1024 * 1024 },
    );
    assert.equal(restore.status, 0, String(restore.stderr ?? ""));
    const tcount = (query) => {
      const r = sh("docker", ["exec", container, "psql", "-U", "lsf_test", "-d", "lsf_test_backend_r", "-tAc", query], {
        encoding: "utf8",
      });
      assert.equal(r.status, 0, String(r.stderr ?? ""));
      return parseInt(String(r.stdout).trim(), 10);
    };
    assert.equal(
      tcount(`SELECT count(*)::int FROM leads WHERE idempotency_key='${marker}'`),
      1,
    );
    assert.equal(
      tcount(`SELECT count(*)::int FROM notification_receipts r
        JOIN notification_outbox o ON o.id=r.outbox_id
        JOIN leads l ON l.id=r.lead_id WHERE l.idempotency_key='${marker}'`),
      1,
    );
  } finally {
    docker(["psql", "-U", "lsf_test", "-d", "postgres", "-c", "DROP DATABASE IF EXISTS lsf_test_backend_r"]);
    await db((c) => c.query("DELETE FROM leads WHERE idempotency_key=$1", [marker]));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("BI33 логи и ошибки: нет телефонов, имён, DSN и секретов", async () => {
  const markerName = "BI33 Тест Имя";
  const key = randomUUID();
  const response = await post(BASE, makeBody({ name: markerName }), { key, client: freshClient() });
  assert.equal(response.status, 201);
  await post(BASE, "{\"bad json", { key: randomUUID() });
  await post(BASE, makeBody({ configVersion: "old" }), { key: randomUUID(), client: freshClient() });
  await clearRateLimits();
  // подождём флеша логов приложения
  await new Promise((resolve) => setTimeout(resolve, 700));
  const logPath = process.env.TEST_APP_LOG;
  assert.ok(logPath && existsSync(logPath), "лог приложения не зафиксирован harness");
  const log = readFileSync(logPath, "utf8");
  assert.ok(!log.includes(SYNTHETIC_PHONE), "в логе телефон");
  assert.ok(!log.includes(markerName), "в логе имя клиента");
  assert.ok(!log.includes(TEST_DSN), "в логе DSN");
  assert.ok(!log.includes("postgresql://"), "в логе строка подключения");
  assert.ok(!log.includes(OUTBOX_SECRET), "в логе секрет internal route");
});
