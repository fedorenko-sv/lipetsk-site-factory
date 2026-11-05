# Финальный контроль PR-3 — changes-required

Дата: 05.11.2026. Решение: **changes-required**. Код двух разработчиков пока не принимается в main. Основной демонстрационный путь работает; обнаружены ошибки очереди, защитных границ, интерфейса и покрытия тестами.

## Проверенные исходники

| Часть | Ветка / SHA |
| --- | --- |
| Общий базис | main / 53e9fd6d838a8c5de9c343d0f3fbe70fa883c147 |
| Hermes | codex/backend-pr3 / 07702741b4b536626a3d2ac03bef9bad57672b67 |
| Antigravity | codex/frontend-pr3 / 0a8056ec22190ade45b32c7b599c32458024c383 |
| Объединённый снимок | codex/pr3-final-review / a4d50f7b3dacd173a905028a1aa41a5b3787dcbe |

В отдельном integration worktree выполнены обычные merge backend → frontend. Конфликтов не было. Источники разработчиков при контроле не исправлялись.

CI подтверждён: [сервер](https://github.com/fedorenko-sv/lipetsk-site-factory/actions/runs/42030064659), [общий quality на backend SHA](https://github.com/fedorenko-sv/lipetsk-site-factory/actions/runs/42030063173), [интерфейс](https://github.com/fedorenko-sv/lipetsk-site-factory/actions/runs/42079345947). Это подтверждение выполненных workflow, не замена независимой проверки.

## Независимый прогон

npm ci и npm run verify:release завершились с exit 0 на объединённом снимке.

| Проверка | Фактический результат |
| --- | --- |
| Schemas/examples/links | Пройдены |
| Lint | 0 errors, 1 warning: лишний eslint-disable в phone.ts |
| Typecheck / production build | Exit 0 |
| Backend unit | 48 passed, 0 failed |
| UI unit | 20 passed, 0 failed |
| PostgreSQL/HTTP integration | 33 passed, 0 failed |
| Chromium + WebKit | 56 passed |
| System | 6 passed, **1 skipped** |

Системный UI-пропуск остаётся даже после интеграции: S1 открывает витрину / и автоматически пропускает тест при отсутствии offer-step. Поэтому exit 0 verify:release не закрывает полную приёмку.

Полный лог: [verify-release.log.txt](pr3-final-review-evidence/verify-release.log.txt).

## Реальный общий путь подтверждён отдельно

Архитектор запустил production Next на отдельном loopback-порту и собственной изолированной тестовой PostgreSQL-БД. Playwright Chromium, 390px, timezone America/New_York. HTTP-подмены в этих трёх сценариях отсутствовали.

| Сценарий | API | PostgreSQL / worker | Повтор |
| --- | --- | --- | --- |
| Auto | 201 | Один lead/outbox, sent, одна recording receipt | 200, прежний leadId |
| Beauty, master-a | 201 | Корректный resource/destination, sent, одна receipt | 200, прежний leadId |
| Beauty, любой мастер | 201 | resource_id=NULL, верное назначение, sent | 200, прежний leadId |

Сверены ID интерфейса и API, SQL-строки, назначения и recording receipts. Это синтетическое демо; настоящий канал администратора не подключался.

Свидетельства: [наблюдения браузера](pr3-final-review-evidence/browser-observations.json), [Auto](pr3-final-review-evidence/auto-any-real-received-390.png), [Beauty с мастером](pr3-final-review-evidence/beauty-master-a-real-received-390.png), [Beauty без мастера](pr3-final-review-evidence/beauty-any-real-received-390.png).

## Подтверждённые дефекты

| ID | Приоритет | Наблюдение / причина | Владелец |
| --- | --- | --- | --- |
| BR1 | P1 | Processing + attempts=8 + expired lease больше никогда не claim-ится; worker возвращает все нули, задача зависает | Hermes |
| BR2 | P1 | Test-mode мигратор валидирует TEST_DATABASE_URL, подключается к DATABASE_URL; реально созданы 5 таблиц в собственной БД без тестового префикса. Guard также допускает query host override, меняющий effective target драйвера | Hermes |
| BR3 | P2 | Путь outside/../checkout проходит export guard, CSV реально записывается внутри Git | Hermes |
| BR4 | P1 | Unknown adapter сохраняется в outbox при created; live readiness допускает recording без реального канала/ingress/retention | Hermes |
| BR5 | P1 приёмки | UI system smoke пропускается на объединённом приложении, Beauty остаётся API-only | Hermes |
| FR1 | P1 | После получения headers таймер выключен; зависший JSON body остаётся pending за дедлайном | Antigravity |
| FR2 | P1 | HTTP 201 с leadId=not-a-uuid показывает success, хотя receipt не соответствует схеме | Antigravity |
| FR3 | P1/P2 | 422 preferred.time скрыт на contact; focus=BODY. У контактных ошибок нет связи aria-describedby и правильного focus | Antigravity |
| FR4 | P2 | /demo/constructor, /demo/toString, /demo/__proto__ дают 500 из-за чтения Object.prototype | Antigravity |
| BR6 / FR5 | P1 приёмки | Часть тестов проверяет другие свойства/локальные константы вместо заявленного поведения | Оба по своей зоне |

Конкретные файлы, причины, воспроизведение, новые регрессии и условия сдачи перечислены в двух полных пакетах:
- [Исправления Hermes](../../agents/tasks/PR3_BACKEND_FINAL_FIXES.md).
- [Исправления Antigravity](../../agents/tasks/PR3_FRONTEND_FINAL_FIXES.md).

Негативные пробы выполнялись на собственных локальных синтетических фикстурах; внешнего подключения для query host override не было. CSV и созданные для проверки БД удалены после наблюдения. Строки подключения, секреты и реальные контакты в отчёт не включены.

## Почему зелёных чисел недостаточно

Это не предположение о качестве моделей. Проверены сами assert:
- FU15/FU16 сравнивают локальное состояние/строки вместо transport/late response.
- FU18–FU20 в основном проверяют конструктор ошибки, не HTTP parsing и timeout.
- FE21/FE22 не выполняют заявленные zoom/long-data условия.
- BU26 проверяет отдельно созданный AbortController, не worker.
- BI13 использует другое bucket key, BI32 игнорирует выбранное имя TEST_DATABASE_URL.

Каждому разработчику возвращён один пакет исправлений с точными регрессиями; повторная калибровка инструментов/моделей не нужна.

## Матрица приёмки Q

| Сценарии | Состояние |
| --- | --- |
| Q03/Q04/Q08–Q12/Q16–Q17/Q21 | Основное поведение подтверждено тестами и отдельным реальным общим путём; замечания по ошибочным конфигурациям указаны отдельно |
| Q01/Q02 | Стандартные viewport пройдены, 390px просмотрен; заявленные zoom/long-fixture проверки недостаточны |
| Q05–Q07/Q18/Q19 | Сервер отклоняет неверные данные, но отображение части ошибок/focus/unknown-site требует исправлений |
| Q13/Q14 | Обычные повторы проходят; BR1 блокирует приёмку восстановления очереди |
| Q15 | Настроенный HTTP-контур пройден; защитные границы тестовых DSN относятся к отдельному BR2 |
| Q20 | Проверялась только синтетика; полное заявленное покрытие console требует FR5 |
| Q22 | Публичный стенд не разворачивался, не входит в эту проверку |
| Q23 | Demo recording подтверждён; настоящий клиентский канал отсутствует |
| Q24 | Штатные CLI/backup тесты проходят, но BR2/BR3 и переносимость BI32 требуют исправлений |

## Следующий шаг

Передать каждому разработчику весь свой пакет из двух файлов выше. Они продолжают существующие ветки и сдают весь набор одним итоговым PR/SHA/CI-отчётом. Архитектор после двух сдач повторяет затронутые негативные регрессии и общий интегрированный путь.

Существующий тестовый контейнер Hermes оставлен в исходном работающем состоянии. Собственные app-процессы архитектора завершены, временные БД/экспорт удалены. Production/live/внешние каналы и публикация не выполнялись.
