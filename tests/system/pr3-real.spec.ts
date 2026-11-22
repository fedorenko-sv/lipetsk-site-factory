/**
 * System smoke PR-3 (§17, BR5): настоящий HTTP/API + браузерный UI-контракт +
 * PostgreSQL из harness. Никаких skip: отсутствие UI/testid — ошибка теста.
 * В самостоятельной backend-ветке UI нет — там прогон связки выполняется в
 * отдельном checkout объединённого снимка (docs/reports/backend.md).
 * page.route и подмены application/repository запрещены. Очистка — только по
 * собственным idempotency-ключам, lead id и rate_limits-строкам, созданным
 * во время прогона (identity high-water mark), без DELETE ... WHERE true.
 */
import { test, expect } from "@playwright/test";
import { Client } from "pg";

const BASE = process.env.TEST_SYSTEM_BASE_URL ?? "http://127.0.0.1:3023";
const DSN = process.env.TEST_DATABASE_URL;
const OUTBOX_SECRET = process.env.TEST_OUTBOX_SECRET;
const SYNTH = "+7" + "0".repeat(10);
const CONFIG = "demo-2026-11-04";

if (!DSN || !OUTBOX_SECRET) {
  throw new Error("system: TEST_DATABASE_URL и TEST_OUTBOX_SECRET задаёт только test-system.mjs");
}

