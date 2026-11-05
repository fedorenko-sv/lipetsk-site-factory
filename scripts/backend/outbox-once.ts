/**
 * Одна пачка worker из CLI (PR3, §12–§13): claim -> recording -> итог.
 * usage: задать DATABASE_URL и серверные секреты из .env.example, затем npm run outbox:once
 */
import process from "node:process";
import { loadRuntimeConfig } from "../../src/server/config/runtime.ts";
import { closeSharedPool } from "../../src/server/db/pool.ts";
import { runProductionOutboxBatch } from "../../src/server/deps.ts";

async function main(): Promise<void> {
  const runtime = loadRuntimeConfig(process.env);
  const counts = await runProductionOutboxBatch(runtime);
  console.log(
    `outbox: processed=${counts.processed} sent=${counts.sent} retried=${counts.retried} dead=${counts.dead}`,
  );
}

main()
  .catch(() => {
    console.error("outbox batch завершился ошибкой");
    process.exitCode = 1;
  })
  .finally(() => {
    void closeSharedPool();
  });
