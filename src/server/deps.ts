/**
 * Боевая сборка зависимостей сервера. Импорт модуля не открывает соединений:
 * пул создаётся лениво при первом обращении (build не требует БД/секретов).
 */
import type { RuntimeConfig } from "./config/runtime.ts";
import { ConfigProblem } from "./config/runtime.ts";
import { getSharedPool } from "./db/pool.ts";
import { PgLeadStore } from "./db/store.ts";
import { PgOutboxRepo } from "./notifications/worker.ts";
import type { OutboxCounts } from "./notifications/worker.ts";
import { runOutboxBatch } from "./notifications/worker.ts";
import { RecordingAdapter } from "./notifications/recording.ts";
import { AdapterRegistry } from "./notifications/registry.ts";
import { SYSTEM_CLOCK } from "./leads/ports.ts";
import type { LeadStore } from "./leads/store-port.ts";

const registry = new AdapterRegistry();
registry.register("recording", () => new RecordingAdapter(getSharedPool(databaseUrl())));

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new ConfigProblem("STORAGE_UNAVAILABLE", "DATABASE_URL не задан");
  return url;
}

export function makeProductionStore(runtime: RuntimeConfig): LeadStore {
  void runtime;
  return new PgLeadStore(getSharedPool(databaseUrl()));
}

export async function runProductionOutboxBatch(runtime: RuntimeConfig): Promise<OutboxCounts> {
  const pool = getSharedPool(databaseUrl());
  void runtime;
  return runOutboxBatch(new PgOutboxRepo(pool), registry, SYSTEM_CLOCK);
}

export { SYSTEM_CLOCK };
