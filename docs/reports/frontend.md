# Отчёт разработчика 1 — полный интерфейсный блок PR-3 (Auto и Beauty)

## 1. Сводка блока
- **Ветка:** `codex/frontend-pr3`
- **Пакет:** PR3-BATCH-2 + Единый пакет исправлений FR1–FR5
- **Статус:** Готов к приёмке (Ready for acceptance)
- **Ядро:** Общий `BookingFlow` из трёх обязательных шагов (оффер/прайс → параметры/время → контакт/согласие/результат) для сайтов `auto` и `beauty`.
- **Темы:** `technical` (графит + янтарный функциональный акцент) для Auto, `editorial` (спокойный светлый фон + бордовый акцент) для Beauty на основе CSS-токенов.

---

## 2. Реализация пакета исправлений FR1–FR5

### FR1 (P1): Полный жизненный цикл транспортного таймаута
- В `src/features/booking/client/lead-client.ts` таймаут расширен на весь цикл запроса: DNS/connect, передача заголовков, чтение всего потока тела ответа (`ReadableStream`), парсинг JSON, а также чтение тела ошибки HTTP.
- Таймер `timeoutMs` (по умолчанию 15000 мс, настраиваемый для тестов) очищается строго в блоке `finally` после полного завершения чтения.
- При зависании тела ответа (FR1b: 201 headers получены, body завис; FR1c: 503 headers получены, error body завис) срабатывает `controller.abort()`, прерывая чтение потока с `SubmitError` (`kind: "timeout"`).
- Внешний `options.signal` поддерживается до и во время запроса; слушатели и таймеры гарантированно очищаются во всех ветках без утечек памяти.
- При таймауте форма не сбрасывается, `idempotencyKey` и введённые данные сохраняются для безопасного ручного повтора.

### FR2 (P1): Строгая валидация квитанции заявки (`isReceiptValid`)
- `isReceiptValid` валидирует соответствие ответа схеме `LeadReceipt` и `contracts/openapi.json`:
  - `leadId`: строгий wire UUID формат (regex `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`), отсекающий значения вроде `"not-a-uuid"`.
  - `status`: строго `"received"`.
  - `replayed`: строго `boolean`.
  - `message`: строка длиной 1..300 символов.
  - `additionalProperties: false`: наличие любых недопустимых полей отклоняется.
- Ответы 200/201 с некорректным телом выбрасывают `SubmitError` с `kind: "invalid-response"`; ложный экран успеха `lead-success` исключён.

### FR3 (P1/P2): Маршрутизация серверных ошибок и управление фокусом
- Серверные ошибки валидации 422 для параметров шага 2 (`preferred.time`, `preferred.date`, `preferred`, `serviceId`, `resourceId`, `serviceOptions.*`):
  - При возникновении на шаге контактов отображается доступный блок сводки ошибок шага 2 (`data-testid="step2-error-summary"`).
  - Сводка содержит кнопку перехода «← Перейти к исправлению параметров» (`data-testid="fix-step2-errors"`).
  - При переходе на шаг 2 `fieldErrors` не затираются (`GO_TO_STEP` сохраняет ошибки), поле `preferred-time` получает `aria-invalid="true"`, `aria-describedby` и автоматический фокус.
- Поля шага контактов (`customer.phone`, `customer.name`, `consent.accepted`):
  - Связаны со стабильными идентификаторами ошибок через `aria-describedby` (`err-customer-phone`, `err-customer-name`, `err-consent`) и `aria-invalid`.
  - При ошибке фокус автоматически переносится на первое ошибочное поле или сводку ошибок, исключая зависание фокуса на `BODY`.
- Обработка конфликтов 409:
  - `CONFIG_CHANGED`: выводится предупреждение об изменении цен/услуг и кнопка «Обновить страницу» (`lead-reload-config`); скрытый автоповтор исключён.
  - `CONSENT_CHANGED`: согласие сбрасывается (`consentAccepted: false`), чекбокс снимается, блокируя слепой повтор до явного подтверждения пользователем.

### FR4 (P2): Защита от унаследованных свойств прототипа
- В `src/config/sites/index.ts` словарь `configs` создан через `Object.create(null)` с явной проверкой `Object.hasOwn(configs, siteKey)`.
- Маршруты `/demo/constructor`, `/demo/toString`, `/demo/__proto__`, а также их страницы политики `/demo/.../privacy` отдают честный статус 404 (`notFound()`) в `page.tsx` и `privacy/page.tsx`.
- Функция `generateMetadata` для неизвестных сайтов возвращает `{ title: "Сайт не найден", robots: { index: false, follow: false } }`, не вызывая падений 500 на чтении `config.hero`.

