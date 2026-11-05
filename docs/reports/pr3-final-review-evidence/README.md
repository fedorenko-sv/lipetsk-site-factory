# Свидетельства финального контроля

Эти материалы получены на объединённом снимке a4d50f7b3dacd173a905028a1aa41a5b3787dcbe (origin/codex/pr3-final-review), не на одном из раздельных checkout разработчиков.

- verify-release.log.txt — полный штатный прогон, exit 0; 48 + 20 + 33 + 56 + 6 passed, один system skip.
- backend-probes.log.txt — дополнительные отрицательные пробы с настоящим PostgreSQL и CLI.
- browser-observations.json — три настоящих UI/API/DB/worker/replay пути и отдельные отрицательные HTTP fixtures.
- slow-body-result.json — зависание body после headers за транспортным дедлайном.
- *.png — собственные синтетические browser-свидетельства архитектора, 390px.
- *.mjs.txt — исходники отдельных воспроизводящих диагностик; расширение txt сохраняет их как свидетельства вне общего lint/test-контура. Это не подмена обязательных регрессионных тестов разработчиков.

## Повторное воспроизведение

Использовать отдельный checkout объединённого снимка, Node 22, npm ci и только локальный тестовый PostgreSQL из db/compose.test.yml (127.0.0.1:55543). Не запускать в папке чужого работающего checkout. Код browser-аудита требует свежий npm run build и установленный Playwright Chromium.

Из такого checkout получить исходники свидетельств из origin/main в игнорируемую папку:

~~~powershell
New-Item -ItemType Directory -Force work/review | Out-Null
git show origin/main:docs/reports/pr3-final-review-evidence/backend-probes.mjs.txt | Set-Content -Encoding utf8 work/review/backend-probes.mjs
git show origin/main:docs/reports/pr3-final-review-evidence/slow-body.mjs.txt | Set-Content -Encoding utf8 work/review/slow-body.mjs
git show origin/main:docs/reports/pr3-final-review-evidence/browser-audit.mjs.txt | Set-Content -Encoding utf8 work/review/browser-audit.mjs
node --experimental-strip-types work/review/backend-probes.mjs
node --experimental-strip-types work/review/slow-body.mjs
node --experimental-strip-types work/review/browser-audit.mjs
~~~

Диагностические скрипты печатают фактическое наблюдение и ожидаемый исход. Их exit 0 означает завершение диагностики и cleanup; наличие дефекта определяется расхождением actual/expected в JSON. При исправлениях разработчик обязан перенести случаи в настоящий test runner с проверяющими assert.

PostgreSQL-пробы создают собственные уникальные пустые локальные БД и удаляют их в finally. Проверка query host override только разбирает строку драйвером: к example.invalid не подключается. При любой инфраструктурной ошибке материалы не считаются подтверждением прохождения сценария.
