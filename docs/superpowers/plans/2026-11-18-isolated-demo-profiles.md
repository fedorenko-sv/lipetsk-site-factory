# Раздельный запуск шести демо — план реализации

**Goal:** один проверенный build запускается как фабрика или как выбранное самостоятельное демо со своим тестовым хранилищем и allowlist.
**Architecture:** runtime Proxy + общий проверяемый профиль; существующие Booking A/Calculator B, LeadStore и recording сохраняются.
**Stack:** Next 16.4.6 Proxy, Node 22, PostgreSQL 18, Playwright; новых runtime-зависимостей нет.
**BASE:** a8e854e69eab2104b5d23b2ae11c4a033258a14e; текущий изолированный worktree portfolio, ветка codex/six-prototypes, PR #5.
**Execution:** executing-plans, лично архитектором. Дополнительное делегирование не поручено.

## Почему это следующий шаг

Состав страниц и локальная приёмка предыдущих итераций готовы. Сейчас фабрика и все шесть демо живут на одном origin и в одной preview-БД. В docs/16-demo-delivery.md отдельное развёртывание предполагает собственные allowlist/origin/БД. Данный пакет делает эту подготовку исполняемой локально.

Публичная публикация, реальные каналы, Core C, ночи/ёмкость не включаются. У них остаются указанные в docs/15-next-iterations.md внешние входы. Изоляция относится к маршрутам и серверному приёму заявок; общие публичные ассеты/исходники остаются в одном build.

## Контракт

- DEMO_SITE_KEY отсутствует или пуст: прежняя фабрика, 69 маршрутов.
- Допустимы ровно auto/beauty/medical/sports/stay/estimate. Некорректное непустое значение не открывает фабрику: страницы 503/noindex/no-store, API — штатная конфигурационная ошибка.
- GET / на выбранном профиле перенаправляет на /demo/<key> внутри origin. Основная навигация остаётся собственной. Чужие страницы и RSC-запросы получают 404, не раскрывая содержание чужого демо.
- Auto включает также свой подробный OBLIK /demo/detailing. Профили других направлений его не открывают.
- API проверяет точное соответствие ALLOWED_SITE_KEYS выбранному профилю; HTTP-контракты, последовательность проверки заявки и worker-token не меняются.
- Один build используется для всех профилей; переменная читается во время запроса, не через NEXT_PUBLIC и не во время SSG.
- Порты по умолчанию: auto 3041, beauty 3042, medical 3043, sports 3044, stay 3045, estimate 3046. Произвольный явно заданный loopback-порт 1024–65535 проверяется до SQL.
- Новая команда npm run preview:demo -- beauty; --list показывает профили; --port меняет порт.
- Собственная БД lsf_test_demo_<key>_<port>; тестовый harness добавляет уникальный suffix. Подключение только по assertSafeTestDatabaseUrl к локальному test PostgreSQL. Секреты только в памяти child env.
- Фабричный preview:portfolio и его имя БД/путь state сохраняются. В state только PID, URL, профиль, имя БД, время. Процессы завершаются только по принадлежащему запуску child PID.

## Файлы и интерфейсы

1. src/server/config/demo-deployment.ts: шесть профилей, разбор режима, проверка scope и чистое решение по pathname.
   - parseDemoDeployment(value: unknown): factory | single(profile) | invalid.
   - deploymentScopeMatches(mode, siteKeys): boolean.
   - decideDemoRoute(mode, pathname): next | redirect(to) | not-found | unavailable.
