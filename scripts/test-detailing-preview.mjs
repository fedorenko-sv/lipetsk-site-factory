import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { Client } from "pg";
import { writeFile, mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { assertSafeTestDatabaseUrl } from "../src/server/config/guards.ts";
const dsn = assertSafeTestDatabaseUrl(
  "postgresql://lsf_test:lsf_test_only@127.0.0.1:55543/lsf_test_detailing_preview",
);
await mkdir("work/detailing/screenshots", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const client = new Client({ connectionString: dsn });
await client.connect();
try {
  await page.goto("http://127.0.0.1:3032/demo/detailing");
  await page.getByRole("button", { name: "Выбрать зону: Диски", exact: true }).click();
  await page.getByRole("button", { name: "Выбрать время" }).click();
  assert.equal(await page.getByLabel("Выбранная услуга").inputValue(), "wheel-care");
  const date = new Date(Date.now() + 2 * 86400000);
  while (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  await page.getByTestId("preferred-date").fill(date.toISOString().slice(0, 10));
  await page.getByTestId("preferred-time").selectOption("11:00");
  await page.getByTestId("next-to-contact").click();
  await page.getByTestId("customer-phone").fill("+7" + "0".repeat(10));
  await page.getByTestId("consent").check();
  const responsePromise = page.waitForResponse(
    (res) => res.url().endsWith("/api/leads") && res.request().method() === "POST",
  );
  await page.getByTestId("lead-submit").click();
  const response = await responsePromise;
  assert.equal(response.status(), 201, `HTTP status ${response.status()}`);
  const receipt = await response.json();
  await page.getByTestId("lead-id").waitFor();
  assert.equal(await page.getByTestId("lead-id").textContent(), receipt.leadId);
  let row;
  for (let i = 0; i < 40; i++) {
    row = (
      await client.query(
        `SELECT l.id,l.site_key,l.service_id,o.status AS outbox_status,
   (SELECT count(*)::int FROM notification_receipts r WHERE r.lead_id=l.id) AS receipt_count
   FROM leads l JOIN notification_outbox o ON o.lead_id=l.id WHERE l.id=$1`,
        [receipt.leadId],
      )
    ).rows[0];
    if (row?.outbox_status === "sent") break;
    await delay(500);
  }
  assert.equal(row.site_key, "detailing");
  assert.equal(row.service_id, "wheel-care");
  assert.equal(row.outbox_status, "sent");
  assert.equal(row.receipt_count, 1);
  await page
    .getByTestId("lead-success")
    .screenshot({ path: "work/detailing/screenshots/real-receipt.png" });
  await writeFile(
    "work/detailing/real-flow-result.json",
    JSON.stringify(
      { http: response.status(), ...row, uiIdMatches: true, transportMocked: false },
      null,
      2,
    ),
  );
  console.log(
    "Real browser → HTTP 201 → PostgreSQL lead + outbox sent + one recording receipt: PASS",
  );
} finally {
  await client.end();
  await browser.close();
}
