# Отчёт разработчика 2 (backend)

## B1 — нормализация телефона (2026-11-04)

- Ветка `codex/backend-pr3`, перед началом выполнено `git fetch origin` и `git merge --ff-only origin/main` (собственных коммитов до этого не было).
- Реализована чистая функция `normalizePhone(input, mode)` в `src/server/leads/phone.ts`:
  принимает формы `+7XXXXXXXXXX` и `8XXXXXXXXXX` с пробелами (включая неразрывные),
  скобками и дефисами, ровно 11 цифр, возвращает `+7XXXXXXXXXX` или `null`;
  управляющие символы и переносы строк отклоняются; синтетический номер проекта,
  зарезервированный контрактом, принимается только в demo и отклоняется в live;
  справочник операторов/регионов не добавлялся.
- TDD: сначала тесты на заглушке (4 падения положительных сценариев), затем реализация.
- Тесты: `tests/backend/phone.test.mjs`, встроенные `node:test` и `node:assert/strict`.
  Команда: `node --experimental-strip-types --test tests/backend/phone.test.mjs`
  Результат: 12 тестов, 12 passed, 0 failed.
- Новых зависимостей нет; `package.json`, lockfile, контракт, env не менялись.
- Не запускались и не заявляются: lint, typecheck, build, интеграционные проверки.
- API, БД и уведомления на этом этапе не создавались.

## B1-fix — Unicode-разделители (2026-11-04, дефект из ревью 0d18022)

- Дефект: `U+2028`/`U+2029`/`U+FEFF` принимались внутри номера из-за общего
  whitespace-класса (`\s`) в регулярке и в обрезке краёв.
- Исправлено по ТЗ `agents/tasks/B1-phone-fix.md`: явный список допустимых
  символов — ASCII-цифры, `U+0020`, `U+00A0`, скобки, дефис; один плюс только
  перед начальной 7; на краях обрезаются ровно `U+0020` и `U+00A0` (без `trim()`
  и `\s`); `U+2028`, `U+2029`, `U+FEFF`, `U+200B`, узкие пробелы и управляющие
  символы отклоняются в любом месте. Сигнатура, нормализация `+7`/`8` и правила
  demo/live не менялись.
- Регрессионные тесты добавлены до исправления. Красный прогон: 15 тестов,
  12 passed, 3 failed (новые падали, прежние 12 проходили).
- Зелёный прогон после исправления: `node --experimental-strip-types --test
  tests/backend/phone.test.mjs` — 15 тестов, 15 passed, 0 failed.
- Изменены только `src/server/leads/phone.ts`, `tests/backend/phone.test.mjs`
  и этот отчёт. Контракты, зависимости, настройки и env не менялись.
- Не запускались и не заявляются: lint, typecheck, build, интеграционные
  проверки. API, БД и уведомления не создавались.

## PR-3 — полный серверный блок Core A (2026-11-05)

### Что реализовано

- `POST /api/leads` (Next App Router, runtime `nodejs`): порядок проверок и коды
  ошибок по §6 — Origin-allowlist (403), content-type (415), поток с лимитом
  16 KiB фактических байтов (413), JSON/UTF-8 (400 INVALID_JSON), UUID
  Idempotency-Key (400 IDEMPOTENCY_REQUIRED), honeypot (422 REQUEST_REJECTED),
  строгая Ajv 2020-схема из `contracts/openapi.json` `components.schemas`
  (422 VALIDATION_FAILED), серверный allowlist сайтов (404), бизнес-правила,
  503 STORAGE_UNAVAILABLE без fake-success. Все ответы — ErrorEnvelope/LeadReceipt
  c `Cache-Control: no-store`; stack/SQL/DSN/телефон не отдаются.
- Чистый сценарий `createLead` (`src/server/leads/create-lead.ts`): без Next/React
  и конкретных адаптеров; часы, конфиг, store — зависимости. Сохранённый повтор
  не зависит от устаревания версии/консента/даты и не расходует лимит.
- Идемпотентность на PostgreSQL: `UNIQUE(site_key,idempotency_key)` +
  `pg_advisory_xact_lock(hash(site,key))` + HMAC-SHA256 канона (секреты ≥32
  символов, отдельные для payload и IP). Повтор → 200 replayed, конфликт → 409.
- Одна транзакция lead+outbox; ошибка outbox откатывает lead (503, неполных пар
  нет). Пул один на процесс: max=5, connectionTimeout 5000, statement_timeout 5000.
- Persistent rate limit: 5 новых заявок /10 мин на site+clientKey, 100/час на
  site; атомарные buckets в той же транзакции, единый порядок блокировок,
  429+Retry-After; повтор не расходывает. IP только из доверенного заголовка
  (`TRUSTED_IP_HEADER`), иначе общий ключ `unknown`; HMAC IP — отдельный секрет.