2. src/proxy.ts: адаптер NextRequest/NextResponse, runtime env, HTTP 307/404/503, noindex/no-store. API и framework/static-ресурсы обслуживаются своими обработчиками.
3. src/server/config/runtime.ts: отклонение выбранного режима с неверным allowlist до доступа к storage.
4. scripts/preview-runtime.mjs: построение приватного env и безопасное создание собственной БД.
5. scripts/preview-runner.mjs: startPreview(options) -> base/database/dispatch()/stop(); shared lifecycle без process.exit внутри библиотеки.
6. scripts/preview-detailing.mjs: совместимый фабричный CLI.
7. scripts/preview-demo.mjs и scripts/demo-preview-options.mjs: выбор профиля/порта, безопасные сообщения владельцу.
8. scripts/portfolio-browser-flow.mjs: общий настоящий проход формы для двух preview-harness, без mocks.
9. scripts/backend/test-demo-profiles.mjs: шесть sequential изолированных запусков, HTTP/browser/API/SQL/worker, очистка только своих уникальных БД.
10. docs/17-isolated-demo-profiles.md: матрица режима, команды, схема окружения и инструкция показа; обновление карты/текущего плана.

## Task 1 — контракт и серверный scope

- [x] Добавить в tests/backend/demo-deployment.test.mjs регрессию: beauty + allowlist beauty,auto должна отвергаться. На исходном loadRuntimeConfig тест обязан упасть.
- [x] Реализовать профили/разбор режима/scope и подключить к runtime. Сохранить factory по умолчанию.
- [x] DP01–DP08: default factory; шесть профилей; Auto+OBLIK; неверное/прототипное/составное имя; лишний/неполный/дублированный scope; существующие контракты без DEMO_SITE_KEY.
- [x] Команда node --experimental-strip-types --test tests/backend/demo-deployment.test.mjs; затем backend suite.

## Task 2 — маршруты на одном production build

- [x] Зафиксировать RED: сервер с DEMO_SITE_KEY=beauty на исходном build отдаёт витрину вместо собственного входа.
- [x] Реализовать чистую route-policy и src/proxy.ts; прочитать локальные Next Proxy/env docs.
- [x] DP06–DP08 + SP01: / -> выбранное демо; свой каталог/заявка/privacy; чужие URL/RSC/encoded path и похожий префикс; invalid env -> 503; API/static bypass с серверным scope.
- [x] Build один раз; проверять режим на runtime server после build. Сохранить static/dynamic разделение страниц.

## Task 3 — рабочие профили запуска

- [x] Разделить существующий preview на provisioning/runtime и lifecycle, сохранив фабричный интерфейс.
- [x] DO01–DO05: CLI --list, известный профиль, корректный override порта; неизвестные/повторные аргументы и опасные значения отвергаются до SQL/child.
- [x] TEST_DATABASE_URL проверяется до подключения; dbname конструируется, не принимается произвольной строкой. Не выводить env/DSN/token.
- [x] Проверить занятой порт и остановку собственного child, без захвата чужого процесса. Состояния не содержат секретов.

## Task 4 — полная приёмка шести профилей и передача

- [x] SP01: шесть собственных root/catalog/action, own brand/noindex, чужие страницы 404, query/RSC не обходят правило.
- [x] SP02: каждый профиль -> настоящий UI -> свой API -> своя PostgreSQL -> outbox -> recording; leadId совпадает. Replay с тем же ключом даёт одну запись.
- [x] SP03: валидная чужая Booking/Estimate-заявка и чужой Origin отклоняются до создания lead/outbox/расхода лимита.
- [x] SP04: own destinations/state, отсутствие чужих сайтов в runtime, безопасное завершение и уборка только собственных test БД.
- [x] npm run test:demo-profiles в backend CI после установки Chromium.
- [x] check:plan/lint/typecheck/build, unit, затронутая HTTP/system и frontend регрессия; общий CI на итоговом SHA проверяется в PR при сдаче.
- [x] Обновить docs/15/16/17 и карту, отчёт/свидетельства, индекс outputs. Исторические галочки не выдавать за актуальный backlog.
- [x] Фабрика 3035 и Beauty 3042 оставлены для просмотра; Git/CI-статус публикуется в итоговой сдаче текущей ветки. Без merge в main/публикации.

## Журнал

Игнорируемый журнал: work/portfolio/isolated-profiles/progress.md. Ruling: использовать текущий чистый feature-worktree и существующий PR, не создавать копии шести приложений. Ruling: финальная проверка личная — инструкции владельца не разрешают дополнительное делегирование.
