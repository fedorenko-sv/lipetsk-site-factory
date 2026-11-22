// BI10–BI14: персистентные лимиты 5/10мин на site+IP и 100/час на site.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  BASE, RATE_KEY, db, makeBody, post, freshClient, clearRateLimits,
  spawnSecondApp, killTree, waitForHttp,
} from "./helpers.mjs";

test("BI10 пять новых ключей и шестой для client: 429 + Retry-After", async () => {
  await clearRateLimits();
  const client = freshClient();
  try {
    for (let i = 0; i < 5; i += 1) {
      const response = await post(BASE, makeBody(), { key: randomUUID(), client });
      assert.equal(response.status, 201, `заявка ${i + 1}`);
    }
    const sixth = await post(BASE, makeBody(), { key: randomUUID(), client });
    assert.equal(sixth.status, 429);
    assert.equal(sixth.json.error.code, "RATE_LIMITED");
    const retryAfter = Number(sixth.headers.get("retry-after"));
    assert.ok(Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 600);
  } finally {
    await clearRateLimits();
  }
});

test("BI11 повтор в исчерпанном bucket: 200 и счётчик не растёт", async () => {
  await clearRateLimits();
  const client = freshClient();
  try {
    let repeated = null;
    for (let i = 0; i < 5; i += 1) {
      const key = randomUUID();
      const body = makeBody();
      const response = await post(BASE, body, { key, client });
      assert.equal(response.status, 201);
      if (i === 2) repeated = { key, body };
    }
    const replay = await post(BASE, repeated.body, { key: repeated.key, client });
    assert.equal(replay.status, 200);
    assert.equal(replay.json.replayed, true);
    const bucket = await db((c) => c.query(
      "SELECT sum(count)::int AS total FROM rate_limits WHERE scope='site_client'",
    ));
    assert.equal(bucket.rows[0].total, 5, "сохранённый повтор не расходует лимит");
    const rejected = await post(BASE, makeBody({ name: "Проверка лимита" }), { key: randomUUID(), client });
    assert.equal(rejected.status, 429, "новая payload в исчерпанном окне отклонена");
  } finally {
    await clearRateLimits();
  }
});

test("BI12 лимит site на разных clientKey: 100 допусков, 101-й 429", async () => {
  await clearRateLimits();
  try {
    let okCount = 0;
    const queue = Array.from({ length: 100 }, () => ({ key: randomUUID(), client: freshClient() }));
    const workers = Array.from({ length: 8 }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        const response = await post(BASE, makeBody(), item);
        if (response.status === 201) okCount += 1;
        else if (response.status === 429) return; // досрочно: лимит уже наступил
        else throw new Error(`неожиданный статус ${response.status}`);
      }
    });
    await Promise.all(workers);
    assert.equal(okCount, 100);
    const extra = await post(BASE, makeBody(), { key: randomUUID(), client: freshClient() });
    assert.equal(extra.status, 429);
    assert.equal(extra.json.error.code, "RATE_LIMITED");
    const siteBucket = await db((c) => c.query(
      "SELECT max(count)::int AS m FROM rate_limits WHERE scope='site'",
    ));
    assert.equal(siteBucket.rows[0].m, 100);
  } finally {
    await clearRateLimits();
  }
});

test("BI13 переход окна: тот же effective bucket/клиент, реальный Clock сервера", async () => {
  await clearRateLimits();
  const client = freshClient();
  assert.ok(RATE_KEY, "harness обязан передать TEST_RATE_LIMIT_HMAC_KEY");
  // Тот же ключ, что вычисляет leads-handler:
  // sha256( HMAC-SHA256(rateKey, rawClient) ).
  const clientHmac = createHash("sha256")
    .update(createHmac("sha256", RATE_KEY).update(client).digest("hex"))
    .digest("hex");
  const bucketKey = `auto|${clientHmac}`;
  const window = Math.floor(Date.now() / 1000 / 600) * 600;
  try {
    // Текущее окно того же effective bucket закрыто (5 из 5).
    await db((c) => c.query(
      `INSERT INTO rate_limits (scope, key_hmac, window_start, count, expires_at)
       VALUES ('site_client', $1, to_timestamp($2), 5, to_timestamp($3))`,
      [bucketKey, window, window + 600 + 86_400],
    ));
    const blocked = await post(BASE, makeBody(), { key: randomUUID(), client });
    assert.equal(blocked.status, 429, "заполненное текущее окно блокирует того же клиента");
    // Сдвиг того же bucket в прошлое окно: серверные часы видят новое окно.
    await db((c) => c.query(
      `UPDATE rate_limits SET window_start = to_timestamp($2),
              expires_at = to_timestamp($3)
       WHERE scope='site_client' AND key_hmac=$1`,
      [bucketKey, window - 600, window - 600 + 600 + 86_400],
    ));
    const allowed = await post(BASE, makeBody(), { key: randomUUID(), client });
    assert.equal(allowed.status, 201, "переход окна для того же effective bucket открывает приём");
    const fresh = await db((c) => c.query(
      `SELECT count::int AS n FROM rate_limits
       WHERE scope='site_client' AND key_hmac=$1
         AND window_start = to_timestamp($2)`,
      [bucketKey, window],
    ));
    assert.equal(fresh.rowCount, 1, "создано новое окно для того же ключа");
    assert.equal(fresh.rows[0].n, 1);
  } finally {
    await clearRateLimits();
  }
});

test("BI14 два процесса/pool делят один лимит (не Map в памяти)", async () => {
  await clearRateLimits();
  const client = freshClient();
  let second = null;
  try {
    const a1 = await post(BASE, makeBody(), { key: randomUUID(), client });
    const a2 = await post(BASE, makeBody(), { key: randomUUID(), client });
    assert.equal(a1.status, 201);
    assert.equal(a2.status, 201);
    second = spawnSecondApp(3025);
    assert.ok(await waitForHttp("http://127.0.0.1:3025/", 90_000), "второй экземпляр не поднялся");
    const b1 = await post("http://127.0.0.1:3025", makeBody(), { key: randomUUID(), client });
    assert.equal(b1.status, 201);
    const a3 = await post(BASE, makeBody(), { key: randomUUID(), client });
    const a4 = await post(BASE, makeBody(), { key: randomUUID(), client });
    assert.equal(a3.status, 201);
    assert.equal(a4.status, 201);
    const over = await post("http://127.0.0.1:3025", makeBody(), { key: randomUUID(), client });
    assert.equal(over.status, 429, "второй процесс увидел лимит первого через БД");
  } finally {
    if (second) killTree(second);
    await clearRateLimits();
  }
});