### FR5 (P1 для приёмки): Достоверные тесты поведения
- Все тесты, проверявшие локальные константы или переменные, заменены на реальные проверки поведения компонентов, транспорта и страниц:
  - `FU15`: проверяет реальный вызов транспорта при параллельных попытках submit (ровно 1 вызов).
  - `FU16`: проверяет реальную гонку двух Promise (поздний ответ старой попытки не перезаписывает состояние).
  - `FU18`: вызывает реальный `submitLead` с макетами `Response` для всех кодов (400, 403, 404, 409, 413, 415, 422, 429, 500, 503, HTML 502).
  - `FU19`: выполняет строгий парсинг `Retry-After` (целое число, отсечение "30s", отрицательных, нулей и мусора).
  - `FU20`: выполняет реальный запуск таймеров таймаута, внешний abort, а также сценарии зависшего потока тела (FR1b/FR1c).
  - `FU21–FU24`: новые юнит-тесты на защиту от prototype lookup, receipt guard, маршрутизацию ошибок 422 и 409.
  - `FE19`: проверяет полный клавиатурный цикл прохождения всех трёх шагов через Tab, стрелки, Space и Enter.
  - `FE21`: применяет реальный зум 200% и проверяет отсутствие горизонтального скролла (`scrollWidth <= clientWidth + 2`) и кликабельность CTA.
  - `FE22`: проверяет layout на длинных текстах ошибок (200+ символов) без развала вёрстки.
  - `FE24`: проверяет возврат статуса 404 в браузере для `/demo/constructor`, `/demo/toString`, `/demo/__proto__` и их privacy-страниц.
  - `FE26`: подписывается на события `page.on('console')` до ввода данных и проверяет отсутствие номера телефона в логах консоли, `localStorage` и `sessionStorage`.
  - `FE27`: проверяет генерацию двух различных UUID для заголовка `Idempotency-Key` при повторной отправке и очистку формы.
  - `FE29–FE30`: браузерные проверки отклонения невалидной квитанции (not-a-uuid) и интерактивной обработки 422 `preferred.time`.

---

## 3. Таблица Unit-тестов чистой логики (FU01–FU24)
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
| FU15 | Повторный submit во время submitting | Ровно 1 реальный transport call | `tests/ui/booking-logic.test.mjs` | PASS |
| FU16 | Поздний ответ старой попытки | Не перезаписывает текущий state | `tests/ui/booking-logic.test.mjs` | PASS |
| FU17 | Receipt guard | Только валидный 200/201 даёт успех | `tests/ui/booking-logic.test.mjs` | PASS |
| FU18 | Error mapping всех HTTP codes | Проверка всех кодов через submitLead | `tests/ui/booking-logic.test.mjs` | PASS |
| FU19 | Retry-After | Строгий парсинг целых секунд (без "30s") | `tests/ui/booking-logic.test.mjs` | PASS |
| FU20 | Abort/timeout | Реальный таймер, внешний signal, stream | `tests/ui/booking-logic.test.mjs` | PASS |
| FU21 | FR4: Prototype lookup | getSiteConfig защищен от constructor/__proto__ | `tests/ui/booking-logic.test.mjs` | PASS |
| FU22 | FR2: Receipt guard details | Отклонение не-UUID и лишних полей | `tests/ui/booking-logic.test.mjs` | PASS |
| FU23 | FR3: 422 error routing | Ошибки preferred.time сохраняются при возврате | `tests/ui/booking-logic.test.mjs` | PASS |
| FU24 | FR3: 409 CONSENT_CHANGED | Сброс согласия для явного подтверждения | `tests/ui/booking-logic.test.mjs` | PASS |

---

## 4. Таблица Browser-тестов (FE01–FE30)
Запуск: `npm run test:e2e` (Chromium + WebKit, 60 тестов)

