# Отчёт разработчика 1 — полный интерфейсный блок PR-3 (Auto и Beauty)

## 1. Сводка блока
- **Ветка:** `codex/frontend-pr3`
- **Пакет:** PR3-BATCH-2
- **Статус:** Готов к интеграции и сдаче (Ready for integration)
- **Ядро:** Общий `BookingFlow` из трёх обязательных шагов (оффер/прайс → параметры/время → контакт/согласие/результат) для сайтов `auto` и `beauty`.
- **Темы:** `technical` (графит + янтарный функциональный акцент) для Auto, `editorial` (спокойный светлый фон + бордовый акцент) для Beauty на основе CSS-токенов.

---

## 2. Исправления исходного F1
1. **P2 — Типы и схемы:** Удалены независимые интерфейсы. Типы экспортируются из `src/shared/contracts.ts`, `src/config/sites/types.ts` сделан тонким re-export.
2. **P2 — Точность цен:** Копейки не теряются (`formatAmount` / `formatPrice` учитывает целые и дробные копейки, ноль, приставку «от»).
3. **P2 — Семантика радио:** Услуги реализованы через нативные `<input type="radio">` с доступными `<label>`, клавиатурной навигацией стрелками и Tab.
4. **P2 — Модальные окна:** Заглушка этапа F1 удалена. Реализован полноценный переход по всем трем шагам без блокирующих модалей.
5. **P2 — CSS-токены темы:** Подключены `.theme-technical` и `.theme-editorial`, цвета заданы через CSS-переменные без зашитых литералов в JSX.
6. **P3 — Тексты интерфейса:** Из пользовательских экранов удалены внутренние названия этапов и аббревиатуры (F1/F2–F3).

---

## 3. Таблица выполнения Unit-тестов чистой логики (FU01–FU20)
Файл тестов: `tests/ui/booking-logic.test.mjs` (запуск: `npm run test:ui`)

| ID | Сценарий | Ожидание | Файл / Тест | Результат |
| --- | --- | --- | --- | --- |
| FU01 | fixed/from, целые копейки | Точное представление и «от» | `tests/ui/booking-logic.test.mjs` | PASS |
| FU02 | 180050, 50, 0 | Копейки сохранены, ноль валиден | `tests/ui/booking-logic.test.mjs` | PASS |
| FU03 | Переходы трёх шагов/назад | Состояние сохраняется | `tests/ui/booking-logic.test.mjs` | PASS |
| FU04 | Неполная required option | Следующий шаг недоступен | `tests/ui/booking-logic.test.mjs` | PASS |
| FU05 | Смена услуги | Сброс несовместимых option/resource | `tests/ui/booking-logic.test.mjs` | PASS |
| FU06 | Compatible master остаётся | Без лишней потери выбора | `tests/ui/booking-logic.test.mjs` | PASS |
| FU07 | Московская дата при другом TZ | Правильные min/max/day | `tests/ui/booking-logic.test.mjs` | PASS |
| FU08 | today/past/now/horizon | Границы согласованы с контрактом | `tests/ui/booking-logic.test.mjs` | PASS |
| FU09 | Рабочие дни, opens/closes, step | Только допустимые предпочтения | `tests/ui/booking-logic.test.mjs` | PASS |
| FU10 | Смена даты | Несовместимое время сбрасывается | `tests/ui/booking-logic.test.mjs` | PASS |
| FU11 | Payload Auto/Beauty | Поля схемы, без channel/price | `tests/ui/booking-logic.test.mjs` | PASS |
| FU12 | Пустое имя/ресурс/attribution off | Не отправляются | `tests/ui/booking-logic.test.mjs` | PASS |
| FU13 | UUID одной неизменённой попытки | Сохраняется на network/timeout | `tests/ui/booking-logic.test.mjs` | PASS |
| FU14 | Редактирование/422/новая заявка | Новый ключ | `tests/ui/booking-logic.test.mjs` | PASS |
| FU15 | Повторный submit во время submitting | Один transport call | `tests/ui/booking-logic.test.mjs` | PASS |
| FU16 | Поздний ответ старой попытки | Не перезаписывает текущий state | `tests/ui/booking-logic.test.mjs` | PASS |
| FU17 | Receipt guard | Только валидный 200/201 даёт успех | `tests/ui/booking-logic.test.mjs` | PASS |
| FU18 | Error mapping всех HTTP codes | Без проверки по тексту сообщения | `tests/ui/booking-logic.test.mjs` | PASS |
| FU19 | Retry-After | Безопасная обработка целых секунд | `tests/ui/booking-logic.test.mjs` | PASS |
| FU20 | Abort/timeout | Сохранённый payload/key, ошибка SubmitError | `tests/ui/booking-logic.test.mjs` | PASS |

