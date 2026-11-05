/**
 * Один пул pg на процесс (PR3, §10): max=5, connectionTimeoutMillis=5000,
 * statement_timeout=5000. Пул создаётся лениво при первом обращении к
 * сценарию, а не при импорте/сборке.
 */
import { Pool } from "pg";

let sharedPool: Pool | null = null;

export function getSharedPool(databaseUrl: string): Pool {
  if (sharedPool === null) {
    sharedPool = new Pool({
      connectionString: databaseUrl,
      max: 5,
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000,
    });
  }
  return sharedPool;
}

/** Только для корректного завершения CLI/harness. */
export async function closeSharedPool(): Promise<void> {
  if (sharedPool !== null) {
    await sharedPool.end();
    sharedPool = null;
  }
}

export function isPoolInitialized(): boolean {
  return sharedPool !== null;
}
