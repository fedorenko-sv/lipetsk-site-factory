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
import {
  assertSafeTestDatabaseUrl, effectiveTestTarget,
} from "../../src/server/config/guards.ts";

const repoRoot = process.cwd();
const namedContainer = "lsf-test-backend-pg";

// BR6/BI32: утилиты PostgreSQL выбираются по проверенному эффективному target
// TEST_DATABASE_URL, а не по «первому попавшемуся postgres-контейнеру».
const pgUser = decodeURIComponent(new URL(TEST_DSN).username);
const pgTarget = effectiveTestTarget(assertSafeTestDatabaseUrl(TEST_DSN));

function dockerAvailable() {
  return spawnSync("docker", ["version"], { stdio: "ignore" }).status === 0;
}

function findPgContainerByTarget(port) {
  const candidates = [];
  if (spawnSync("docker", ["inspect", namedContainer], { stdio: "ignore" }).status === 0) {
    candidates.push(namedContainer);
  }
  const ps = spawnSync("docker", ["ps", "--filter", "ancestor=postgres:18", "--format", "{{.ID}}"], {
    encoding: "utf8",
  });
  if (ps.status === 0) {
    for (const id of ps.stdout.trim().split("\n")) if (id) candidates.push(id);
  }
  const tail = new RegExp(`:${port}$`, "m");
  for (const id of candidates) {
    const mapped = spawnSync("docker", ["port", id, "5432/tcp"], { encoding: "utf8" });
    if (mapped.status === 0 && tail.test(mapped.stdout)) return id;
  }
  return null;
}

const hasDocker = dockerAvailable();
const pgContainer = hasDocker ? findPgContainerByTarget(pgTarget.port) : null;
const localPg = !hasDocker
  && spawnSync("pg_dump", ["--version"], { encoding: "utf8" }).status === 0;

function pgTool(tool, args, options = {}) {
  if (pgContainer) {
    return execFileSync("docker", ["exec", "-i", pgContainer, tool, ...args], {
      encoding: "buffer", maxBuffer: 64 * 1024 * 1024, ...options,
    });
  }
  if (localPg) {
    const url = new URL(TEST_DSN);
    const base = [tool, "-h", url.hostname, "-p", String(url.port || 5432), "-U", decodeURIComponent(url.username)];
    return execFileSync(tool, [...base, ...args], {
      encoding: "buffer",
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password ?? "") },
      ...options,
    });
  }
  throw new Error(
    `нет контейнера/утилит под проверенный target ${pgTarget.host}:${pgTarget.port}`,
  );
}