| ID | Сценарий | Ожидание | Файл / Тест | Результат |
| --- | --- | --- | --- | --- |
| FE01 | Auto первый экран, 3 цены и CTA | Демо/цены читаемы, данные из конфига | `tests/e2e/booking.spec.ts` | PASS (Cr, Wk) |
| FE02 | Полный Auto happy path | Три шага и валидный POST/receipt | `tests/e2e/booking.spec.ts` | PASS (Cr, Wk) |
| FE03 | Полный Beauty happy path | То же ядро, optional мастер | `tests/e2e/booking.spec.ts` | PASS (Cr, Wk) |
| FE04 | Beauty без мастера | resourceId отсутствует в POST | `tests/e2e/booking.spec.ts` | PASS (Cr, Wk) |
| FE05 | Required wheel-size не выбран | Ошибка и нет перехода | `tests/e2e/booking.spec.ts` | PASS (Cr, Wk) |
| FE06 | Нет даты/времени, нерабочий день | Нет перехода, ошибка поля | `tests/e2e/booking.spec.ts` | PASS (Cr, Wk) |
| FE07 | Некорректный/пустой телефон | Нет POST, ошибка, focus и aria-describedby | `tests/e2e/booking.spec.ts` | PASS (Cr, Wk) |
| FE08 | Неотмеченное согласие | Нет POST, focus и aria-describedby | `tests/e2e/booking.spec.ts` | PASS (Cr, Wk) |
| FE09 | Назад и редактирование | Данные сохранены, сводка актуальна | `tests/e2e/booking.spec.ts` | PASS (Cr, Wk) |
| FE10 | Двойной click/Enter | Ровно один запрос к серверу | `tests/e2e/booking.spec.ts` | PASS (Cr, Wk) |
| FE11 | Network abort → ручной retry | Ввод и key прежние | `tests/e2e/retry.spec.ts` | PASS (Cr, Wk) |
| FE12 | Timeout → retry | Ввод и key прежние, нет ложного успеха | `tests/e2e/retry.spec.ts` | PASS (Cr, Wk) |
| FE13 | 422 fieldErrors | Ошибки у соответствующих полей | `tests/e2e/retry.spec.ts` | PASS (Cr, Wk) |
| FE14 | 409 config/consent | Нет автоповтора/автосогласия, явные действия | `tests/e2e/retry.spec.ts` | PASS (Cr, Wk) |
| FE15 | 429 Retry-After | Кнопка/статус согласно cooldown | `tests/e2e/retry.spec.ts` | PASS (Cr, Wk) |
| FE16 | 500/503 | Поля сохранены, повтор возможен | `tests/e2e/retry.spec.ts` | PASS (Cr, Wk) |
| FE17 | 200 с HTML/битым JSON | Не показывает успех, выдаёт ошибку | `tests/e2e/retry.spec.ts` | PASS (Cr, Wk) |
| FE18 | Повтор receipt 200 replayed | Тот же результат и прежний leadId | `tests/e2e/retry.spec.ts` | PASS (Cr, Wk) |
| FE19 | Клавиатура всех шагов и radio | Полная навигация без мыши (все 3 шага) | `tests/e2e/accessibility-responsive.spec.ts` | PASS (Cr, Wk) |
| FE20 | Модальное окно / отсутствие dialog | Отсутствие блокирующего диалога | `tests/e2e/accessibility-responsive.spec.ts` | PASS (Cr, Wk) |
| FE21 | 360/390/430/1280 и zoom 200% | Нет overflow, CTA доступен при зуме | `tests/e2e/accessibility-responsive.spec.ts` | PASS (Cr, Wk) |
| FE22 | Длинная услуга/ошибка | Layout устойчив, текст оборачивается | `tests/e2e/accessibility-responsive.spec.ts` | PASS (Cr, Wk) |
| FE23 | Иной timezone браузера | Europe/Moscow сохраняется в POST | `tests/e2e/accessibility-responsive.spec.ts` | PASS (Cr, Wk) |
| FE24 | Unknown site и prototype keys | 404 для constructor, toString, __proto__ | `tests/e2e/security-routes.spec.ts` | PASS (Cr, Wk) |
| FE25 | Privacy/метаданные/noindex | Правильный режим и ссылки | `tests/e2e/security-routes.spec.ts` | PASS (Cr, Wk) |
| FE26 | Console/Storage/URL | Подписка до ввода, нет утечки телефона | `tests/e2e/security-routes.spec.ts` | PASS (Cr, Wk) |
| FE27 | Новая заявка после успеха | Очистка полей, разные UUID Idempotency-Key | `tests/e2e/security-routes.spec.ts` | PASS (Cr, Wk) |
| FE28 | Без backend и без route mock | Честная ошибка связи, не ложный успех | `tests/e2e/security-routes.spec.ts` | PASS (Cr, Wk) |
| FE29 | FR2: Невалидный receipt | 201 с non-uuid leadId выдаёт ошибку | `tests/e2e/security-routes.spec.ts` | PASS (Cr, Wk) |
| FE30 | FR3: 422 preferred.time | Сводка ошибок, возврат на шаг 2 и focus | `tests/e2e/security-routes.spec.ts` | PASS (Cr, Wk) |

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
- `npm run lint`: exit 0 (0 errors, 0 warnings)
- `npm run typecheck`: exit 0
- `npm run test:ui`: exit 0 (24 passed, 0 failed)
- `npm run build`: exit 0 (SSG/статическая генерация всех маршрутов)
- `npm run test:e2e`: exit 0 (60 passed, 0 failed: 30 в Chromium, 30 в WebKit)
- `npm run verify:frontend`: exit 0

---

## 7. Ограничения
- В демонстрационном режиме валидным телефонным номером является исключительно синтетический номер `+70000000000`.
- В standalone-режиме фронтенда endpoint `POST /api/leads` перехватывается в browser-тестах через `page.route`; для интеграционного и системного тестирования необходим бэкенд разработчика 2 (Hermes) с запущенной PostgreSQL.
- Тестирование WebKit выполнено на Playwright WebKit (Windows build); проверка на физическом iPhone проводится на этапе приёмки заказчиком.
