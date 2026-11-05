# PR-3 — полный серверный блок для Hermes

> Исполнитель: Hermes, разработчик 2. Режим: самостоятельное выполнение всего документа, без субагентов и промежуточного согласования микрозадач. Архитектор проверяет итоговую ветку.

**Цель:** закончить сервер Core A: валидная заявка → PostgreSQL → атомарный outbox → надёжный worker → проверяемое demo-получение. Предоставить исполняемые unit/integration/system тесты и инструкции запуска.

**Архитектура:** модульный монолит Next.js; тонкий HTTP-адаптер, чистый сценарий CreateLead, порты БД/уведомлений/часов. PostgreSQL обеспечивает транзакцию и конкурентную идемпотентность. Получатель выбирается только сервером.

**Стек:** Node.js 22, TypeScript, Next.js App Router, pg, Ajv 2020 + ajv-formats, node:test, Playwright для итогового системного smoke.

**Пакет:** PR3-BATCH-2, 05.11.2026. Ветка codex/backend-pr3. Текущая исходная реализация телефона — bf5823ebaef922f63cd087b7ff33c79932154161; считать её частью блока, сохранить все 15 тестов. Название модели/провайдера не исследовать.

## 1. Что считать готовым

- Реальный POST /api/leads с ответами по OpenAPI и серверными проверками.
- Сохранение в настоящем PostgreSQL, единственный lead/outbox при повторах и гонках.
- Общий механизм доставки по версионированному назначению клиента; recording-адаптер с долговременным свидетельством.
- Worker с lease, claim token, повторами, dead-состоянием и безопасным повторным запуском.
- Защищённый internal route, CLI миграций/worker/экспорта/удаления, runbook.
- Самостоятельно пройденные тесты и CI своего блока.
- Исполняемый system smoke для финальной интеграции с интерфейсом.

Не входят: собственная CRM, платежи, реальные свободные слоты, SMS, массовые рассылки, облачная инфраструктура и публикация. Telegram/email/CRM не реализовывать без выбора конкретного канала заказчиком. Demo recording не выдавать за реальный канал администратора.

## 2. Прочитать один раз

1. AGENTS.md.
2. docs/09-batch-contract.md.
3. contracts/openapi.json и contracts/site-config.schema.json.
4. src/shared/contracts.ts, examples/sites/auto.json и beauty.json.

Этот документ заменяет для текущей работы старые указания «сдать B1 и остановиться». Работать до готовности всего блока. Исторические отчёты не являются новыми заданиями.

## 3. Подготовка и Git

- [ ] Открыть backend checkout, проверить ветку/status, сохранить все чужие изменения.
- [ ] git fetch origin; на чистом дереве git merge origin/main. Не использовать ff-only там, где уже есть свои коммиты и ветки разошлись.
- [ ] npm ci --prefer-offline --no-audit --no-fund.
- [ ] Проверить наличие общего контракта и текущих 15 phone-тестов.
- [ ] Реализовывать логическими коммитами, push своей ветки; main не менять.
- [ ] В конце открыть один Draft PR в main с итоговым отчётом и тестовыми свидетельствами.

Сбой инфраструктуры не повод переписывать проект. Исправлять локальные ошибки самостоятельно. При отсутствующем PostgreSQL закончить весь независимый код и unit-тесты, затем одним отчётом указать конкретный внешний блокер; не объявлять integration пройденными.

Выполнять изменения и команды самостоятельно в рабочей папке. Ответ с инструкциями владельцу «вставьте этот код в терминал» не считается сдачей выполненного блока.

## 4. Владение файлами

