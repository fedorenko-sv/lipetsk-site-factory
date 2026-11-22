/**
 * Purge заявок по retention (PR3, §13): dry-run по умолчанию; реальное
 * удаление только с --execute и утверждённым retention (число дней).
 * Каскадно удаляются outbox и receipts. rate_limits чистятся по expires_at.
 * usage: DATABASE_URL=... node --experimental-strip-types scripts/backend/purge-leads.ts --retention-days <N> [--execute]
 */
import process from "node:process";
import { Client } from "pg";

interface CountRow {
  count: string;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const execute = argv.includes("--execute");
  const idx = argv.indexOf("--retention-days");
  const retentionArg = idx >= 0 ? argv[idx + 1] : undefined;
  const retentionDays = retentionArg === undefined ? NaN : Number(retentionArg);
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    console.error("нужен явный --retention-days <целое >= 1>");
    process.exitCode = 1;
    return;
  }
  // Жёсткий guard: без --execute ничего не удаляем; live-производство без
  // утверждённого срока не запускается вовсе (retention задаёт владелец).
  const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL не задан");
    process.exitCode = 1;
    return;
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
    const leads = await client.query<CountRow>(
      "SELECT count(*)::text AS count FROM leads WHERE created_at < $1",
      [cutoff],
    );
    const buckets = await client.query<CountRow>(
      "SELECT count(*)::text AS count FROM rate_limits WHERE expires_at < now()",
    );
    const pendingOld = await client.query<CountRow>(
      `SELECT count(*)::text AS count FROM leads l
       WHERE l.created_at < $1
         AND EXISTS (SELECT 1 FROM notification_outbox o WHERE o.lead_id = l.id AND o.status <> 'sent')`,
      [cutoff],
    );
    console.log(`cutoff: ${cutoff}`);
    console.log(`leads к удалению: ${leads.rows[0]?.count ?? 0}`);
    console.log(`rate buckets к удалению: ${buckets.rows[0]?.count ?? 0}`);
    console.log(`старые заявки с недоставленной очередью: ${pendingOld.rows[0]?.count ?? 0}`);
    if (!execute) {
      console.log("dry-run: изменения не выполнены (нужен --execute)");
      return;
    }
    await client.query("BEGIN");
    const deleted = await client.query(
      "DELETE FROM leads WHERE created_at < $1",
      [cutoff],
    );
    await client.query("DELETE FROM rate_limits WHERE expires_at < now()");
    await client.query("COMMIT");
    console.log(`удалено leads (каскадно outbox/receipts): ${deleted.rowCount ?? 0}`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(() => {
  console.error("purge завершился ошибкой");
  process.exitCode = 1;
});
