# Перепроверка Hermes 3390577

Дата: 05.11.2026. Проверен backend 33905773ff15dd40da0200e9f0444d56f75ddca1 вместе с ранее опубликованным frontend 0a8056ec22190ade45b32c7b599c32458024c383. Объединённый снимок: codex/pr3-final-review, 98879613cee1768494d40ee55281188e27f43906.

**Решение:** основные исправления BR1–BR6 подтверждены, полностью закрывать серверную приёмку рано: в новой нормализации экспортного пути остался дефект BR7 (P2). Исправления интерфейса Antigravity этой проверкой не принимались.

## Проверено независимо

| Команда | Фактический результат |
| --- | --- |
| npm run verify:backend | exit 0: schemas, lint, typecheck, 57 unit, build, 46 integration |
| npm run test:system на объединённом коде | 7 passed, 0 skipped, exit 0 |
| Исходные отрицательные пробы архитектора | Запрещены unknown adapter и live; восьмая expired processing переходит в dead; query host override отклонён; неверный migration target не изменён; экспорт внутрь Git отклонён |
| CI на backend SHA 3390577 | [Backend success](https://github.com/fedorenko-sv/lipetsk-site-factory/actions/runs/42094465913), [Quality success](https://github.com/fedorenko-sv/lipetsk-site-factory/actions/runs/42094465980) |

Просмотрены изменения claim/recovery, конкурентность пачки, guard фактической БД, мигратор, экспорт, readiness gate и новые проверки. Системные S1 и S5 теперь действительно проходят браузерные Auto/Beauty, связывая ID интерфейса с PostgreSQL/receipt.

Логи: [полный серверный прогон](hermes-3390577-evidence/verify-backend.log.txt), [системный](hermes-3390577-evidence/system.log.txt), [исходные негативные пробы после исправлений](hermes-3390577-evidence/original-probes.jsonl).

## Оставшийся BR7: экспорт меняет место назначения

В src/server/config/guards.ts:97 отсутствующие сегменты собираются через missing.unshift, а на строке 108 затем ещё раз разворачиваются missing.reverse(). При двух и более отсутствующих сегментах путь переставляется.

Реальное воспроизведение с export-leads.ts:
- Создан собственный временный внешний каталог; в нём уже есть папка export.csv.
- Запрошен путь <каталог>/missing-parent/export.csv, где missing-parent отсутствует.
- Ожидается отказ без файла.
- CLI завершился 0 и создал другой файл: <каталог>/export.csv/missing-parent.
- Экспортирован только заголовок CSV с фильтром по отсутствующему site, контактов в файле не было. Файл и временный каталог удалены.

[Фактический результат](hermes-3390577-evidence/export-probe.json), [исходник воспроизведения](hermes-3390577-evidence/export-probe.mjs.txt). Для запуска скопировать исходник в work/review2/export-probe.mjs объединённого checkout и выполнить node --experimental-strip-types work/review2/export-probe.mjs при работающем локальном тестовом PostgreSQL.

[Точечное задание Hermes BR7](../../agents/tasks/PR3_BACKEND_EXPORT_PATH_FIX.md). Ранее принятые части повторно разрабатывать не нужно.

## Просмотр владельцем

Локальное демо поднято на 127.0.0.1:3030 из проверенного объединённого снимка. HTTP 200 подтверждены для /, /demo/auto и /demo/beauty. Оставлен запущенный отдельный preview-процесс, база lsf_test_preview_20261105; тестовые прогоны используют другую БД.

[Что строится и как посмотреть](../10-preview.md). В демо только синтетические данные и recording. Секреты созданы в env процесса, в документы/репозиторий не записаны. Реальные каналы и публичный live не включены.

Код разработчиков в main не объединялся. Основная повторная приёмка интерфейса ожидает сдачу Antigravity.
