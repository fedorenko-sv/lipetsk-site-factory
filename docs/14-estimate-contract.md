# Core B: окна → предварительный расчёт → заявка

Версия дополнения: 1.0.0, 18.11.2026. Существующий Booking OpenAPI 1.0.0 не меняется. Новый транспорт POST /api/estimates имеет те же ограничения Origin, размера, JSON, идемпотентности и режимов.

## Параметры WindowParameters

- product: window или balcony-door.
- widthMm: целое 600–2400, шаг 100.
- heightMm: целое 600–2400, шаг 100.
- quantity: целое 1–6.
- glazing: double или triple.
- finish: white или graphite.
- installation: boolean.

Неполные, дополнительные, нечисловые, дробные и выходящие из диапазона значения отклоняются. Дополнительные поля внутри параметров и корня запрещены. Расчёт не является офертой; цены демонстрационные.

## Формула

Ставки хранятся в examples/calculators/estimate.json. Площадь — widthMm × heightMm / 1 000 000. Строки: конструкция, добавка за стеклопакет, выбранный цвет, монтаж. Округление каждой строки до целой копейки выполняется один раз; затем строки складываются. Количество учитывается в каждой строке. Формула версионируется; никаких eval или исполняемых формул в JSON.

EstimateQuote содержит formulaVersion, currency=RUB, totalMinor, breakdown и assumptions. Клиент показывает ту же чистую формулу, которую сервер запускает независимо.

## Пример запроса

~~~json
{
  "siteKey": "estimate",
  "configVersion": "demo-2026-11-18",
  "kind": "estimate",
  "parameters": {
    "product": "window",
    "widthMm": 1200,
    "heightMm": 1400,
    "quantity": 1,
    "glazing": "double",
    "finish": "white",
    "installation": true
  },
  "customer": { "phone": "+70000000000" },
  "consent": { "accepted": true, "version": "demo-2026-11-18" },
  "antiBot": { "website": "" }
}
~~~

Заголовок Idempotency-Key — UUID, как в Core A. Отдельные поля клиентской цены, адреса, свободного комментария и обязательного preferred отсутствуют. Канал администратора определяется приватно по siteKey.

## Ответы

- 201: создана одна заявка и outbox, возвращён LeadReceipt.
- 200: тот же нормализованный запрос с тем же ключом, тот же leadId.
- 409 IDEMPOTENCY_CONFLICT: прежний ключ использован с другими параметрами/контактом.
- 409 CONFIG_CHANGED / CONSENT_CHANGED: новая версия требует повторного ознакомления.
- 422 VALIDATION_FAILED: пути parameters.widthMm и других полей, customer.phone, consent.accepted.
- 429: общий persistent limiter, Retry-After.
- 503: неготовый режим/хранилище; UI не показывает квитанцию.

Квитанция сохраняет строгие поля leadId/status/replayed/message существующего HTTP-клиента. Она не создаёт видимость согласованной сметы или записанного замера.

## Хранение и повтор

kind=estimate, service_id=product, service_options=канонические строковые параметры. price_snapshot содержит пересчитанные totalMinor, breakdown, assumptions, formulaVersion и параметры. Дата пожелания null. Сохраняется атомарно с outbox.

Канон включает kind, siteKey, configVersion, параметры, нормализованные контакт/согласие. Порядок ключей и форматирование допустимого телефона не меняют смысл. Идентичный replay проверяется до актуальности версии; сохранённая заявка не теряется после обновления формулы.

## Приёмка

Сервер отвергает подменённую цену и лишние поля; пересчитывает известный пример; два параллельных одинаковых запроса дают один lead/outbox. Новый payload со старым ключом даёт 409. Ошибка БД — 503 без успеха. Browser smoke сверяет UI leadId с БД и сохранённой серверной суммой.
