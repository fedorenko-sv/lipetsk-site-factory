/**
 * Экспорт заявок владельцем (PR3, §13): явный --out, файл вне Git checkout,
 * создание без перезаписи, контакты не печатать в stdout. Скрипт не CRM.
 * usage: DATABASE_URL=... node --experimental-strip-types scripts/backend/export-leads.ts --out <путь> [--site <key>]
 */
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";
import { assertExportPathOutsideRepo } from "../../src/server/config/guards.ts";

interface LeadRow {
  id: string;
  site_key: string;
  service_id: string;
  resource_id: string | null;
  preferred_at: Date | null;
  customer_phone: string;
  customer_name: string | null;
  created_at: Date;
  status: string;
}

function parseArgs(argv: string[]): { out: string | null; site: string | null } {
  let out: string | null = null;
  let site: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") out = argv[i + 1] ?? null;
    if (argv[i] === "--site") site = argv[i + 1] ?? null;
  }
  return { out, site };
}

async function main(): Promise<void> {
  const { out, site } = parseArgs(process.argv.slice(2));
  if (!out) {
    console.error("нужен явный --out <путь вне репозитория>");
    process.exitCode = 1;
    return;
  }
  const repoRoot = process.cwd();
  try {
    assertExportPathOutsideRepo(out, repoRoot);
  } catch {
    console.error("файл экспорта должен лежать вне папки репозитория");
    process.exitCode = 1;
    return;
  }
  const target = path.resolve(out);
  if (existsSync(target)) {
    console.error("файл уже существует: перезапись запрещена");
    process.exitCode = 1;
    return;
  }
  const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL не задан");
    process.exitCode = 1;
    return;
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const rows = site
      ? await client.query<LeadRow>(
          `SELECT id, site_key, service_id, resource_id, preferred_at, customer_phone,
                  customer_name, created_at, status
           FROM leads WHERE site_key = $1 ORDER BY created_at`,
          [site],
        )
      : await client.query<LeadRow>(
          `SELECT id, site_key, service_id, resource_id, preferred_at, customer_phone,
                  customer_name, created_at, status
           FROM leads ORDER BY created_at`,
        );
    const header = "id,site_key,service_id,resource_id,preferred_at,customer_phone,customer_name,created_at,status";
    const lines = rows.rows.map((r) =>
      [
        r.id, r.site_key, r.service_id, r.resource_id ?? "",
        r.preferred_at ? r.preferred_at.toISOString() : "",
        `"${r.customer_phone.replace(/"/g, '""')}"`,
        r.customer_name ? `"${r.customer_name.replace(/"/g, '""')}"` : "",
        r.created_at.toISOString(),
        r.status,
      ].join(","),
    );
    await writeFile(target, [header, ...lines].join("\n") + "\n", { flag: "wx" });
    // Только количество: контакты и имена в stdout не попадают.
    console.log(`экспортировано записей: ${rows.rowCount ?? 0}`);
  } finally {
    await client.end();
  }
}

main().catch(() => {
  console.error("export завершился ошибкой");
  process.exitCode = 1;
});