- Миграции `db/migrations/001_core.sql`, `002_demo_retention_note.sql`;
  мигратор с advisory-lock, каждая миграция транзакционна и однократна,
  идемпотентность проверена двумя прогонами.
- Outbox worker: claim ≤20 через `FOR UPDATE SKIP LOCKED`, lease 120 c, новый
  `claim_token` на каждый claim, attempts при claim, задержки 1/5/15/30/60/120/240
  мин после попыток 1–7, dead после 8-й; финальные UPDATE по `id+claim_token`
  (просроченный worker не затирает новую попытку); истёкший lease возвращается.
- Реестр адаптеров явный: в этом пакете только `recording` (единственный вход
  — синтетический номер контракта; UNIQUE(outbox_id) переживает crash и
  возвращает прежний receipt). Реальных каналов (Telegram/email/CRM/SMS) нет —
  они не выбирались заказчиком; recording не является каналом администратора.
  Назначения версионированы (`SITE_DESTINATIONS_JSON`/`NOTIFICATION_DESTINATIONS_JSON`),
  смена версии влияет только на новые заявки.
- `POST /api/internal/outbox`: Bearer `OUTBOX_SECRET`, неверный/отсутствующий →
  401 без действий; успешный ответ — только processed/sent/retried/dead.
- CLI: `db:migrate`, `outbox:once`, экспорт `scripts/backend/export-leads.ts`
  (`--out` вне checkout, без перезаписи, контакты в stdout не печатаются),
  `scripts/backend/purge-leads.ts` (dry-run по умолчанию, `--execute` +
  утверждённый `--retention-days`, guard loopback+`lsf_test_`).
- Тестовый PostgreSQL: `db/compose.test.yml` — только `127.0.0.1:55543`
  (Windows-диапазон исключённых портов 55342–55441 сделал 55432 недоступным),
  БД `lsf_test_backend`, tmpfs PGDATA, синтетические test-only credentials
  контейнера. Harness (`scripts/backend/test-integration.mjs`) проверяет guard
  DSN, применяет миграции дважды, требует свежую сборку, запускает приложение
  на 3022 (+3024 с недоступной БД для BI09), гоняет интеграцию последовательно
  и завершает только свои дочерние процессы.
- System smoke (`scripts/backend/test-system.mjs` + `tests/system/pr3-real.spec.ts`,
  Playwright, webServer 3023): реальные HTTP/API/PostgreSQL, без подмен.
- CI блока: `.github/workflows/backend-tests.yml` (Node 22, npm ci,
  service postgres:18 с test-only DSN, `npm run verify:backend`), на PR и push
  в ветку. Общий quality workflow не менялся.
- Runbook: `docs/runbooks/backend.md` — env-имена без значений, миграции,
  запуск worker, dead jobs, backup/restore, export/purge, диагностика.

### Команды

```sh
npm ci --prefer-offline --no-audit --no-fund
npm run db:test:up
npm run verify:backend   # check:plan + lint + typecheck + unit + build + integration
npm run test:system      # Playwright smoke поверх той же защищённой тестовой БД
npm run db:test:down
```

### Таблица тестов (ID → файл → результат)

Unit (`npm run test:backend`; часы 2026-11-05T08:00Z = 11:00 Москвы):

| ID | Файл / тест | Результат |
| --- | --- | --- |
| BU01 | `tests/backend/phone.test.mjs` (15 тестов) | passed |
| BU02, BU03 | `tests/backend/schema-units.test.mjs` | passed |
| BU04, BU28 | `tests/backend/ops-units.test.mjs` | passed |
| BU05–BU08, BU11, BU12, BU22, BU23 | `tests/backend/matching-units.test.mjs` | passed |
| BU09, BU10 | `tests/backend/create-lead-units.test.mjs` | passed |
| BU10 (схема: accepted const true) | `tests/backend/create-lead-units.test.mjs` | passed |
| BU13–BU19 | `tests/backend/preference.test.mjs` | passed |
| BU20, BU21 | `tests/backend/canonical-units.test.mjs` | passed |
| BU24–BU27 | `tests/backend/ops-units.test.mjs` | passed |

Integration (`npm run test:integration`, реальный PostgreSQL 18 в Docker):

| ID | Файл / тест | Результат |
| --- | --- | --- |
| BI01, BI08, BI30, BI31, BI32, BI33 | `tests/integration/maintenance.test.mjs` | passed |
| BI02–BI07 | `tests/integration/idempotency.test.mjs` | passed |
| BI09, BI15–BI20 | `tests/integration/leads-http.test.mjs` | passed |
| BI10–BI14 | `tests/integration/limits.test.mjs` | passed |
| BI21–BI29 | `tests/integration/outbox.test.mjs` | passed |