async function db<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DSN });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function futureWorkingDate(offsetDays = 2): string {
  const moscow = new Date(Date.now() + 3 * 3_600_000);
  const d = new Date(Date.UTC(
    moscow.getUTCFullYear(), moscow.getUTCMonth(), moscow.getUTCDate() + offsetDays,
  ));
  while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function apiPost(body: unknown, key: string, client: string) {
  const response = await fetch(`${BASE}/api/leads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      "Idempotency-Key": key,
      "X-Test-Client": client,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json().catch(() => null) };
}

async function runWorker() {
  const response = await fetch(`${BASE}/api/internal/outbox`, {
    method: "POST",
    headers: { Authorization: `Bearer ${OUTBOX_SECRET}` },
  });
  expect(response.status).toBe(200);
  return response.json() as Promise<{ processed: number; sent: number; retried: number; dead: number }>;
}

function autoBody(overrides: Record<string, unknown> = {}) {
  return {
    siteKey: "auto",
    configVersion: CONFIG,
    kind: "booking",
    serviceId: "tire-change",
    serviceOptions: { "wheel-size": "R16" },
    preferred: { date: futureWorkingDate(), time: "10:30", timezone: "Europe/Moscow" },
    customer: { phone: SYNTH },
    consent: { accepted: true, version: CONFIG },
    antiBot: { website: "" },
    ...overrides,
  };
}

const uuid = () => crypto.randomUUID();

/** Проходит мастер Auto/Beauty в браузере до экрана успеха и возвращает leadId из UI. */
async function submitThroughUi(
  page: import("@playwright/test").Page,
  siteKey: "auto" | "beauty",
  serviceId: string,
  opts: { wheelSize?: string; resource?: string | null; timeIndex?: number } = {},
): Promise<string> {
  await page.goto(`${BASE}/demo/${siteKey}`);
  // BR5: шаг параметров открывается первым; отсутствие UI — ошибка, не skip.
  await expect(page.getByTestId("offer-step")).toBeVisible();
  await page.getByTestId(`service-${serviceId}`).check();
  await page.getByTestId("next-to-preference").click();
  await expect(page.getByTestId("preference-step")).toBeVisible();
  if (opts.wheelSize !== undefined) {
    await page.getByTestId("service-option-wheel-size").selectOption(opts.wheelSize);
  }
  if (opts.resource !== undefined && opts.resource !== null) {
    await page.getByTestId("resource-select").selectOption(opts.resource);
  }
  await page.getByTestId("preferred-date").fill(futureWorkingDate());
  if (opts.timeIndex !== undefined) {
    await page.getByTestId("preferred-time").selectOption({ index: opts.timeIndex });
  } else {
    await page.getByTestId("preferred-time").selectOption("10:30");
  }
  await page.getByTestId("next-to-contact").click();
  await expect(page.getByTestId("contact-step")).toBeVisible();
  await page.getByTestId("customer-phone").fill(SYNTH);
  await page.getByTestId("consent").check();
  await page.getByTestId("lead-submit").click();
  await expect(page.getByTestId("lead-success")).toBeVisible();
  const leadId = (await page.getByTestId("lead-id").textContent())?.trim() ?? "";
  expect(leadId).toMatch(/^[0-9a-f-]{36}$/);
  return leadId;
}

test.describe.serial("PR-3 system smoke", () => {
  const keys: string[] = [];
  const leadIds: string[] = [];
  let rateHighWater = 0;

  test.beforeAll(async () => {
    rateHighWater = await db(async (c) => {
      const r = await c.query("SELECT coalesce(max(id),0)::int AS m FROM rate_limits");
      return r.rows[0].m;
    });
  });

  test.afterAll(async () => {
    if (keys.length > 0) {
      await db((c) => c.query("DELETE FROM leads WHERE idempotency_key = ANY($1)", [keys]));
    }
    if (leadIds.length > 0) {
      await db((c) => c.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]));
    }
    // Только строки лимитов, созданные этим прогоном (identity > high-water).
    await db((c) => c.query("DELETE FROM rate_limits WHERE id > $1", [rateHighWater]));
  });

  test("S1 UI Auto через мастер /demo/auto: leadId UI = lead/outbox/receipt", async ({ page }) => {
    const leadId = await submitThroughUi(page, "auto", "tire-change", { wheelSize: "R16" });
    leadIds.push(leadId);
    const row = await db(async (c) => {
      const r = await c.query(
        `SELECT l.site_key, l.service_id, l.customer_phone, l.status,
                o.id AS outbox_id, o.destination_key, o.adapter_id, o.status AS outbox_status
         FROM leads l
         JOIN notification_outbox o ON o.lead_id = l.id
         WHERE l.id = $1`,
        [leadId],
      );
      return r.rows[0] ?? null;
    });
    expect(row, "lead из UI-отправки существует в БД").not.toBeNull();
    expect(row.site_key).toBe("auto");
    expect(row.service_id).toBe("tire-change");
    expect(row.customer_phone).toBe(SYNTH);
    expect(row.destination_key).toBe("demo-auto-v1");
    expect(row.adapter_id).toBe("recording");
    const run = await runWorker();
    expect(run.processed).toBeGreaterThanOrEqual(1);
    const after = await db(async (c) => {
      const r = await c.query(
        `SELECT o.status, (SELECT count(*) FROM notification_receipts x WHERE x.outbox_id=o.id)::int AS receipts
         FROM notification_outbox o WHERE o.id=$1`,
        [row.outbox_id],
      );
      return r.rows[0];
    });
    expect(after.status).toBe("sent");
    expect(after.receipts).toBe(1);
  });

  test("S2 API+SQL: точные site/service/предпочтение/consent/snapshot", async () => {
    const key = uuid();
    keys.push(key);
    const clientTag = `sys-${key.slice(0, 8)}`;
    const result = await apiPost(autoBody(), key, clientTag);
    expect(result.status).toBe(201);
    const row = await db(async (c) => {
      const r = await c.query(
        `SELECT site_key, service_id, service_options, preferred_at, timezone,
                customer_phone, consent_version, status, price_snapshot
         FROM leads WHERE site_key='auto' AND idempotency_key=$1`,
        [key],
      );
      return r.rows[0] ?? null;
    });
    expect(row).not.toBeNull();
    expect(row.site_key).toBe("auto");
    expect(row.service_id).toBe("tire-change");
    expect(row.service_options).toEqual({ "wheel-size": "R16" });
    expect(row.preferred_at).not.toBeNull();
    expect(row.timezone).toBe("Europe/Moscow");
    expect(row.customer_phone).toBe(SYNTH);
    expect(row.consent_version).toBe(CONFIG);
    expect(row.status).toBe("new");
    expect(row.price_snapshot.amountMinor).toBe(180000);
  });

  test("S3 worker: internal run даёт recording receipt и sent", async () => {
    const run = await runWorker();
    expect(run.processed).toBeGreaterThanOrEqual(1);
    const state = await db(async (c) => {
      const r = await c.query(
        `SELECT o.status, (SELECT count(*) FROM notification_receipts x WHERE x.outbox_id=o.id)::int AS receipts
         FROM notification_outbox o JOIN leads l ON l.id=o.lead_id
         WHERE l.idempotency_key = ANY($1)`,
        [keys],
      );
      return r.rows;
    });
    expect(state.length).toBeGreaterThan(0);
    for (const job of state) {
      expect(job.status).toBe("sent");
      expect(job.receipts).toBe(1);
    }
  });

  test("S4 повтор payload/key — 200 replayed, без второго lead", async () => {
    const key = uuid();
    keys.push(key);
    const clientTag = `sys-${key.slice(0, 8)}`;
    const body = autoBody();
    const first = await apiPost(body, key, clientTag);
    expect(first.status).toBe(201);
    const second = await apiPost(body, key, clientTag);
    expect(second.status).toBe(200);
    expect(second.json.replayed).toBe(true);
    expect(second.json.leadId).toBe(first.json.leadId);
    const counts = await db(async (c) => {
      const l = await c.query(
        "SELECT count(*)::int AS n FROM leads WHERE site_key='auto' AND idempotency_key=$1", [key],
      );
      const o = await c.query(
        `SELECT count(*)::int AS n FROM notification_outbox o
         JOIN leads l ON l.id=o.lead_id WHERE l.idempotency_key=$1`, [key],
      );
      return { leads: l.rows[0].n, outbox: o.rows[0].n };
    });
    expect(counts).toEqual({ leads: 1, outbox: 1 });
    await runWorker();
  });

  test("S5 UI Beauty с мастером и без — resource_id и назначения в PostgreSQL", async ({ page }) => {
    const withMaster = await submitThroughUi(page, "beauty", "haircut", {
      resource: "master-a", timeIndex: 1,
    });
    leadIds.push(withMaster);
    const noMaster = await submitThroughUi(page, "beauty", "haircut", { timeIndex: 1 });
    leadIds.push(noMaster);
    const rows = await db(async (c) => {
      const r = await c.query(
        `SELECT l.id, l.resource_id, o.destination_key FROM leads l
         JOIN notification_outbox o ON o.lead_id=l.id
         WHERE l.id = ANY($1)`,
        [[withMaster, noMaster]],
      );
      return r.rows;
    });
    expect(rows.length).toBe(2);
    expect(rows.every((r: { destination_key: string }) => r.destination_key === "demo-beauty-v1")).toBe(true);
    const byId = new Map(rows.map((r: { id: string; resource_id: string | null }) => [r.id, r.resource_id]));
    expect(byId.get(withMaster)).toBe("master-a");
    expect(byId.get(noMaster)).toBeNull();
    const run = await runWorker();
    expect(run.processed).toBeGreaterThanOrEqual(2);
    const receipts = await db(async (c) => {
      const r = await c.query(
        `SELECT o.status, (SELECT count(*) FROM notification_receipts x WHERE x.outbox_id=o.id)::int AS receipts
         FROM notification_outbox o WHERE o.lead_id = ANY($1)`,
        [[withMaster, noMaster]],
      );
      return r.rows;
    });
    for (const job of receipts) {
      expect(job.status).toBe("sent");
      expect(job.receipts).toBe(1);
    }
  });

  test("S6 отказ recording на уровне тестовой БД: lead жив, outbox в повторе", async () => {
    const key = uuid();
    keys.push(key);
    const created = await apiPost(autoBody(), key, `sys-${key.slice(0, 8)}`);
    expect(created.status).toBe(201);
    try {
      // Изолированный fixture-отказ: временная подмена адаптера у одной задачи.
      await db((c) => c.query(
        `UPDATE notification_outbox SET adapter_id='ghost-channel'
         WHERE lead_id=(SELECT id FROM leads WHERE idempotency_key=$1)`,
        [key],
      ));
      const run = await runWorker();
      expect(run.retried).toBeGreaterThanOrEqual(1);
      const job = await db(async (c) => {
        const r = await c.query(
          `SELECT o.status, o.attempts, o.last_error_code FROM notification_outbox o
           JOIN leads l ON l.id=o.lead_id WHERE l.idempotency_key=$1`, [key],
        );
        return r.rows[0];
      });
      expect(job.status).toBe("pending");
      expect(job.attempts).toBe(1);
      expect(job.last_error_code).toBe("CONFIG_ERROR");
      const lead = await db(async (c) => c.query(
        "SELECT 1 FROM leads WHERE idempotency_key=$1", [key],
      ));
      expect(lead.rowCount).toBe(1);
    } finally {
      await db((c) => c.query(
        `UPDATE notification_outbox SET adapter_id='recording', status='pending',
                next_attempt_at=now(), attempts=0, last_error_code=NULL
         WHERE lead_id=(SELECT id FROM leads WHERE idempotency_key=$1)`,
        [key],
      ));
    }
    const run = await runWorker();
    expect(run.sent).toBeGreaterThanOrEqual(1);
  });

  test("S7 очистка: pool закрыт, тестовые строки удалены", async () => {
    await db((c) => c.query("DELETE FROM leads WHERE idempotency_key = ANY($1)", [keys]));
    await db((c) => c.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]));
    const left = await db(async (c) => {
      const r = await c.query(
        "SELECT count(*)::int AS n FROM leads WHERE idempotency_key = ANY($1)", [keys],
      );
      const byId = await c.query(
        "SELECT count(*)::int AS n FROM leads WHERE id = ANY($1)", [leadIds],
      );
      return r.rows[0].n + byId.rows[0].n;
    });
    expect(left).toBe(0);
  });
});
