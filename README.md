# Lipetsk Site Factory

Шесть самостоятельных демо на общей кодовой базе: Booking A и Calculator B работают; B2B Catalog/RFQ C отложен до подтверждённой задачи. Для показа выбирают прямой вход в нужный сайт. Его логотип, меню и подвал ведут внутри этого демо.

## Смотреть

Общая витрина: http://127.0.0.1:3035/.

| Демо | Прямой вход | Страниц |
| --- | --- | --- |
| A1 Auto | http://127.0.0.1:3035/demo/auto | 9 |
| A2 Beauty · MIRA | http://127.0.0.1:3035/demo/beauty | 9 |
| A3 Medical · ЯСНО | http://127.0.0.1:3035/demo/medical | 9 |
| A4 Sports · ДВИЖ | http://127.0.0.1:3035/demo/sports | 10 |
| A5 Stay · ТИШЕ | http://127.0.0.1:3035/demo/stay | 8 |
| B1 Estimate · ПРОСВЕТ | http://127.0.0.1:3035/demo/estimate | 9 |

Итого 54 страницы шести направлений. Дополнительно сохранён подробный Auto-пример [OBLIK](http://127.0.0.1:3035/demo/detailing), 14 страниц. Вместе с витриной — 69 проверяемых адресов. Адреса локальные; публичные развёртывания не объявляются созданными.

У каждого демо есть главная, каталог, подробные предложения, информация/команда, отдельная форма и политика. Выбранные услуга, совместимый специалист или конструкция передаются в форму. Запрос сохраняется в PostgreSQL вместе с outbox; recording создаёт проверочное свидетельство.

## Запуск

Node.js 22 и npm, Docker с доступным Linux engine. Зависимости закреплены в package-lock.json.

~~~powershell
npm ci
npm run db:test:up
npm run build
npm run preview:portfolio
~~~

Оставить preview работающим. По умолчанию сайт использует 3035, тестовый PostgreSQL — 127.0.0.1:55543. Другой локальный порт задаётся через PORTFOLIO_PREVIEW_PORT. Preview создаёт только собственную lsf_test_ базу и синтетические серверные настройки.

Для обычной разработки: npm run dev (Webpack); серверные настройки задаются локально через env.

Показ и отдельные входы: [инструкция](docs/16-demo-delivery.md).

[Фактический финальный контроль 18.11.2026](docs/reports/six-demos-2026-11-18.md): 144 browser, 13 system, 53 integration, 62 backend unit, 38 UI unit; 69 маршрутов.

## План и архитектура

- [Подробная карта проекта](docs/13-six-prototypes-project-map.md): ядра, модули, маршруты и границы.
- [Первый пакет шести оболочек](docs/superpowers/plans/2026-11-18-six-prototypes.md).
- [Развитие самостоятельных демо](docs/superpowers/plans/2026-11-18-standalone-demos.md).
- [Карта следующих клиентских итераций](docs/15-next-iterations.md).
- Booking: [правила API](docs/03-api-contract.md), [OpenAPI](contracts/openapi.json).
- Calculator: [контракт и формула](docs/14-estimate-contract.md), [OpenAPI](contracts/estimates.openapi.json).
- [Эксплуатация backend](docs/runbooks/backend.md).

Статические каталоги и статьи собираются заранее. Страницы booking/calculator динамические: проверяют выбранный контекст из URL. Общее хранилище реализует идемпотентность, persistent limits и атомарную lead/outbox-транзакцию.

## Проверки

~~~powershell
npm run check:plan
npm run lint
npm run typecheck
npm run test:ui
npm run test:backend
npm run build
npm run test:integration
npm run test:e2e
npm run test:system
~~~

Для полного последовательного цикла: npm run verify:release. У browser и system разные каталоги результатов.

Проверка уже запущенного preview:

~~~powershell
npm run verify:demo-routes
npm run test:portfolio:system
~~~

Первая команда проверяет 69 адресов, HTTP 200, один H1 и noindex. Вторая — первые экраны на 390/768/1440 и шесть реальных путей UI → API → PostgreSQL → outbox/recording с повтором запроса.

## Режим и границы

Демо принимает только +70000000000 и синтетические данные. Реальные визиты, места в группах, ночи, оплата и внешние уведомления не подтверждаются. В Medical нет полей для медицинских сведений. У Stay время означает обратную связь; у Calculator стоимость предварительная и пересчитывается сервером.

Канал администратора выбирается для конкретного клиента: Telegram, email или существующая CRM через отдельный адаптер. Recording не является реальным каналом. Live закрыт до готовности соответствующих условий и конфигурации.

Исходные задания двух разработчиков и отчёты PR-3 остаются историей: [источники](docs/00-sources.md), [соглашение](docs/09-batch-contract.md), [проверки архитектора](docs/reports/pr3-final-review.md). Текущий статус не следует определять по старым промежуточным отчётам.

## Выбранное демо отдельным процессом

~~~powershell
npm run preview:demo -- --list
npm run preview:demo -- beauty
~~~

Beauty открывается на http://127.0.0.1:3042/ со своей test-БД и API scope. Аналогично доступны auto/medical/sports/stay/estimate. [Профили, порты, схема и проверка](docs/17-isolated-demo-profiles.md). Общая коллекция по-прежнему запускается через preview:portfolio.
