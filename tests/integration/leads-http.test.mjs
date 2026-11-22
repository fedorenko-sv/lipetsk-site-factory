// BI09, BI15–BI20: HTTP-граница,storage-отказ, изоляция siteKey.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { BASE, DOWN_BASE, db, makeBody, post, freshClient } from "./helpers.mjs";

test("BI09 БД недоступна: 503 STORAGE_UNAVAILABLE, no-store, без fake-success", async () => {
  const response = await post(DOWN_BASE, makeBody(), {});
  assert.equal(response.status, 503);
  assert.equal(response.json.error.code, "STORAGE_UNAVAILABLE");
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.ok(!JSON.stringify(response.json).includes("postgresql"));
});

test("BI15 Origin отсутствует/чужой: 403 и ноль lead", async () => {
  const keyA = randomUUID();
  const keyB = randomUUID();
  const noOrigin = await post(BASE, makeBody(), { key: keyA, origin: null });
  assert.equal(noOrigin.status, 403);
  assert.equal(noOrigin.json.error.code, "ORIGIN_NOT_ALLOWED");
  const evil = await post(BASE, makeBody(), { key: keyB, origin: "https://evil.example" });
  assert.equal(evil.status, 403);
  const count = await db((c) => c.query(
    "SELECT count(*)::int AS n FROM leads WHERE idempotency_key IN ($1,$2)",
    [keyA, keyB],
  ));
  assert.equal(count.rows[0].n, 0);
});

test("BI16 сломанный JSON; ключ отсутствует/не UUID", async () => {
  const broken = await post(BASE, "{\"siteKey\": ", {});
  assert.equal(broken.status, 400);
  assert.equal(broken.json.error.code, "INVALID_JSON");

  const noKey = await post(BASE, makeBody(), { key: null });
  assert.equal(noKey.status, 400);
  assert.equal(noKey.json.error.code, "IDEMPOTENCY_REQUIRED");

  const badKey = await post(BASE, makeBody(), { key: "not-a-uuid" });
  assert.equal(badKey.status, 400);
  assert.equal(badKey.json.error.code, "IDEMPOTENCY_REQUIRED");
});

