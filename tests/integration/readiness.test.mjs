// BR2a/BR2b (CLI, реальный migrate.ts) и BR4 (HTTP-готовность + реальные
// SQL-счётчики + сохранённый replay при сломанной текущей конфигурации).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { BASE, TEST_DSN, db, makeBody, post, freshClient } from "./helpers.mjs";

const READY_BASE = process.env.TEST_BASE_URL_READY;
const repoRoot = process.cwd();
const MIGRATE = path.join(repoRoot, "scripts", "backend", "migrate.ts");

async function counters() {
  const result = await db((c) => c.query(
    `SELECT
       (SELECT count(*)::int FROM leads) AS leads,
       (SELECT count(*)::int FROM notification_outbox) AS outbox,
       (SELECT count(*)::int FROM notification_receipts) AS receipts,
       (SELECT coalesce(sum(count),0)::int FROM rate_limits) AS rate_count`,
  ));
  return result.rows[0];
}

function runMigrate(env) {
  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", MIGRATE],
    { cwd: repoRoot, encoding: "utf8", timeout: 60_000, env: { ...process.env, ...env } },
  );
}

test("BR2a: test-mode с несовпадающим DATABASE_URL — nonzero до любых SQL", () => {
  const wrong = new URL(TEST_DSN);
  wrong.port = "59999"; // тот же синтетический кластер, несовпадающий эффективный target
  const mismatchDsn = wrong.toString();
  const startedAt = Date.now();
  const run = runMigrate({
    LSF_MIGRATE_TEST_MODE: "1",
    TEST_DATABASE_URL: TEST_DSN,
    DATABASE_URL: mismatchDsn,
  });
  const elapsed = Date.now() - startedAt;
  assert.notEqual(run.status, 0, "мигратор обязан отказать");
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  assert.ok(!output.includes("001_core"), "никаких миграций не применялось");
  assert.ok(elapsed < 20_000, `отказ мгновенный, без ожидания коннекта (${elapsed} мс)`);
});

test("BR2b: host в query не перенаправляет соединение — отказ до connect", () => {
  const run = runMigrate({
    LSF_MIGRATE_TEST_MODE: "1",
    TEST_DATABASE_URL: TEST_DSN,
    DATABASE_URL: `${TEST_DSN}?host=example.invalid`,
  });
  assert.notEqual(run.status, 0);
  const run2 = runMigrate({
    LSF_MIGRATE_TEST_MODE: "1",
    TEST_DATABASE_URL: `${TEST_DSN}?host=example.invalid`,
    DATABASE_URL: TEST_DSN,
  });
  assert.notEqual(run2.status, 0, "тот же трюк в TEST_DATABASE_URL тоже отказывает");
});

test("BR2d: одинаковый эффективный target проходит и миграции идемпотентны", () => {
  const run = runMigrate({
    LSF_MIGRATE_TEST_MODE: "1",
    TEST_DATABASE_URL: TEST_DSN,
    DATABASE_URL: `${TEST_DSN}?sslmode=disable`,
  });
  assert.equal(run.status, 0, `миграции должны пройти: ${run.stderr ?? ""}`);
});

test("BR4: ghost-назначение — 503 DEMO_NOT_READY без lead/outbox/расхода лимита", async () => {
  assert.ok(READY_BASE, "readiness-приложение не запущено harness (BR5)");
  const before = await counters();
  const key = randomUUID();
  const response = await post(READY_BASE, makeBody(), { key, client: freshClient() });
  assert.equal(response.status, 503);
  assert.equal(response.json?.error?.code, "DEMO_NOT_READY");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const after = await counters();
  assert.deepEqual(after, before, "ни lead, ни outbox, ни расхода лимита");
  // Тот же payload на рабочем приложении проходит — отличие именно в готовности.
  const key2 = randomUUID();
  const ok = await post(BASE, makeBody(), { key: key2, client: freshClient() });
  assert.equal(ok.status, 201);
});

test("BR4: сохранённый replay работает при сломанной текущей конфигурации", async () => {
  const key = randomUUID();
  const client = freshClient();
  const body = makeBody();
  const created = await post(BASE, body, { key, client });
  assert.equal(created.status, 201);
  const replay = await post(READY_BASE, body, { key, client });
  assert.equal(replay.status, 200, "повтор не зависит от текущей готовности назначения");
  assert.equal(replay.json?.replayed, true);
  assert.equal(replay.json?.leadId, created.json?.leadId);
  const row = await db((c) => c.query(
    `SELECT count(*)::int AS leads FROM leads WHERE site_key='auto' AND idempotency_key=$1`,
    [key],
  ));
  assert.equal(row.rows[0].leads, 1);
});

test("BR4: ghost-приложение не принимает новую заявку и после повтора соседа", async () => {
  const before = await counters();
  const response = await post(READY_BASE, makeBody(), { key: randomUUID(), client: freshClient() });
  assert.equal(response.status, 503);
  assert.equal(response.json?.error?.code, "DEMO_NOT_READY");
  const after = await counters();
  assert.deepEqual(after, before);
});
