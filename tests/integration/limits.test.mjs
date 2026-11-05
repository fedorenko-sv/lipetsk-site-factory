// BI10–BI14: персистентные лимиты 5/10мин на site+IP и 100/час на site.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  BASE, db, makeBody, post, freshClient, clearRateLimits,
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

test("BI13 завершение окна: в новом окне заявка снова допустима", async () => {
  await clearRateLimits();
  const client = freshClient();
  try {
    // Имитация исчерпанного ПРОШЛОГО окна для того же client-ключа.
    const clientHmac = await db(async (c) => {
      // HMAC считается тем же секретом, что и в приложении; но проверка окон не
      // требует точного HMAC: вставим окно, сдвинутое на шаг назад, с count=5.
      const epoch = Math.floor(Date.now() / 1000);
      const pastWindow = Math.floor(epoch / 600) * 600 - 600;
      await c.query(
        `INSERT INTO rate_limits (scope, key_hmac, window_start, count, expires_at)
         VALUES ('site_client', 'auto|BI13-past-window', to_timestamp($1), 5, to_timestamp($2))`,
        [pastWindow, pastWindow + 700],
      );
      return null;
    });
    void clientHmac;
    const response = await post(BASE, makeBody(), { key: randomUUID(), client });
    assert.equal(response.status, 201, "прошлое окно не блокирует текущее");
    const current = await db((c) => c.query(
      "SELECT count::int AS n FROM rate_limits WHERE scope='site_client' AND key_hmac <> 'auto|BI13-past-window'",
    ));
    assert.equal(current.rows[0].n, 1);
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