test("BI17 другой media type; фактические 16KiB+; ложный Content-Length", async () => {
  const wrongType = await post(BASE, makeBody(), { contentType: "text/plain; charset=utf-8" });
  assert.equal(wrongType.status, 415);
  assert.equal(wrongType.json.error.code, "UNSUPPORTED_MEDIA_TYPE");

  const big = makeBody();
  big.customer.name = "x".repeat(17 * 1024);
  const tooLarge = await post(BASE, big, {});
  assert.equal(tooLarge.status, 413);
  assert.equal(tooLarge.json.error.code, "PAYLOAD_TOO_LARGE");

  // Chunked transfer: Content-Length отсутствует — лимит по фактическим байтам.
  const status = await new Promise((resolve, reject) => {
    const request = http.request(
      `${BASE}/api/leads`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: BASE,
          "Idempotency-Key": randomUUID(),
          "X-Test-Client": freshClient(),
        },
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => { body += chunk; });
        response.on("end", () => {
          try {
            assert.equal(response.statusCode, 413);
            assert.equal(JSON.parse(body).error.code, "PAYLOAD_TOO_LARGE");
            resolve(true);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.on("error", reject);
    request.write(JSON.stringify(makeBody()).slice(0, 100));
    request.write("x".repeat(20 * 1024));
    request.end();
  });
  assert.equal(status, true);
});

test("BI18 серверная схема и бизнес-проверки без записей", async () => {
  const keys = [];
  const check = async (mutate, status, code, field) => {
    const key = randomUUID();
    keys.push(key);
    const body = mutate(makeBody());
    const response = await post(BASE, body, { key, client: freshClient() });
    assert.equal(response.status, status, `${code}: ${JSON.stringify(response.json)}`);
    assert.equal(response.json.error.code, code);
    if (field) {
      assert.ok(response.json.error.fieldErrors?.[field], `fieldErrors.${field} expected`);
    }
  };
  await check((b) => ({ ...b, price: 100 }), 422, "VALIDATION_FAILED", "price");
  await check((b) => ({ ...b, status: "new" }), 422, "VALIDATION_FAILED", "status");
  await check((b) => ({ ...b, consentAt: "2026-11-04T00:00:00Z" }), 422, "VALIDATION_FAILED", "consentAt");
  await check((b => [b]), 422, "VALIDATION_FAILED", null);
  await check((b) => ({ ...b, serviceId: "no-such" }), 422, "VALIDATION_FAILED", "serviceId");
  await check((b) => ({ ...b, serviceOptions: {} }), 422, "VALIDATION_FAILED", "serviceOptions.wheel-size");
  await check((b) => ({ ...b, serviceOptions: { "wheel-size": "R99" } }), 422, "VALIDATION_FAILED", "serviceOptions.wheel-size");
  await check((b) => ({ ...b, configVersion: "old-version" }), 409, "CONFIG_CHANGED", null);
  await check((b) => ({ ...b, consent: { accepted: true, version: "old" } }), 409, "CONSENT_CHANGED", null);
  await check((b) => ({ ...b, customer: { ...b.customer, name: "   " } }), 422, "VALIDATION_FAILED", "customer.name");
  await check((b) => ({ ...b, customer: { ...b.customer, phone: "8-123" } }), 422, "VALIDATION_FAILED", "customer.phone");
  await check((b) => { delete b.antiBot; return b; }, 422, "VALIDATION_FAILED", "antiBot");
  // honeypot: заполненное поле — тот же 422, но REQUEST_REJECTED без дальнейшей валидации
  {
    const key = randomUUID();
    keys.push(key);
    const body = makeBody();
    body.antiBot.website = "spam.example";
    const response = await post(BASE, body, { key });
    assert.equal(response.status, 422);
    assert.equal(response.json.error.code, "REQUEST_REJECTED");
  }
  const count = await db((c) => c.query(
    "SELECT count(*)::int AS n FROM leads WHERE idempotency_key = ANY($1)",
    [keys],
  ));
  assert.equal(count.rows[0].n, 0);
});

test("BI19 Auto и Beauty: разные назначения, общий механизм", async () => {
  const autoKey = randomUUID();
  const beautyKey = randomUUID();
  const auto = await post(BASE, makeBody(), { key: autoKey, client: freshClient() });
  assert.equal(auto.status, 201);
  const beauty = await post(BASE, makeBody({
    siteKey: "beauty", serviceId: "haircut", options: {}, resourceId: "master-a",
  }), { key: beautyKey, client: freshClient() });
  assert.equal(beauty.status, 201);
  const rows = await db((c) => c.query(
    `SELECT l.site_key, o.destination_key, o.adapter_id
     FROM leads l JOIN notification_outbox o ON o.lead_id = l.id
     WHERE l.idempotency_key = ANY($1)`,
    [[autoKey, beautyKey]],
  ));
  const bySite = Object.fromEntries(rows.rows.map((r) => [r.site_key, r]));
  assert.equal(bySite.auto.destination_key, "demo-auto-v1");
  assert.equal(bySite.beauty.destination_key, "demo-beauty-v1");
  assert.equal(bySite.auto.adapter_id, "recording");
  assert.equal(bySite.beauty.adapter_id, "recording");
  const res = await db((c) => c.query(
    "SELECT resource_id FROM leads WHERE idempotency_key=$1", [beautyKey],
  ));
  assert.equal(res.rows[0].resource_id, "master-a");
});

test("BI20 чужой siteKey и чужие поля: 404/422, изоляция", async () => {
  const unknownSite = await post(BASE, makeBody({ siteKey: "secret-shop" }), { key: randomUUID() });
  assert.equal(unknownSite.status, 404);
  assert.equal(unknownSite.json.error.code, "SITE_NOT_FOUND");

  const badResource = await post(BASE, makeBody({
    siteKey: "beauty", serviceId: "manicure", options: {}, resourceId: "master-a",
  }), { key: randomUUID() });
  assert.equal(badResource.status, 422);
  assert.equal(badResource.json.error.code, "VALIDATION_FAILED");
  assert.ok(badResource.json.error.fieldErrors?.resourceId);

  const withDestination = makeBody();
  withDestination.destinationKey = "demo-beauty-v1";
  const injected = await post(BASE, withDestination, { key: randomUUID() });
  assert.equal(injected.status, 422);
  assert.equal(injected.json.error.code, "VALIDATION_FAILED");
});
