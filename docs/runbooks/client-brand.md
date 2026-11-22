# Runbook. Бренд клиента для демо

Для оператора, который готовит показ под конкретную компанию. Решение и границы описаны в [ADR 18](../18-client-branding.md). Подключены оболочки **Beauty** и **Estimate**. Остальные оболочки пока показывают пресет и получат бренд по плану миграции.

## 0. Что нужно от клиента (бриф)

| Поле | Пример | Обязательно |
| --- | --- | --- |
| Оболочка | `beauty` / `estimate` | да |
| Короткое имя для шапки, до 24 знаков | `ВЕЧЕР` | да |
| Полное имя для вкладки, подвала, формы, до 80 знаков | `Вечерняя студия красоты «Вечер»` | да |
| Светлая или тёмная тема | `dark` | да |
| Логотип SVG для светлого и/или тёмного фона, без скриптов и внешних ссылок | `logo-on-dark.svg` | нет, иначе текст |
| 2–3 цвета бренда | фон, акцент, текст | нет, иначе пресет оболочки |
| Шрифт из каталога `src/brands/fonts.ts` | `oblik-sans` | нет, иначе пресет |
| Главное фото ≥1536 px по ширине, с правом показа | `hero.webp` | нет, иначе фото оболочки |
| Слоган до 48 знаков, подзаголовок до 60, лид до 260 | | нет |

Только вымышленные или подтверждённые клиентом материалы. Публичное имя не заменяет оператора данных и юридические сведения. Реальные контакты, отзывы, лицензии в бренд не вносятся.

## 1. Добавить бренд (≈10–15 минут при готовых материалах)

```bash
git switch -c brand/<key>
cp src/brands/configs/vecher.json src/brands/configs/<key>.json   # или prosvet.json для Estimate
mkdir -p public/demo-assets/brands/<key>
```

1. Положите файлы в `public/demo-assets/brands/<key>/`: `logo-on-light.svg`, `logo-on-dark.svg`, `hero.webp`. Фото конвертируйте в WebP: `cwebp -q 78 source.png -o public/demo-assets/brands/<key>/hero.webp`.
2. В `<key>.json` замените `key`, `version` (сегодняшняя дата), `shell`, `name`, `scheme`, `palette`, `typography`, `media`, `copy`, `metadata`. В каждом ассете — реальные `width`/`height`, `alt` по смыслу и `license` (происхождение).
3. В `src/brands/registry.ts` добавьте одну строку импорта и ключ в массив `sources`.
4. Проверьте:

```bash
npm run check:brands -- <key>
```

Ошибка показывает поле и причину, например `palette.muted/surface: contrast 4.11 < 4.5` или `media.hero.path: must be a local file under /demo-assets/brands/<key>/`. Исправьте JSON и повторите. Палитру подбирайте до прохождения всех пар контраста.

## 2. Собрать и показать

```bash
npm run build
npm run db:test:up
npm run preview:demo -- <shell> --brand <key> --port 3142
```

Сравнение с брендом по умолчанию — второй процесс без `--brand` на стандартном порте (`npm run preview:demo -- <shell>`). Один build обслуживает оба процесса. Проверьте на 390 и 1440 px: шапку, каталог, карточку, форму и квитанцию с номером `+70000000000`, заголовок вкладки.

## 3. Обновить материалы

Замените файл или значения в JSON, поднимите `version`, повторите `check:brands`, `build` и перезапуск превью. Старый файл можно удалить, если на него не ссылается ни один конфиг (`grep -r <file> src/brands/configs`).

## 4. Откат

- **Показ:** остановите процесс превью и запустите без `--brand` или с прежним ключом. Сборка не нужна.
- **Версия конфига:** `git log -p src/brands/configs/<key>.json`, затем `git checkout <sha> -- src/brands/configs/<key>.json public/demo-assets/brands/<key>/`, `npm run build`.
- **Удаление бренда:** удалите JSON, папку ассетов и строку в `registry.ts`; `npm run check:brands && npm run build`.

## 5. Диагностика

| Симптом | Причина | Что делать |
| --- | --- | --- |
| `preview:demo` пишет `Unknown brand` | ключ не зарегистрирован | строка в `registry.ts`, затем `npm run build` |
| `belongs to another shell` | бренд другой оболочки | выбрать бренд из списка в сообщении |
| Все страницы отвечают 503 «Демо временно недоступно» | `DEMO_BRAND_KEY` задан вручную неверно | запускать через `preview:demo --brand`, переменная не наследуется |
| Сборка падает `Invalid brand config: …` | JSON не прошёл проверку | `npm run check:brands` |
| Текст вместо логотипа | нет логотипа для выбранной `scheme` | добавить `logo.onDark` или `logo.onLight` |
