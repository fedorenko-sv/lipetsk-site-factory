// Local synthetic preview only. Secrets exist in child environment; never logged.
import { Client } from "pg";
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { assertSafeTestDatabaseUrl } from "../src/server/config/guards.ts";

import { base as BASE, port, database as dbName } from "./detailing-preview-address.mjs";

const ROOT = process.cwd();
mkdirSync("work/detailing", { recursive: true });
if (!existsSync(".next/BUILD_ID")) throw new Error("Run npm run build before preview");
const occupied = await fetch(BASE, { signal: AbortSignal.timeout(1000) }).then(
  () => true,
  () => false,
);
if (occupied)
  throw new Error("Port " + port + " is already in use; select another DETAILING_PREVIEW_PORT.");
const url = new URL("postgresql://127.0.0.1:55543/postgres");
url.username = "lsf_test";
url.password = "lsf_test_only";
const admin = new Client({ connectionString: url.toString() });
await admin.connect();
try {
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [dbName]);
  if (!exists.rowCount) await admin.query(`CREATE DATABASE ${dbName}`);
} finally {
  await admin.end();
}
url.pathname = "/" + dbName;
const dsn = assertSafeTestDatabaseUrl(url.toString());
const secret = () => randomBytes(24).toString("hex");
const outboxSecret = secret();
const env = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  DATABASE_URL: dsn,
  TEST_DATABASE_URL: dsn,
  ALLOWED_ORIGINS: BASE,
  ALLOWED_SITE_KEYS: "auto,beauty,detailing",
  ENABLE_LIVE_LEADS: "false",
  IDEMPOTENCY_HMAC_KEY: secret(),
  RATE_LIMIT_HMAC_KEY: secret(),
  OUTBOX_SECRET: outboxSecret,
  SITE_DESTINATIONS_JSON: JSON.stringify({
    detailing: { destinationKey: "demo-detailing-v1", version: 1 },
    auto: { destinationKey: "demo-auto-v1", version: 1 },
    beauty: { destinationKey: "demo-beauty-v1", version: 1 },
  }),
  NOTIFICATION_DESTINATIONS_JSON: JSON.stringify({
    "demo-detailing-v1": { adapterId: "recording" },
    "demo-auto-v1": { adapterId: "recording" },
    "demo-beauty-v1": { adapterId: "recording" },
  }),
};
const migrated = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "scripts/backend/migrate.ts"],
  {
    env: { ...env, LSF_MIGRATE_TEST_MODE: "1" },
    stdio: "ignore",
  },
);
if (migrated.status !== 0) throw new Error("Preview migration failed");
const log = createWriteStream("work/detailing/preview-" + port + "-app.log", { flags: "a" });
const child = spawn(
  process.execPath,
  [
    path.join(ROOT, "node_modules/next/dist/bin/next"),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
child.stdout.pipe(log);
child.stderr.pipe(log);
let ready = false;
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(BASE)).ok) {
      ready = true;
      break;
    }
  } catch {}
  if (child.exitCode !== null) break;
  await delay(300);
}
if (!ready) {
  child.kill();
  throw new Error("Preview app did not start");
}
writeFileSync(
  "work/detailing/preview-" + port + "-state.json",
  JSON.stringify(
    {
      helperPid: process.pid,
      appPid: child.pid,
      baseUrl: BASE,
      database: dbName,
      startedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log("Local synthetic preview ready on " + BASE);
let dispatching = false;
const timer = setInterval(async () => {
  if (dispatching) return;
  dispatching = true;
  try {
    await fetch(BASE + "/api/internal/outbox", {
      method: "POST",
      headers: { Authorization: "Bearer " + outboxSecret },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
  } finally {
    dispatching = false;
  }
}, 15000);
function stop() {
  clearInterval(timer);
  if (process.platform === "win32")
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
  process.exit();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", () => {
  clearInterval(timer);
  process.exit();
});
