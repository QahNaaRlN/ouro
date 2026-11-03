# SQ · Квалификация HTTP adapter отдельного сервиса

Дата: 2026-11-04. Статус: контракт ограниченного story; реализация разрешена владельцем как часть миграции Ouro. Основание — принятые [D01–D16](../proposals/react-vite-migration/decisions.md), особенно D05/D06/D14/D16.

## Проблема и результат

Next сейчас обслуживает 47 файлов API-маршрутов и владеет рабочим хранилищем. Перед выделением сервиса необходимо доказать, что выбранный основной кандидат Hono корректно переносит Web Request/Response через реальный Node HTTP listener: cookies, raw body, методы, progressive SSE, abort, errors и background lifecycle.

Результат story — пригодный для дальнейшего сервиса HTTP adapter с явными обработчиками и lifecycle плюс квалификация на изолированных зависимостях. Это не переключение API, не готовность всех 47 маршрутов и не native acceptance.

## Область

- Собственный пакет `apps/service` с exact dependency pins и lockfile; root package и текущие способы запуска сохраняются.
- `apps/service` исключается из root Next tsconfig как отдельный project boundary. Собственные strict typecheck/build и install/test/typecheck/build в CI обязательны; тесты находятся внутри `apps/service/tests`. Hono не становится зависимостью Next или production image.
- Node 24.19.0 из явно переданного runtime; настройки системного Node не меняются.
- Web Request/Response handler contract и ограниченная серверная таблица маршрутов без generic HTTP proxy.
- Loopback listener, port 0 для проверок, явный stop с ограниченным drain и освобождением активных соединений.
- Квалификационные композиции используют реальные factories `createUserAuthHandlers`, `createProjectStreamHandler`, `createGitHubHandlers`, `checkHealth`; все зависимости задаются явно.
- Никаких defaults к рабочим DATABASE_URL/OURO_DATA_DIR, production credentials, SMTP/GitHub, filesystem workspace или процесса verification runner. При необходимости тестовое хранилище — один memory fixture с явным закрытием.
- Все рабочие API-маршруты и рабочий PGlite остаются у Next. Атомарное переключение всех серверных обращений — последующий story.
- Полная замена собственных CSS на Tailwind 4 — обязательство UI-части эпика и не изменяется этим backend story.

## Наблюдаемые критерии

| ID | Критерий |
|---|---|
| SQ01 | Handler и route table принимают стандартные Request/Response; Hono-specific types не нужны application handlers; отсутствует произвольный proxy URL/method/body из пользовательского документа |
| SQ02 | Существующий auth factory через TCP сохраняет три отдельных Set-Cookie, HttpOnly/SameSite/Path/Max-Age и JSON/no-store; подмена Host/Origin не обходит guards |
| SQ03 | Существующий webhook factory получает исходные bytes: whitespace/Unicode/chunking не нарушают HMAC; неверная подпись не вызывает enqueue |
| SQ04 | Ограничения body задаются явно для операции; generic 256000 bytes и webhook 2 MiB не смешиваются; chunked oversized request отклоняется без вызова application handler |
| SQ05 | Методный контракт сохраняет Next: HEAD использует GET с пустым body и cleanup исходного body; OPTIONS=204 с отсортированным Allow; unsupported=405; явный MCP-style 405/Allow не переписывается; unknown route=404 без SPA |
| SQ06 | Существующий SSE factory выдаёт первый frame до окончания ответа и дальнейший frame при обновлении; SSE headers сохраняются; client abort и server stop отменяют signal и освобождают stream/polls |
| SQ07 | Ошибка adapter/handler получает безопасный JSON 500 и независимое очищенное reporting; reporter failure не меняет результат и не запускает рекурсию; ожидаемый factory error сохраняет code/status |
| SQ08 | Background task принимает явный owner и AbortSignal: ответ не ждёт task, enqueue application effect происходит до ответа; задачи запускаются после завершения response, наблюдаются, имеют ограниченную очередь и drain; shutdown прекращает admission, отменяет task signals и корректно сообщает timeout; кооперативная task освобождает настоящий таймер до завершения stop |
| SQ09 | Повторный stop идемпотентен; новые обращения после остановки не принимаются; активный SSE не удерживает process; незавершаемая task не превращает stop в бесконечное ожидание |
| SQ10 | Типы strict, без any; новые комментарии source/tests — JSDoc; собственные tests используют настоящий HTTP/TCP; qualification не выводится только из app.fetch или mock transport |

## Проверка и граница доказательства

Сначала фиксируются исполнимые тесты и запускаются против минимального adapter с намеренно отсутствующими нужными гарантиями. Отсутствующая зависимость/модуль не считается meaningful RED. Затем adapter исправляется и те же assertions становятся GREEN.

Существующие factories не заменяются их копиями. Fixture stores ограничены нужными typed interfaces, не подтверждают SQL durability. Реальная транспортная квалификация не означает проверку всего auth/store, PostgreSQL, packaged deployment, native WebView2 или всех UI-сценариев. Закрытые здесь и оставшиеся критерии перечисляются отдельно в [журнале](../plans/service-qualification.md).

Next guides прочитаны в исходном checkout из установленного `next@16.4.3`: `01-app/01-getting-started/15-route-handlers.md`, `01-app/03-api-reference/03-file-conventions/route.md`. Автоматические HEAD/OPTIONS дополнительно сверены с `server/route-modules/app-route/helpers/auto-implement-methods.js`.

Ориентиры adapter: [Hono Node.js](https://hono.dev/docs/getting-started/nodejs), [официальный Node adapter](https://github.com/honojs/node-server). Exact версии и фактические результаты фиксируются в журнале после установки и запуска.