System (`npm run test:system`):

| Сценарий | Результат |
| --- | --- |
| S2 API+SQL точные поля lead/outbox | passed |
| S3 internal worker → recording receipt + sent | passed |
| S4 повтор payload/key без второго lead | passed |
| S5 Beauty с мастером и без (API) | passed |
| S6 отказ recording на уровне тестовой БД → повтор, lead жив | passed |
| S7 pool закрыт, тестовые строки удалены | passed |
| S1 UI-прохождение Auto по testid контракта | **skipped — ждёт объединения с frontend** (UI ещё не публикует testid; бэкенд-часть покрыта S2–S4; сценарий написан и включится после интеграции) |

### Итоговые прогоны (2026-11-05)

| Проверка | Команда | Результат |
| --- | --- | --- |
| Unit | `npm run test:backend` | 48 тестов: 48 passed, 0 failed (включая 15 phone-регрессий) |
| Lint | `npm run lint` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Build | `npm run build` | успешно |
| Integration | `npm run test:integration` | 33 теста: 33 passed, 0 failed |
| Verify целиком | `npm run verify:backend` | exit 0 |
| System | `npm run test:system` | 7 сценариев: 6 passed, 1 skipped (S1 UI) |
| CI своего блока | `backend-tests.yml` на PR #3 | pass — run 42029276605 (Node 22, PostgreSQL 18 service, `npm run verify:backend`); общий quality workflow — pass, run 42029276618 |

### Оставшиеся внешние ограничения

- S1 системного smoke (прохождение UI) выполняется после объединения с frontend
  и появления договорённых `data-testid`.
- Реальные каналы уведомлений не подключались (не выбраны заказчиком);
  demo recording — синтетическое свидетельство, не канал администратора.
- Live-режим требует доверенный ingress (`TRUSTED_IP_HEADER`), утверждённый
  юридический конфиг сайта и `ENABLE_LIVE_LEADS` — вне этого блока.
- Порты тестовой инфраструктуры: 55543 (PostgreSQL), 3022–3024 (приложения),
  59999 (заведомо недоступная БД для 503-сценариев).


---

## PR3-BR — пакет финальных исправлений BR1–BR6 (05.11.2026)

Исходный снимок проверки: `0770274`, замечания — `docs/reports/pr3-final-review.md`,
задание — `agents/tasks/PR3_BACKEND_FINAL_FIXES.md`. `origin/main` включён обычным
merge. Объединённая `codex/pr3-final-review` (frontend) в ветку не сливалась.

### BR1 — последняя попытка очереди (P1)

| Регрессия | Файл/тест | Фактический результат |
| --- | --- | --- |
| BR1a crash на попытке 8 до receipt | `tests/integration/outbox-br.test.mjs` «BR1a/BR1b/BR1c» | dead + `LEASE_EXPIRED`, attempts=8, processing не остаётся |
| BR1b receipt записана до sent | тот же тест | sent, ровно 1 receipt, без повторной отправки (spy sends=0) |
| BR1c два worker на expired claim | тот же тест (`Promise.all` двух `runOutboxBatch`) | один владелец; stale/чужой claim token — no-op |
| BR1d бюджет пачки/lease | «BR1d lease-бюджет» | отправка с потерянным lease не начинается (`SEND_BUDGET`, retry), spy sends=0 |
| BR1e обычный отказ попытки 8 | «BR1e» + «BI36 лестница» | dead без девятой попытки; повторный прогон processed=0 |
| Лестница 20 задач | «BI36» (настоящий PgOutboxRepo) | 8 раундов: retried×7, dead×20, attempts=8, leads целы |

Реализация: `worker.ts` — восстановительный claim истёкших `processing` (любой
attempts) без роста счётчика, `hasReceipt` → sent/dead; конкурентность пачки 4
(BATCH_CONCURRENCY) при бюджете ≤50 с на lease 120 с; перед отправкой — проверка
остатка lease против adapter timeout.

### BR2 — guard эффективного target (P1)

| Регрессия | Тест | Результат |
| --- | --- | --- |
| BR2a несовпадение DATABASE_URL | `readiness.test.mjs` «BR2a» (реальный migrate.ts) | nonzero, до connect/SQL, за <20 с |
| BR2b host в query | «BR2b» + unit `guards-units` | отказ (host/hostaddr/port/dbname/database/dup) |
| BR2c протокол/host/префикс | unit `guards-units` | mysql/http, чужой host, имя без `lsf_test_` — отказ |
| BR2d опции + идемпотентность | «BR2d» (`?sslmode=disable`) | миграции проходят |
| BR2e production mode | `migrate.ts` без test-mode | test-guard не подменяет production-политику (production DSN проверяется только production-политикой runbook) |

### BR3 — экспорт через `..` (P2)