function adminSql(statement) {
  return pgTool("psql", ["-U", pgUser, "-d", "postgres", "-tAc", statement], { encoding: "utf8" });
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

test("BR3 экспорт: dot-segments и junction не записывают файл внутрь checkout", () => {
  const cli = (args, cwd = repoRoot) => spawnSync(
    process.execPath,
    ["--experimental-strip-types", path.join(repoRoot, "scripts/backend/export-leads.ts"), ...args],
    { cwd, encoding: "utf8", env: { ...process.env, DATABASE_URL: TEST_DSN } },
  );
  const dir = mkdtempSync(path.join(tmpdir(), "lsf-br3-"));
  const outsideEscape = path.join(dir, "..", path.relative(path.dirname(dir), repoRoot));
  const created = [];
  try {
    // outside/../inside: формально строка «снаружи», нормализуется внутрь.
    const sneaky = `${outsideEscape}${path.sep}evil.csv`;
    const r1 = cli(["--out", sneaky]);
    assert.equal(r1.status, 1, "outside/../inside обязан быть отвергнут");
    const evilPath = path.resolve(sneaky);
    assert.ok(!existsSync(evilPath), "файл внутри checkout не создан");
    // Вложенный вариант: наружу и обратно через несколько пар сегментов.
    const nested = `${outsideEscape}${path.sep}..${path.sep}${path.basename(repoRoot)}${path.sep}nested-evil.csv`;
    const r2 = cli(["--out", nested]);
    assert.equal(r2.status, 1, "вложенный outside/../inside обязан быть отвергнут");
    assert.ok(!existsSync(path.resolve(nested)));
    // Junction/symlink наружу внутрь checkout (если ОС разрешает) — тоже отказ.
    const link = path.join(dir, "link-inside");
    const mk = spawnSync("cmd", ["/c", "mklink", "/J", link, repoRoot], { encoding: "utf8" });
    if (mk.status === 0) {
      const r3 = cli(["--out", path.join(link, "junction-evil.csv")]);
      assert.equal(r3.status, 1, "путь через junction не обходит границу");
      assert.ok(!existsSync(path.join(repoRoot, "junction-evil.csv")));
    } else {
      console.log("BR3: создание junction недоступно в этой среде — проверка границы через realpath выполнена на dot-segments");
    }
  } finally {
    for (const f of created) rmSync(f, { force: true });
    rmSync(dir, { recursive: true, force: true });
  }
  // Разрешённый относительный снаружи-путь (../outside.csv) обязан работать.
  const outsideFile = path.join(path.dirname(repoRoot), "lsf-br3-outside.csv");
  try {
    const ok = cli(["--out", "../lsf-br3-outside.csv"]);
    assert.equal(ok.status, 0, `допустимый ../outside.csv должен писаться: ${ok.stderr}`);
    created.push(outsideFile);
    assert.ok(existsSync(outsideFile));
  } finally {
    if (existsSync(outsideFile)) rmSync(outsideFile, { force: true });
  }
});

test("BI32 backup/restore на синтетике: source по TEST_DATABASE_URL, restore в свой уникальный БД", async () => {
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
  // Restore-БД: собственный уникальный идентификатор с обязательным префиксом.
  const restoreDb = `lsf_test_r_${process.pid}_${randomUUID().slice(0, 8)}`;
  assert.ok(restoreDb.startsWith("lsf_test_"), "имя restore-БД вне разрешённого префикса");
  assert.ok(restoreDb.length <= 63, "имя restore-БД длиннее лимита PostgreSQL");
  const existed = adminSql(`SELECT 1 FROM pg_database WHERE datname='${restoreDb}'`);
  assert.equal(String(existed).trim(), "", "restore-БД уже существует — не перехватываем чужую");
  const dir = mkdtempSync(path.join(tmpdir(), "lsf-bk-"));
  const dumpPath = path.join(dir, "backup.sql");
  let createdRestore = false;
  try {
    // source — ровно проверенный target из TEST_DATABASE_URL.
    const dump = pgTool("pg_dump", ["-U", pgUser, "-d", pgTarget.database, "--no-owner"]);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(dumpPath, dump);
    adminSql(`CREATE DATABASE ${restoreDb} OWNER ${pgUser}`);
    createdRestore = true;
    pgTool("psql", [
      "-U", pgUser, "-d", restoreDb, "-v", "ON_ERROR_STOP=1", "-q",
    ], { input: readFileSync(dumpPath) });
    const tcount = (query) => parseInt(
      String(pgTool("psql", ["-U", pgUser, "-d", restoreDb, "-tAc", query], { encoding: "utf8" })).trim(),
      10,
    );
    assert.equal(tcount(`SELECT count(*) FROM leads WHERE idempotency_key='${marker}'`), 1);
    assert.equal(
      tcount(`SELECT count(*) FROM notification_receipts r
        JOIN notification_outbox o ON o.id=r.outbox_id
        JOIN leads l ON l.id=r.lead_id WHERE l.idempotency_key='${marker}'`),
      1,
    );
  } finally {
    if (createdRestore) adminSql(`DROP DATABASE ${restoreDb}`);
    await db((c) => c.query("DELETE FROM leads WHERE idempotency_key=$1", [marker]));
    rmSync(dir, { recursive: true, force: true });
  }
  const gone = adminSql(`SELECT 1 FROM pg_database WHERE datname='${restoreDb}'`);
  assert.equal(String(gone).trim(), "", "своя restore-БД удалена");
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
