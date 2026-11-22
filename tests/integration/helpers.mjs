// Общие хелперы интеграционных тестов: БД, тело запроса, POST с заголовками.
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

export const BASE = process.env.TEST_BASE_URL;
export const DOWN_BASE = process.env.TEST_BASE_URL_DOWN;
export const TEST_DSN = process.env.TEST_DATABASE_URL;
export const OUTBOX_SECRET = process.env.TEST_OUTBOX_SECRET;
export const HMAC_KEY = process.env.TEST_PAYLOAD_HMAC_KEY;
export const ORIGIN = process.env.TEST_ALLOWED_ORIGIN;
export const RATE_KEY = process.env.TEST_RATE_LIMIT_HMAC_KEY;

export const SYNTHETIC_PHONE = "+7" + "0".repeat(10);
export const CONFIG_VERSION = "demo-2026-11-04";

export async function db(fn) {
  const client = new Client({ connectionString: TEST_DSN });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Москва «сегодня» + offset дней, пропуск воскресений (ISO 7 нерабочий). */
export function futureWorkingDate(offsetDays = 2) {
  const moscow = new Date(Date.now() + 3 * 3_600_000);
  const d = new Date(Date.UTC(
    moscow.getUTCFullYear(), moscow.getUTCMonth(), moscow.getUTCDate() + offsetDays,
  ));
  while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function makeBody(overrides = {}) {
  const { date, time = "10:30", siteKey = "auto", serviceId = "tire-change",
    options, resourceId, phone = SYNTHETIC_PHONE, name, noPreferred = false,
    configVersion = CONFIG_VERSION, consentVersion = CONFIG_VERSION, ...rest } = overrides;
  const body = {
    siteKey,
    configVersion,
    kind: "booking",
    serviceId,
    serviceOptions: options ?? (serviceId === "tire-change" ? { "wheel-size": "R16" } : {}),
    customer: { phone, ...(name !== undefined ? { name } : {}) },
    consent: { accepted: true, version: consentVersion },
    antiBot: { website: "" },
    ...rest,
  };
  if (!noPreferred) {
    body.preferred = { date: date ?? futureWorkingDate(), time, timezone: "Europe/Moscow" };
  }
  if (resourceId !== undefined) body.resourceId = resourceId;
  return body;
}

export function freshClient() {
  return `test-${randomUUID()}`;
}

export async function post(base, body, opts = {}) {
  const key = opts.key === undefined ? randomUUID() : opts.key;
  const headers = {
    "Content-Type": "application/json",
    Origin: opts.origin === null ? undefined : (opts.origin ?? base),
    "Idempotency-Key": key,
    "X-Test-Client": opts.client ?? freshClient(),
  };
  if (opts.contentType !== undefined) headers["Content-Type"] = opts.contentType;
  if (key === null) delete headers["Idempotency-Key"];
  if (!headers.Origin) delete headers.Origin;
  const response = await fetch(`${base}/api/leads`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, json, headers: response.headers };
}

export async function postOutboxRun(base, authHeader) {
  const headers = authHeader ? { Authorization: authHeader } : {};
  const response = await fetch(`${base}/api/internal/outbox`, { method: "POST", headers });
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, json, headers: response.headers };
}

export const bearer = () => `Bearer ${OUTBOX_SECRET}`;

export async function clearRateLimits() {
  await db((client) => client.query("DELETE FROM rate_limits"));
}

/** Спавн второго экземпляра приложения (BI14) с теми же тестовыми секретами. */
export function spawnSecondApp(port) {
  const root = process.cwd();
  const nextBin = process.env.TEST_NEXT_BIN ?? path.join(root, "node_modules/next/dist/bin/next");
  const env = {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: TEST_DSN,
    ALLOWED_ORIGINS: `http://127.0.0.1:${port}`,
    ALLOWED_SITE_KEYS: "auto,beauty",
    ENABLE_LIVE_LEADS: "false",
    TRUSTED_IP_HEADER: "X-Test-Client",
    IDEMPOTENCY_HMAC_KEY: HMAC_KEY,
    RATE_LIMIT_HMAC_KEY: process.env.TEST_RATE_LIMIT_HMAC_KEY ?? "rate-integration-key-0000000000000000",
    OUTBOX_SECRET: OUTBOX_SECRET,
    SITE_DESTINATIONS_JSON: JSON.stringify({
      auto: { destinationKey: "demo-auto-v1", version: 1 },
      beauty: { destinationKey: "demo-beauty-v1", version: 1 },
    }),
    NOTIFICATION_DESTINATIONS_JSON: JSON.stringify({
      "demo-auto-v1": { adapterId: "recording" },
      "demo-beauty-v1": { adapterId: "recording" },
    }),
  };
  const child = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root, env, stdio: "ignore",
  });
  return child;
}

export function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

export async function waitForHttp(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 600) return true;
    } catch {
      // ещё не готов
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

export async function leadByKey(client, siteKey, idempotencyKey) {
  const result = await client.query(
    `SELECT l.id, l.payload_hmac, l.customer_phone, l.consent_version, l.price_snapshot,
            count(o.id)::int AS outbox_count,
            max(o.status) AS outbox_status, max(o.destination_key) AS destination_key
     FROM leads l
     LEFT JOIN notification_outbox o ON o.lead_id = l.id
     WHERE l.site_key = $1 AND l.idempotency_key = $2
     GROUP BY l.id`,
    [siteKey, idempotencyKey],
  );
  return result.rows[0] ?? null;
}