`guards.ts` нормализует реальный путь (realpath существующего родителя) и затем
проверяет границу checkout. Тест «BR3 экспорт» (maintenance): outside/../inside —
отказ без создания файла; вложенный вариант — отказ; junction (при доступности) —
отказ; `../outside.csv` — работает; wx/no-overwrite и отсутствие PII в stdout
сохранены (BI31).

### BR4 — готовность назначения и live (P1)

Гейт в сценарии новой заявки (`checkModeReady` внутри `validateNew` под
транзакцией), загрузка конфигурации остаётся shape-only — сохранённый replay не
ломается. Live закрыт всегда: реальных каналов нет, recording — только demo.

| Сценарий | Тест | Результат |
| --- | --- | --- |
| unknown/ghost adapter | unit `readiness-units` + integration «BR4: ghost-назначение» | 503 DEMO_NOT_READY, счётчики leads/outbox/receipts/rate не изменились |
| отсутствующее назначение | unit | DEMO_NOT_READY |
| корректный demo recording | unit + «BR4: ghost... рабочий путь» (BASE 201) | ok |
| live+recording+все флаги | unit | LIVE_NOT_READY (в т.ч. при ENABLE_LIVE_LEADS=true и approved legal) |
| replay при сломанной конфигурации | integration «BR4: сохранённый replay» | 200 replayed, существующий lead не тронут |
| ghost-приложение поднимается | harness (`:3026`) | сервис зелен, отказ только на новых заявках |

### BR5 — системные UI-проверки (приёмка)

`tests/system/pr3-real.spec.ts` переписан без единого skip: S1 открывает
`/demo/auto` (offer → preference с опциями/датой/временем → contact), сверяет
leadId именно UI-отправки с lead/outbox/receipt; S5 — настоящий Beauty в браузере
с мастером (`resource_id=master-a`) и без (`NULL`), назначения `demo-beauty-v1`,
receipt по одной. Очистка — только свои keys/leadId/строки rate_limits
(identity high-water), без `DELETE ... WHERE true`.
В самостоятельной backend-ветке UI-мастера нет (frontend в
`codex/pr3-final-review`, merge запрещён заданием), поэтому итоговый интегрированный
прогон без skip выполнен в отдельном checkout объединённого снимка; оба SHA — ниже в
этом отчёте. Архитектор ранее подтвердил три реальных browser-пути вручную
(201 → sent/receipt → replay 200); теперь контур автоматизирован.

### BR6 — укрепление проверок

| Пункт | Что изменено | Результат |
| --- | --- | --- |
| BU26 | unit вызывает настоящий `runOutboxBatch` с зависающим adapter fixture | abort на 10 000 мс, retry+1 мин, безопасный `TIMEOUT`, lead не меняется |
| BI13 | реальный effective bucket `auto|clientHmac` того же клиента, переход окна через реальный Clock сервера | 429 в заполненном окне → 201 в новом окне того же ключа |
| BI22 | конкурентный `claimBatch` двух пулов с барьером `Promise.all` | пересечений нет, union покрывает задачи, по одному claim token на батч |
| BI32 | source/restore по проверенному target `TEST_DATABASE_URL`; контейнер ищется по маппингу порта DSN; restore-БД уникальна (`lsf_test_r_*`), существование проверяется, удаляется только своя | dump/restore/сверка связей/уборка — pass |

### Команды и числа

- `npm run test:backend`: 57/57 (сохранены все 15 phone-тестов, прежние 48 unit + 9 новых BR-unit).
- `npm run test:integration`: 46/46 (было 33, добавлены outbox-br 6 и readiness 7 сценариев; нумерация BI продолжается, новые ID: BR2a/b/d, BR3, BR4-HTTP×3, BI36, BR1a–e, барьер).
- `npm run verify:backend`: exit 0 (unit 57, build ok, integration 46).
- Общий `test:system` без skip: отдельный checkout, SHA ниже.
- CI своего блока на финальном SHA: запуски ниже.

### Изменённый runbook (сводно)

- `LSF_MIGRATE_TEST_MODE=1` + `TEST_DATABASE_URL`: обязателен, проверяется эффективный target; при несовпадении с `DATABASE_URL` — отказ до SQL.
- Экспорт: путь нормализуется и обязан быть снаружи checkout; запись через `..`/junction внутрь — отказ CLI с nonzero.
- Очередь: зависшая `processing` получает исход автоматически (receipt→sent / dead `LEASE_EXPIRED`). Операторское действие для `dead`: разбор `last_error_code`, после починки канала — `UPDATE notification_outbox SET status='pending', attempts=0, next_attempt_at=now()` по id.
- Готовность: `DEMO_NOT_READY` = назначение/демо-адаптер не собраны; живые каналы не включались, `ENABLE_LIVE_LEADS=true` live не открывает.
