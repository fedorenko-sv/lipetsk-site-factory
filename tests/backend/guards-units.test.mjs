// BR2b/BR2c: guard проверяет эффективную цель соединения (как её разберёт
// драйвер), а не только URI-компоненты. Отказ — до Client.connect и любого SQL.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertSafeTestDatabaseUrl, effectiveTestTarget, sameEffectiveTarget, UnsafeDatabaseError,
} from "../../src/server/config/guards.ts";

const SAFE = "postgresql://u:***@127.0.0.1:55543/lsf_test_backend";

test("BR2b: query host/hostaddr/port/dbname не переопределяют эффективный target", () => {
  assert.throws(
    () => assertSafeTestDatabaseUrl(`${SAFE}?host=example.invalid`),
    UnsafeDatabaseError, "host в query должен отклоняться",
  );
  assert.throws(
    () => assertSafeTestDatabaseUrl(`${SAFE}?hostaddr=203.0.113.9`),
    UnsafeDatabaseError, "hostaddr в query должен отклоняться",
  );
  assert.throws(
    () => assertSafeTestDatabaseUrl(`${SAFE}?database=production_probe`),
    UnsafeDatabaseError, "database в query должен отклоняться",
  );
  assert.throws(
    () => assertSafeTestDatabaseUrl(`${SAFE}?dbname=other`),
    UnsafeDatabaseError, "dbname в query должен отклоняться",
  );
  assert.throws(
    () => assertSafeTestDatabaseUrl(`${SAFE}?port=1`),
    UnsafeDatabaseError, "port в query должен отклоняться",
  );
  assert.throws(
    () => assertSafeTestDatabaseUrl(`${SAFE}?sslmode=disable&sslmode=require`),
    UnsafeDatabaseError, "дублированный ключ скрывает выбор драйвера",
  );
  assert.throws(
    () => assertSafeTestDatabaseUrl("postgresql://u:***@127.0.0.1,evil.host:5432/lsf_test_backend"),
    UnsafeDatabaseError, "список host запрещён",
  );
});

test("BR2c: протокол, не-loopback и имя без lsf_test_ отклоняются", () => {
  assert.throws(() => assertSafeTestDatabaseUrl("mysql://u:***@127.0.0.1/lsf_test_x"), UnsafeDatabaseError);
  assert.throws(() => assertSafeTestDatabaseUrl("http://127.0.0.1/lsf_test_x"), UnsafeDatabaseError);
  assert.throws(
    () => assertSafeTestDatabaseUrl("postgresql://u:***@db.prod.internal:5432/lsf_test_backend"),
    UnsafeDatabaseError,
  );
  assert.throws(
    () => assertSafeTestDatabaseUrl("postgresql://u:***@127.0.0.1:5432/review_guard_probe"),
    UnsafeDatabaseError,
  );
});

test("BR2d-юнит: допустимые опции не мешают; эффективный target разобран верно", () => {
  const withOptions = `${SAFE}?sslmode=disable&connect_timeout=3&application_name=lsf-test`;
  assert.equal(assertSafeTestDatabaseUrl(withOptions), withOptions);
  assert.deepEqual(effectiveTestTarget(withOptions), {
    host: "127.0.0.1", port: 55543, database: "lsf_test_backend",
  });
  assert.equal(sameEffectiveTarget(SAFE, `${SAFE}?sslmode=disable`), true);
  assert.equal(sameEffectiveTarget(SAFE, "postgresql://u:***@127.0.0.1:55544/lsf_test_backend"), false);
  assert.equal(sameEffectiveTarget(SAFE, "postgresql://u:***@127.0.0.1:55543/lsf_test_other"), false);
});