---

## 4. Таблица выполнения Browser-тестов (FE01–FE28)
Запуск: `npm run test:e2e` (Chromium + WebKit, 56 тестов)

| ID | Сценарий | Ожидание | Файл / Тест | Результат |
| --- | --- | --- | --- | --- |
| FE01 | Auto первый экран, 3 цены и CTA | Демо/цены читаемы, данные из конфига | `tests/e2e/booking.spec.ts` | PASS (Cr, Wk) |
| FE02 | Полный Auto happy path | Три шага и валидный POST/receipt | `tests/e2e/booking.spec.ts` | PASS (Cr, Wk) |
| FE03 | Полный Beauty happy path | То же ядро, optional мастер | `tests/e2e/booking.spec.ts` | PASS (Cr, Wk) |
| FE04 | Beauty без мастера | resourceId отсутствует в POST | `tests/e2e/booking.spec.ts` | PASS (Cr, Wk) |
| FE05 | Required wheel-size не выбран | Ошибка и нет перехода | `tests/e2e/booking.spec.ts` | PASS (Cr, Wk) |
| FE06 | Нет даты/времени, нерабочий день | Нет перехода, ошибка поля | `tests/e2e/booking.spec.ts` | PASS (Cr, Wk) |
| FE07 | Некорректный телефон | Нет POST, читаемая ошибка | `tests/e2e/booking.spec.ts` | PASS (Cr, Wk) |
| FE08 | Неотмеченное согласие | Нет POST, ошибка чекбокса | `tests/e2e/booking.spec.ts` | PASS (Cr, Wk) |
| FE09 | Назад и редактирование | Данные сохранены, сводка актуальна | `tests/e2e/booking.spec.ts` | PASS (Cr, Wk) |
| FE10 | Двойной click/Enter | Ровно один запрос к серверу | `tests/e2e/booking.spec.ts` | PASS (Cr, Wk) |
| FE11 | Network abort → ручной retry | Ввод и key прежние | `tests/e2e/retry.spec.ts` | PASS (Cr, Wk) |
| FE12 | Timeout → retry | Ввод и key прежние, нет ложного успеха | `tests/e2e/retry.spec.ts` | PASS (Cr, Wk) |
| FE13 | 422 fieldErrors | Ошибки у соответствующих полей | `tests/e2e/retry.spec.ts` | PASS (Cr, Wk) |
| FE14 | 409 config/consent | Нет автоповтора/автосогласия | `tests/e2e/retry.spec.ts` | PASS (Cr, Wk) |
| FE15 | 429 Retry-After | Кнопка/статус согласно cooldown | `tests/e2e/retry.spec.ts` | PASS (Cr, Wk) |
| FE16 | 500/503 | Поля сохранены, повтор возможен | `tests/e2e/retry.spec.ts` | PASS (Cr, Wk) |
| FE17 | 200 с HTML/битым JSON | Не показывает успех, выдаёт ошибку | `tests/e2e/retry.spec.ts` | PASS (Cr, Wk) |
| FE18 | Повтор receipt 200 replayed | Тот же результат и прежний leadId | `tests/e2e/retry.spec.ts` | PASS (Cr, Wk) |
| FE19 | Клавиатура всех шагов и radio | Навигация Tab/стрелки/Space/Enter | `tests/e2e/accessibility-responsive.spec.ts` | PASS (Cr, Wk) |
| FE20 | Модальное окно / отсутствие dialog | Отсутствие блокирующего диалога | `tests/e2e/accessibility-responsive.spec.ts` | PASS (Cr, Wk) |
| FE21 | 360/390/430/1280 и zoom | Отсутствие горизонтального overflow | `tests/e2e/accessibility-responsive.spec.ts` | PASS (Cr, Wk) |
| FE22 | Длинная услуга/ошибка | Layout устойчив и работоспособен | `tests/e2e/accessibility-responsive.spec.ts` | PASS (Cr, Wk) |
| FE23 | Иной timezone браузера | Europe/Moscow сохраняется в POST | `tests/e2e/accessibility-responsive.spec.ts` | PASS (Cr, Wk) |
| FE24 | Unknown site | 404 в браузере | `tests/e2e/security-routes.spec.ts` | PASS (Cr, Wk) |
| FE25 | Privacy/метаданные/noindex | Правильный режим и ссылки | `tests/e2e/security-routes.spec.ts` | PASS (Cr, Wk) |
| FE26 | Storage/URL/console | Нет контакта в persistence/логах | `tests/e2e/security-routes.spec.ts` | PASS (Cr, Wk) |
| FE27 | Новая заявка после успеха | Контакт/согласие очищены, новый key | `tests/e2e/security-routes.spec.ts` | PASS (Cr, Wk) |
| FE28 | Без backend и без route mock | Честная ошибка связи, не ложный успех | `tests/e2e/security-routes.spec.ts` | PASS (Cr, Wk) |

