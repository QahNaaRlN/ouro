# OURO-ENG-000003 · Realtime и согласованные фильтры

SDD · 29.10.2026 · следующий пакет после Flow alpha.3. Изолированная рабочая копия и БД; тестируемая пользователем alpha.2 остаётся на порту3000.

## Контракт

Human-only `GET /api/stream?after=N` доставляет SSE snapshot из committed SQL-store: `event:snapshot`, `id:state.version`, JSON `{state,cursor,storage}`, cursor равен version. `Last-Event-ID` имеет приоритет над after при reconnect. Safe nonnegative integer, invalid422, ahead409 до открытия stream. Origin/Host проверяются, нет CORS*. Browser cookie/human bearer авторизуются; legacy/registered agent не получают полный stream. Ключи не передаются в URL.

Начальное соединение отдаёт актуальный snapshot (включая equal cursor как подтверждение состояния); затем frame только при изменении версии. Heartbeat комментарий без продвижения ID. Проверка SQL одним последовательным loop/pull без длительной транзакции, примерно500ms, heartbeat15s. Это SSE с чтением БД, не заявленный outbox broker. `no-store,no-transform`, `X-Accel-Buffering:no`. Bounded queue/backpressure, abort/cancel освобождает timer и прекращает чтения, in-flight результат после abort отбрасывается. Короткая жизнь подписки≤55секунд либо повторная проверка auth предотвращает бесконечное действие истёкшей сессии.

Клиент bootstrap snapshot→EventSource, применяет полный snapshot синхронно и монотонно. Единственный snapshot-adopter для refresh/команд/конфликтов/simulator/SSE проверяет project/cursor/version и не откатывается от позднего GET. Equal snapshot не дублирует историю. Native reconnect возвращается от последнего доставленного ID; он безопасен потому что frame содержит всю историю и применяется до возврата callback. Некорректный frame вызывает явное recovery от применённого cursor; reset/ahead сервера показывается как требование reload, без тихой потери данных. Connected только после принятого snapshot; onerror показывает переподключение.

Ни reconnect, ни snapshot не меняют selected/requestId/tab/modal/layout/filter. Незавершённые decision/spec/acceptance/Flow формы сохраняют текст и pinned base revision/version; другой ответ/активация не переиспользует прежний текст для нового ожидания. При конфликте нет автоматической повторной записи. Фокус не перескакивает при приходе данных.

Фильтры Roadmap «Агент» и «Открытый запрос» используют один pure predicate для графа/таблицы. Учитывается активная ревизия; совместные agent+kind должны относиться к одному pending request, чтобы не смешать вопрос агентаA с блокеромB. Simulator/revoked IDs имеют честные подписи. Global attention counter остаётся видимым. Выбранная вне фильтра спека не заменяется молча.

## AC и TDD

| ID | Проверяемое поведение |
|---|---|
| R01 | Auth/Origin/Host/cursor/header precedence и HTTP headers |
| R02 | Настоящий store commit→snapshot; rollback/idempotent receipt не создают ложного frame |
| R03 | Reconnect с cursor восполняет committed историю, duplicate не дублирует, старый frame/GET не откатывает UI |
| R04 | Cancel/abort и backpressure не оставляют активные timers/чтения/unhandled rejection |
| R05 | Offline/recovery явно видны и не меняют доменные статусы |
| R06 | Decision/spec/acceptance/Flow draft, фокус, выбор/камера переживают внешнее событие; база не подменяется |
| R07 | Graph/table фильтры совпадают; agent+kind коррелированы, старые ревизии исключены |
| R08 | Все прежние unit/E2E + typecheck/build зелёные, отдельный SQL/HTTP client тест |

До кода фиксируется RED наблюдаемого поведения; environment failures не считаются предметным RED. Ориентиры: [WHATWG EventSource](https://html.spec.whatwg.org/multipage/server-sent-events.html), [MDN SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events), [Next Route Handlers streaming](https://nextjs.org/docs/app/api-reference/file-conventions/route#streaming), текущий [CQRS/event sourcing research](../methodology-research.md). Изучить используемые разделы непосредственно перед реализацией.