| Путь | Ответственность |
| --- | --- |
| src/app/api/leads/route.ts | HTTP вход/выход, Node runtime |
| src/app/api/internal/outbox/route.ts | Защищённый запуск пачки |
| src/server/leads/** | Сценарий, ошибки, нормализация, порты |
| src/server/config/** | Приватный allowlist/режим/назначения |
| src/server/db/** | Пул, репозитории, транзакции, лимиты |
| src/server/notifications/** | Реестр, worker, recording |
| db/migrations/** | SQL и история миграций |
| db/compose.test.yml | Только локальный тестовый PostgreSQL |
| scripts/backend/** | Миграции, integration harness, worker, export/purge |
| tests/backend/** | Unit-тесты |
| tests/integration/** | Реальный PostgreSQL и HTTP |
| tests/system/** | Общий интеграционный smoke по зафиксированным testid |
| .github/workflows/backend-tests.yml | CI этого блока |
| .env.example | Только имена/описания нужных env без секретов |
| docs/reports/backend.md | Итог и таблица тестов |
| docs/runbooks/backend.md | Эксплуатация и диагностика |

Не менять frontend, общие типы/схемы, package.json/lockfile, tsconfig и Playwright-конфиги. Все необходимые библиотеки и команды уже заданы. Использовать штатные возможности Node и согласованные зависимости.

## 5. Архитектурные интерфейсы

Публичные типы импортировать из src/shared/contracts.ts. Внутренние порты держать в src/server/leads/ports.ts; названия внутренних методов можно уточнять, сохранив ответственность.

~~~ts
export interface Clock {
  now(): Date;
}

export interface RequestContext {
  requestId: string;
  idempotencyKey: string;
  clientKey: string;
}

export interface NotificationJob {
  id: string;
  leadId: string;
  siteKey: string;
  destinationKey: string;
  adapterId: string;
  claimToken: string;
}

export interface NotificationResult {
  receiptId: string;
}

export interface NotificationPort {
  send(job: NotificationJob, signal: AbortSignal): Promise<NotificationResult>;
}
~~~

CreateLead не импортирует NextResponse, React или конкретный adapter. Часы, настройки сайта, генератор ID и репозиторий передаются зависимостями. HTTP-тесты проверяют настоящий route, unit-тесты — чистые правила.

Нормализованные данные и raw body — разные внутренние типы. Не использовать any для обхода непроверенного ввода. Не импортировать серверную конфигурацию в клиентские компоненты.

## 6. HTTP-порядок и ошибки

1. Создать requestId. Проверить Origin по явному серверному allowlist; неверный/отсутствующий Origin → 403.
2. Принять application/json с необязательным charset; другой формат → 415.
3. Читать stream с пределом 16 KiB фактических байтов. Content-Length недостаточно; превышение → 413, чтение прекратить.
4. Некорректный UTF-8/JSON → 400 INVALID_JSON.
5. Idempotency-Key отсутствует/не UUID → 400 IDEMPOTENCY_REQUIRED.
6. Безопасно распознать непустой строковый antiBot.website → 422 REQUEST_REJECTED.
7. Полная строгая схема: неверные типы/неизвестные поля → 422 VALIDATION_FAILED.
8. Проверить разрешённый siteKey/привязку deployment → 404.
9. Нормализовать канонические поля и разрешить сохранённый повтор.
10. Для новой заявки проверить текущие услуги/версию/согласие/время/режим/назначение, затем лимит.
11. В одной транзакции сохранить lead и outbox. Только после COMMIT — 201.
12. Ошибки БД/таймаута хранения → 503 STORAGE_UNAVAILABLE. Неожиданная ошибка → безопасный 500.

Каждый ответ соответствует ErrorEnvelope/LeadReceipt, имеет no-store. Не отдавать stack, SQL, raw provider response, телефон или DSN. Не маскировать отказ под 200/201.

## 7. Runtime-валидация и бизнес-правила

- Компилировать строгие JSON-схемы Ajv 2020 один раз на процесс, подключить ajv-formats. Для схем OpenAPI использовать только components.schemas, преобразовав локальные refs в поддерживаемую структуру; не трактовать весь OpenAPI как JSON Schema.
- После успешной схемы проверить связи с серверным конфигом: service активна; опции известны; все required опции заданы; значения входят в values; ресурс совместим.
- Смена клиентского siteKey не меняет приватный набор доступных сайтов. Нельзя выбрать произвольный адрес уведомления.
- Телефон через существующую normalizePhone; не ослаблять Unicode-регрессии.
- Имя trim, 1–80 символов при наличии. Строка из пробелов → ошибка customer.name.
- Цена/название/длительность берутся из конфигурации и сохраняются snapshot, клиентскую цену схема не принимает.
- configVersion не совпал → 409 CONFIG_CHANGED. При актуальном config и старом consent → 409 CONSENT_CHANGED.
- Время согласия/создания и состояние new назначаются сервером.
- Attribution выключена по умолчанию, иначе три разрешённых поля длиной до 80; не добавлять PII в аналитику.
- Если demo storage/recording не настроены → 503 DEMO_NOT_READY; live без утверждённых входов → 503 LIVE_NOT_READY.
- Никаких fake-success, fallback в память и локального файла вместо PostgreSQL.

## 8. Дата и время

Вынести чистую функцию проверки предпочтения с Clock. Использовать ISO-дату и HH:mm, фиксированный Europe/Moscow. Сервер хранит timestamptz соответствующего пожелания.

Обязательно проверить:
- Реальность календарной даты, в том числе високосный год.
- Дата/время строго позже now; сравнение по московскому смыслу, не локальному TZ процесса.
- Дата не дальше today Moscow + horizonDays включительно.
- ISO-день недели включён в workingHours.days.
- opens <= начало < closes; шаг относительно opens равен timeStepMinutes.
- Отсутствие preferred допустимо только при preferenceRequired=false.
- Длительность не создаёт бронь и не запрещает пересечения.

Unit-clock: 2026-11-05T08:00:00.000Z, то есть 11:00 Москвы. HTTP-тесты выбирают реальную будущую рабочую дату, не редактируя общие example-файлы.

## 9. Канонизация и конкурентная идемпотентность

Канонический payload включает siteKey/configVersion/kind/serviceId, отсортированные serviceOptions, resourceId либо null, нормализованное preferred, phone, trimmed name либо null, consentVersion и разрешённую attribution. Не включает requestId, antiBot, текущие server timestamps и клиентские служебные поля.

- HMAC-SHA256, отдельный серверный секрет минимум 32 символа. Не хранить открытый digest телефона и не логировать payload.
- UNIQUE(site_key,idempotency_key) обязателен.
- Идентичный канонический повтор → 200 с прежним leadId/replayed=true.
- Тот же ключ с иным payload → 409, исходная строка не меняется.
- Сохранённый идентичный повтор проходит даже после устаревания текущей даты/config/consent.
- Конкурентные одинаковые запросы дают одну пару lead/outbox и один расход лимита.
- Допустим pg_advisory_xact_lock на стабильном hash(siteKey,key) с последующим повторным чтением внутри транзакции. Коллизия hash может только сериализовать лишние запросы, не заменить UNIQUE.
- Не удерживать транзакцию во время внешней доставки. Нельзя реализовать защиту только SELECT перед INSERT.

Порядок внутри короткой транзакции: сериализация ключа → чтение повтора → текущие проверки новой заявки → атомарные rate buckets → insert lead/outbox → COMMIT.

## 10. PostgreSQL и миграции

PostgreSQL 18; локальный тестовый образ postgres:18. Таблицы:

| Таблица | Обязательные данные/ограничения |
| --- | --- |
| leads | UUID PK, site_key, config_version, kind=booking, service_id, resource_id nullable, service_options jsonb, preferred_at timestamptz nullable, timezone, customer_phone text, customer_name nullable, consent_version, consent_at, status=new, price_snapshot jsonb, attribution jsonb, idempotency_key UUID, payload_hmac, created_at; UNIQUE(site_key,idempotency_key) |
| notification_outbox | UUID PK, lead_id FK CASCADE и UNIQUE, site_key, adapter_id, destination_key, status pending/processing/sent/dead, attempts, next_attempt_at, lease_until, claim_token nullable, last_error_code nullable, created_at/updated_at |
| notification_receipts | UUID PK, outbox_id FK CASCADE и UNIQUE, lead_id FK CASCADE, site_key, destination_key, adapter_id, payload jsonb, created_at; demo-свидетельство recording |
| rate_limits | scope/key_hmac/window_start составной UNIQUE, count, expires_at; исходный IP не хранится |
| schema_migrations | version PK, applied_at |

Статусы и счётчики защищены CHECK; FK индексированы; индекс leads(site_key,created_at DESC), индекс готовой очереди по status/next_attempt_at. Деньги — целые копейки в snapshot, не float.

Мигратор с блокировкой от двух одновременных запусков; каждая миграция транзакционна и выполняется один раз. Runtime-роль без DDL, отдельная миграционная роль/инструкция создания. Запросы параметризованы.

Пул один на процесс, max=5, connectionTimeoutMillis=5000, statement_timeout=5000. Корректное освобождение client при ошибке. Не создавать pool на каждый POST.

Импорт route и production build не требуют доступной БД/секретов. Проверка серверного окружения и подключение выполняются при вызове сценария; незаданный runtime-конфиг даёт документированный 503, а не падение сборки.

## 11. Persistent rate limit и адрес клиента

5 новых валидных заявок / 10 минут на site+IP; 100 / час на site. Сохранённый повтор не расходует лимит. Обе проверки атомарны; единый порядок блокировок предотвращает deadlock. Возврат 429 с Retry-After до конца блокирующего окна.

IP поступает через отдельный resolver. Произвольный X-Forwarded-For не доверять. При не настроенном доверенном ingress использовать общий ключ unknown, а не контролируемый клиентом заголовок. Live-режим требует документированной настройки доверенного proxy; приложение само не доказывает доверенность заголовка.

Тесты передают clientKey непосредственно в application либо используют отдельно настроенный тестовый ingress. Секрет HMAC IP отдельный от payload HMAC. Очистка buckets — не позднее 24 часов.

## 12. Worker и адаптеры

- Серверный SitePolicy выбирает неизменяемый destinationKey и adapterId. Для Auto и Beauty в demo разные версии назначения.
- Явный registry. Неизвестный adapter/destination — конфигурационная ошибка; не переключать канал автоматически.
- Claim до 20 задач: транзакция с FOR UPDATE SKIP LOCKED; processing, новый claim_token, lease 120 секунд; attempts увеличивается при claim.
- Во время send SQL-транзакция claim уже завершена.
- Timeout адаптера 10 секунд через AbortSignal.
- После попыток 1–7 задержки 1/5/15/30/60/120/240 минут; после неудачи 8 — dead. Retry-After провайдера, если появится реальный адаптер, учитывать как нижнюю границу.
- Update результата проверяет id + claim_token; просроченный worker не меняет новую попытку.
- Истёкший lease возвращает задание к обработке.
- Recording сохраняет notification_receipts. UNIQUE(outbox_id) позволяет повторно вернуть прежний receipt после crash; затем outbox становится sent.
- Не хранить второй бесконтрольный контакт в outbox. Recording payload допустим только с синтетикой и удаляется каскадом по retention.
- Результат send и ошибка — типизированные безопасные коды, без сырого тела провайдера в last_error.
- Реальные каналы обычно at-least-once: факт дедупликации recording не обещает exactly-once Telegram/email/CRM.
- Обработчик запускается CLI/internal route/планировщиком; фоновой очереди в памяти Next нет.
- В пакете обязательны recording и registry; настоящие интеграции по заказчику остаются отдельным подключением.

Internal route: POST /api/internal/outbox, Bearer OUTBOX_SECRET, no-store. Неверный/отсутствующий секрет → 401 без действий. Ответ 200 содержит только processed/sent/retried/dead counts; контактов нет. Размер пачки ограничен сервером, параметры не задают SQL/получателя.

## 13. CLI и запуск

Реализовать уже объявленные package scripts:

- db:migrate → scripts/backend/migrate.ts.
- outbox:once → scripts/backend/outbox-once.ts.
- test:integration → scripts/backend/test-integration.mjs.
- test:system → scripts/backend/test-system.mjs: проверяет test DSN, подготавливает миграции/синтетические env, запускает Playwright с playwright.system.config.ts и закрывает собственные ресурсы.
- Дополнительные export-leads/purge-leads — scripts/backend/*.ts, точные команды в runbook.

Export: явный --out, файл вне Git checkout, создание без перезаписи, контакты не печатать в stdout. Purge: dry-run по умолчанию, реальное удаление с --execute и утверждённым retention; demo 7 дней, live без срока не запускается. Удаление lead/outbox/receipts согласовано FK. Скрипты не создают CRM.

Compose: PostgreSQL только 127.0.0.1:55432, БД lsf_test_backend, пользователь lsf_test, test-only пароль lsf_test_only, явно заданный PGDATA на tmpfs. Не запускать внешний открытый порт. При отсутствии TEST_DATABASE_URL harness использует только этот локальный fixture DSN: postgresql://lsf_test:lsf_test_only@127.0.0.1:55432/lsf_test_backend. Это публичные синтетические credentials тестового контейнера, не production-секреты.

~~~sh
npm ci --prefer-offline --no-audit --no-fund
npm run db:test:up
npm run verify:backend
npm run db:test:down
~~~

Проверить TEST_DATABASE_URL до любых очисток: hostname 127.0.0.1/localhost, database начинается с lsf_test_. При нарушении завершаться с ошибкой без SQL-изменений. В дочерний тестовый app DATABASE_URL передаётся из этого проверенного TEST_DATABASE_URL. Реальные production DSN не использовать и не выводить.

Integration harness применяет миграции, запускает build через уже выполненную verify-команду либо требует свежую сборку, поднимает Next на 3022, ждёт HTTP readiness с ограниченным timeout, запускает tests/integration/*.test.mjs, завершает только собственный дочерний процесс в finally. Не завершать все node.exe.

System harness использует ту же защищённую тестовую БД последовательно после integration, создаёт test-only HMAC/OUTBOX_SECRET в env дочернего процесса без вывода значений, задаёт ALLOWED_ORIGINS=http://127.0.0.1:3023, ALLOWED_SITE_KEYS=auto,beauty и ENABLE_LIVE_LEADS=false. Прямой запуск Playwright без этого harness не является командой приёмки. При запуске harness передаёт корректный env в Playwright и его webServer, а не записывает production-конфиги.

## 14. Обязательная матрица unit-тестов

Каждый ID должен быть сопоставлен с исполняемым тестом в отчёте. Табличные подслучаи допустимы; фиктивный один assert на весь раздел — нет.

| ID | Сценарий | Ожидание |
| --- | --- | --- |
| BU01 | Все 15 имеющихся тестов normalizePhone | Сохранены и проходят |
| BU02 | Схема: unknown price/status/channel/consentAt | 422 |
| BU03 | Root array/null, неверные типы, отсутствующие required | 422 |
| BU04 | Honeypot заполнен | REQUEST_REJECTED |
| BU05 | Неизвестная услуга/опция/значение/ресурс | Ошибка соответствующего поля |
| BU06 | Required wheel-size отсутствует | serviceOptions.wheel-size |
| BU07 | Необязательный ресурс не передан | Принято |
| BU08 | Ресурс не поддерживает выбранную услугу | Отклонено |
| BU09 | Старый configVersion | CONFIG_CHANGED |
| BU10 | Старая версия consent, accepted=false/не boolean | CONSENT_CHANGED либо схема 422 по порядку |
| BU11 | Имя отсутствует/валидное/пробельное/81 символ | Допуск или customer.name |
| BU12 | Демо/лайв и синтетический телефон | Строго по режиму |
| BU13 | Даты 30 февраля, корректный/некорректный високосный день | Календарная проверка |
| BU14 | Прошлое время и ровно now | Отклонены |
| BU15 | Московская дата при TZ процесса UTC/другом TZ | Один результат |
| BU16 | Нерабочий день | preferred.date |
| BU17 | opens, closes, шаг относительно opens | opens допустим, closes/некратное — нет |
| BU18 | Horizon last day / следующий день | Допуск / отказ |
| BU19 | preferred отсутствует при required true/false | Отказ / допуск |
| BU20 | HMAC: порядок опций/форматирование телефона | Эквивалентные формы совпадают |
| BU21 | HMAC: другой контакт/услуга/версия | Разные значения |
| BU22 | Attribution выключена/включена | Отброшена / allowlist |
| BU23 | Серверная цена и timestamps | Клиент не задаёт значения |
| BU24 | Неизвестный destination/adapter, live не готов | Без fake-success |
| BU25 | Worker: retry schedule, attempt 8 | Правильные даты/dead |
| BU26 | Adapter timeout и безопасные error codes | Повтор, без PII |
| BU27 | Неверные env/небезопасная test DSN | Fail before destructive SQL |
| BU28 | Mapping ошибок на HTTP | Только документированные коды/envelope |

## 15. PostgreSQL/HTTP integration — обязательно настоящий сервер БД

| ID | Сценарий | Проверяемое состояние |
| --- | --- | --- |
| BI01 | Две последовательные миграции | Второй запуск не меняет схему повторно |
| BI02 | Обычный POST | 201, один lead, один pending outbox, snapshot |
| BI03 | Один payload/key повторно | 200, тот же leadId, replayed=true |
| BI04 | 20 конкурентных одинаковых POST | Один 201, остальные 200; одна пара строк |
| BI05 | Один key с разными payload | Один сохранён, другой 409; строка не перезаписана |
| BI06 | Два разных key | Два lead; протокол не делает скрытую дедупликацию телефона |
| BI07 | Повтор после смены текущего конфига/часов | Получает прежний receipt |
| BI08 | Ошибка вставки outbox | Rollback lead, 503, ни одной неполной пары |
| BI09 | БД недоступна/statement timeout | 503, no-store, без fake-success |
| BI10 | 5 новых валидных key и шестой для IP/site | 5 допусков, затем 429 + Retry-After |
| BI11 | Повтор в исчерпанном bucket | 200, счётчик не растёт |
| BI12 | Лимит site на разных clientKey | 100 допусков, 101-й 429 |
| BI13 | Завершение окна по Clock | Новая заявка снова допустима |
| BI14 | Два pool/process на limiter | Один общий лимит, не Map в памяти |
| BI15 | Origin отсутствует/чужой | 403 и ноль lead |
| BI16 | JSON сломан; UUID отсутствует/невалиден | 400 |
| BI17 | Другой media type; фактические 16KiB+ | 415/413, включая ложный Content-Length |
| BI18 | Серверная schema/business validation | Все классы 409/422 без записи |
| BI19 | Auto и Beauty | Разные назначения, общий механизм |
| BI20 | Чужой siteKey/destination в body | 404/422, изоляция |
| BI21 | Worker recording | Одна receipt, outbox sent |
| BI22 | Два worker одновременно | Одна задача не обрабатывается одновременно |
| BI23 | send отказ/timeout | Lead сохранён, outbox перенесён |
| BI24 | Worker crash, expired lease | Задание доступно повторно |
| BI25 | Stale claim_token завершает позже нового | Новая попытка не перезаписана |
| BI26 | Recording успешно, crash до sent | Повтор возвращает прежнюю receipt |
| BI27 | Смена destination для новых lead | Старая очередь остаётся на прежней версии |
| BI28 | Internal route без/с неверным секретом | 401, очередь не тронута |
| BI29 | Internal route с секретом | Только агрегатные числа в ответе |
| BI30 | Purge/retention/rate buckets | Только старые строки, корректный CASCADE |
| BI31 | Export | Файл вне Git, без PII в stdout и без перезаписи |
| BI32 | Backup/restore на синтетике | Восстановлены lead/outbox/receipt и связи |
| BI33 | Логи и ошибки | Нет телефонов, имён, DSN и секретов |

Транзакции и конкуренцию проверять отдельными соединениями к PostgreSQL. Мок repository не засчитывается вместо BI02–BI14 и BI21–BI27.

## 16. Контрольный HTTP-тест: точный шаблон

Файл tests/integration/idempotency.test.mjs должен содержать эквивалент следующего исполняемого сценария. Harness задаёт TEST_BASE_URL и валидный origin, а makeBody формирует будущую рабочую дату.

~~~js
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

test("один ключ — один receipt при конкурентных POST", async () => {
  const base = process.env.TEST_BASE_URL;
  assert.ok(base);
  const date = new Date(Date.now() + 2 * 86400000);
  while (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  const body = {
    siteKey: "auto", configVersion: "demo-2026-11-04", kind: "booking",
    serviceId: "tire-change", serviceOptions: { "wheel-size": "R16" },
    preferred: { date: date.toISOString().slice(0, 10), time: "10:30", timezone: "Europe/Moscow" },
    customer: { phone: "+70000000000" },
    consent: { accepted: true, version: "demo-2026-11-04" },
    antiBot: { website: "" }
  };
  const key = randomUUID();
  const send = () => fetch(base + "/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base, "Idempotency-Key": key },
    body: JSON.stringify(body)
  });
  const responses = await Promise.all(Array.from({ length: 20 }, send));
  assert.equal(responses.filter(r => r.status === 201).length, 1);
  assert.equal(responses.filter(r => r.status === 200).length, 19);
  const receipts = await Promise.all(responses.map(r => r.json()));
  assert.equal(new Set(receipts.map(r => r.leadId)).size, 1);
});
~~~

К этому тесту обязательно добавить SQL-assert: ровно один lead по site/key, ровно один outbox по lead_id. Изолировать fixture от лимитов других тестов и не ослаблять рабочие лимиты ради прохождения теста.

## 17. System smoke для финального контроля

Подготовить tests/system/pr3-real.spec.ts по testid общего контракта. Конфиг playwright.system.config.ts уже есть.

Тесты используют настоящий UI/API/PostgreSQL, без page.route/подмены CreateLead. Авторы backend могут завершить эти тесты только после объединения с frontend; отсутствие UI до интеграции не блокирует отдельную сдачу verify:backend, но должно быть явно отмечено.

Обязательные сценарии:
1. Пройти Auto: wheel-size, будущая рабочая дата/время, синтетический телефон, согласие; получить leadId.
2. SQL-проверка lead/outbox и точного site/service/предпочтения, phone/consent/snapshot.
3. Вызвать internal worker с test-only секретом; проверить recording receipt и sent.
4. Повтор того же HTTP payload/key не создаёт второй lead.
5. Пройти Beauty с мастером и без мастера; проверить назначения.
6. Смоделировать отказ recording на уровне защищённой тестовой БД/изолированного worker fixture; lead остаётся, outbox получает повтор. Не добавлять публичный параметр или production-переключатель fake failure. Модификации тестовой БД восстанавливаются в finally.
7. После тестов корректно закрыть pool и дочерние процессы.

Не очищать БД без guard. Допустим отдельный dataset lsf_test_system, только loopback. Никаких реальных контактов и внешних сообщений.

## 18. CI и окончательная сдача

Создать backend-tests.yml: Node 22, npm ci, PostgreSQL 18 service с test-only DSN, npm run verify:backend. Запуск для PR и своей ветки. Не менять общий quality workflow.

Итоговая сдача включает:
- [ ] Все BU и BI покрыты исполняемыми тестами, нет skip/todo/пустых assert.
- [ ] verify:backend завершён с exit 0.
- [ ] CI своего блока завершён; статус и URL записаны.
- [ ] Runbook содержит точные env-имена без значений, миграции, запуск, queue/dead jobs, backup/restore/export/purge.
- [ ] Таблица ID → файл/название теста → результат в docs/reports/backend.md.
- [ ] Сохранены 15 phone-регрессий; новые тесты не ослабляют бизнес-правила.
- [ ] Один PR содержит весь готовый серверный блок и отдельно перечисляет system-тесты, ожидающие интеграции.
- [ ] Никаких заявлений о live-доставке или публикации без фактической проверки.

Финальный ответ владельцу: PR/ветка/SHA, summary результата, команды и фактические числа тестов, CI, runbook и оставшиеся внешние ограничения. После сдачи всего блока остановиться и ждать финального контроля архитектора.