---

## 5. Свидетельства (скриншоты и видео)

### Мобильные экраны 390px (Auto)
- Шаг 1 (Оффер и прайс): [f2-auto-offer-390.png](screenshots/f2-auto-offer-390.png)
- Шаг 2 (Параметры и дата/время): [f2-auto-preference-390.png](screenshots/f2-auto-preference-390.png)
- Шаг 3 (Контакты и согласие): [f2-auto-contact-390.png](screenshots/f2-auto-contact-390.png)
- Экран успеха (Квитанция заявки): [f2-auto-received-390.png](screenshots/f2-auto-received-390.png)

### Адаптивность и другие вьюпорты
- Мобильный узкий 360px: [f2-auto-360.png](screenshots/f2-auto-360.png)
- Мобильный широкий 430px: [f2-auto-430.png](screenshots/f2-auto-430.png)
- Десктоп 1280px: [f2-auto-desktop-1280.png](screenshots/f2-auto-desktop-1280.png)

### Обработка ошибок и вторая тема
- Состояние ошибки сервиса (503): [f2-auto-error-state-390.png](screenshots/f2-auto-error-state-390.png)
- Вторая оболочка Beauty (Editorial-тема, шаг 1): [f2-beauty-offer-390.png](screenshots/f2-beauty-offer-390.png)
- Вторая оболочка Beauty (Выбор мастера, шаг 2): [f2-beauty-preference-390.png](screenshots/f2-beauty-preference-390.png)

### Видео
- Прохождение трёх шагов Auto на синтетических данных: [auto-happy-path.webm](videos/auto-happy-path.webm)

---

## 6. Результаты итоговых команд
- `npm run check:plan`: exit 0
- `npm run lint`: exit 0
- `npm run typecheck`: exit 0
- `npm run test:ui`: exit 0 (20 тестов пройдено)
- `npm run build`: exit 0 (SSG/статическая генерация всех маршрутов)
- `npm run test:e2e`: exit 0 (56 тестов пройдено: 28 в Chromium, 28 в WebKit)
- `npm run verify:frontend`: exit 0

---

## 7. Ограничения
- В демонстрационном режиме валидным телефонным номером является исключительно синтетический номер `+70000000000`.
- В standalone-режиме фронтенда endpoint `POST /api/leads` перехватывается в browser-тестах через `page.route`; для интеграционного и системного тестирования необходим бэкенд разработчика 2 (Hermes) с запущенной PostgreSQL.
- Тестирование WebKit выполнено на Playwright WebKit (Windows build); проверка на физическом iPhone проводится на этапе приёмки заказчиком.
