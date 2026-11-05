# Runbook сервера (PR-3, Core A)

Только имена переменных; значения секретов не хранятся в Git и не присылаются в чат.

## 1. Переменные окружения (полные описания — `.env.example`)

| Имя | Назначение |
| --- | --- |
| `DATABASE_URL` | DSN PostgreSQL runtime-роли (без DDL) |
| `TEST_DATABASE_URL` | тестовый DSN; разрешены только loopback и база `lsf_test_…` |
| `ALLOWED_ORIGINS` | строгий allowlist Origin через запятую |
| `ALLOWED_SITE_KEYS` | deployment-allowlist сайтов (например `auto,beauty`) |
| `ENABLE_LIVE_LEADS` | `true` только после утверждённых live-входов |
| `IDEMPOTENCY_HMAC_KEY` | секрет HMAC канона заявки, ≥ 32 символов |
| `RATE_LIMIT_HMAC_KEY` | отдельный секрет HMAC клиентского ключа (IP) |
| `OUTBOX_SECRET` | Bearer-секрет `POST /api/internal/outbox`, ≥ 32 символов |
| `SITE_DESTINATIONS_JSON` | siteKey → `{destinationKey, version}` (выбор только сервера) |
| `NOTIFICATION_DESTINATIONS_JSON` | destinationKey → `{adapterId}` |
| `TRUSTED_IP_HEADER` | заголовок доверенного ingress для IP; без него clientKey=`unknown` |
| `LEAD_RETENTION_DAYS` | целое ≥ 1; purge без него не запускается |
| `ATTRIBUTION_ENABLED` | `true` включает allowlist UTM в attribution |

## 2. Роли БД и миграции

- Миграционную роль использовать только для `npm run db:migrate`; runtime-роль без DDL.
- Пул один на процесс: `max=5`, `connectionTimeoutMillis=5000`, `statement_timeout=5000`.
- Мигратор блокируется advisory-lock от одновременного запуска; каждая миграция — отдельная транзакция, применяется ровно один раз (`schema_migrations`).

```sh
DATABASE_URL=*** DSN> npm run db:migrate   # идемпотентен: повтор только skip
```

## 3. Запуск приложения и worker

```sh
npm run build && npm start                  # Next, runtime node
npm run outbox:once                         # одна пачка до 20 задач
curl -X POST -H "Authorization: Bearer <OUTBO…ET>" \
  http://127.0.0.1:3000/api/internal/outbox  # то же через планировщик
```

Worker: claim `FOR UPDATE SKIP LOCKED`, lease 120 с, attempts растёт при claim,
результат пишется только при совпадении `id + claim_token`. Повторы после
попыток 1–7: 1/5/15/30/60/120/240 минут; после неудачи попытки 8 статус `dead`.
Истёкший lease возвращает задачу в очередь автоматически.

Диагностика очереди:

```sql
SELECT status, count(*) FROM notification_outbox GROUP BY status;
SELECT id, attempts, last_error_code, next_attempt_at
  FROM notification_outbox WHERE status='dead' ORDER BY updated_at DESC LIMIT 20;
-- вернуть dead-задачу в работу (после починки причины):
UPDATE notification_outbox
   SET status='pending', attempts=0, next_attempt_at=now(), lease_until=NULL
 WHERE id='<uuid>' AND status='dead';
```

`last_error_code` — только безопасный код (`CONFIG_ERROR`, `PROVIDER_UNAVAILABLE`,
`TIMEOUT`, `SEND_FAILED`); сырых ответов провайдера и контактов в БД нет.

## 4. Экспорт и удаление

```sh
# экспорт: явный путь ВНЕ репозитория, без перезаписи, контакты только в файле
DATABASE_URL=*** DSN> node --experimental-strip-types scripts/backend/export-leads.ts --out <вне-repo>/leads.csv [--site auto]

# purge: по умолчанию dry-run; реально — только с --execute и утверждённым сроком
node --experimental-strip-types scripts/backend/purge-leads.ts --retention-days 7
node --experimental-strip-types scripts/backend/purge-leads.ts --retention-days 7 --execute
```

Demo-данные — retention 7 дней; live без утверждённого срока не удалять.
Удаление lead каскадно сносит outbox и receipts (FK).

## 5. Backup / restore (проверено на синтетике, BI32)

```sh
pg_dump "$DATABASE_URL" --no-owner > backup.sql
# восстановление в чистую базу той же версии схемы
psql "$RESTORE_URL" -v ON_ERROR_STOP=1 < backup.sql
```

## 6. Локальный тестовый PostgreSQL

`db/compose.test.yml`: PostgreSQL 18, publish только `127.0.0.1:55543`
(порт 55432 на Windows-хостах попадает в Hyper-V reserved range —
использован 55543; смысл требования — только петлевой интерфейс), БД
`lsf_test_backend`, пользователь `lsf_test`, пароль `lsf_test_only` —
публичные синтетические credentials контейнера. Данные на tmpfs.

```sh
npm run db:test:up
npm run verify:backend    # plan+lint+typecheck+unit+build+integration
npm run db:test:down
```

Все очистители сначала вызывают guard: hostname `127.0.0.1/localhost` и
префикс базы `lsf_test_`; при нарушении — ошибка без выполнения SQL.

## 7. Отказоустойчивость и мониторинг

- 503 `STORAGE_UNAVAILABLE` — БД недоступна/таймаут; заявка не потеряна молча,
  статус виден заказчику; приложить проверку `pg_isready` и логов приложения.
- Internal route без/с неверным секретом — 401 без обработки очереди; ответ
  содержит только `processed/sent/retried/dead`.
- Все ответы API — `Cache-Control: no-store`; в логах нет телефонов, имён,
  DSN и секретов (BI33).
- Recording-адаптер — demo-свидетельство (`synthetic: true`), не канал
  администратора. Реальные каналы подключаются отдельным решением заказчика
  и semantic at-least-once.
