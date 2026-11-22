/**
 * Мигратор (PR3, §10): блокировка от двух одновременных запусков,
 * каждая миграция — отдельная транзакция, применяется ровно один раз.
 * usage: DATABASE_URL=... npm run db:migrate
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";
import { assertSafeTestDatabaseUrl, sameEffectiveTarget } from "../../src/server/config/guards.ts";

const MIGRATOR_LOCK_KEY = 741_000_1;

async function main(): Promise<void> {
  let url = process.env.DATABASE_URL;
  // BR2: в тестовом режиме валидируется и используется именно TEST_DATABASE_URL.
  // Несовпадение фактического DATABASE_URL с проверенным test-DSN — отказ до
  // connect() и до любого SQL; test-guard не подменяет production-политику.
  if (process.env.LSF_MIGRATE_TEST_MODE === "1") {
    const testUrl = assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL);
    if (url && !sameEffectiveTarget(url, testUrl)) {
      console.error("тестовый режим: DATABASE_URL указывает не на проверенный TEST_DATABASE_URL");
      process.exitCode = 1;
      return;
    }
    url = testUrl;
  }
  if (!url) {
    console.error("DATABASE_URL не задан");
    process.exitCode = 1;
    return;
  }
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const client = new Client({ connectionString: url, statement_timeout: 30_000 });
  await client.connect();
  try {
    const locked = await client.query(
      "SELECT pg_try_advisory_lock($1) AS ok",
      [MIGRATOR_LOCK_KEY],
    );
    if (!locked.rows[0]?.ok) {
      console.error("другой экземпляр мигратора уже выполняется");
      process.exitCode = 1;
      return;
    }
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      const applied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        [version],
      );
      if ((applied.rowCount ?? 0) > 0) {
        console.log(`skip ${version}`);
        continue;
      }
      const sql = readFileSync(path.join(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
        await client.query("COMMIT");
        console.log(`applied ${version}`);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        console.error(`миграция ${version} отменена`);
        void error;
        process.exitCode = 1;
        return;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATOR_LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
}

main().catch((error: unknown) => {
  // Безопасно: без DSN; pg-ошибки содержат SQL, а не секреты.
  const message = error instanceof Error ? error.message.split("@").pop() ?? "" : "";
  console.error(`миграции завершились ошибкой: ${message.slice(0, 300)}`);
  process.exitCode = 1;
});
