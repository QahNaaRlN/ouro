# SDD/TDD · OURO-ENG-000004

[Контракт](../specs/github-evidence.md). До реализации проверяются наблюдаемые RED, затем минимальный код/GREEN.

| Область | RED | GREEN |
|---|---|---|
| Binding/Action/revision | 0/4: команды/проверенный источник отсутствовали | Домен сохраняет точный контекст, запрещает forged source, отделяет Action от результата/DoD |
| HMAC/API/provenance | Начальный1/10: отсутствовали raw HMAC и runtime API verification | 10/10: исходные Unicode-байты, пределы, фиксированный API host, SHA/repository mismatch, безопасные ошибки |
| Durable queue/dedupe/rollback | Отсутствовали HTTP/worker; отдельный RED на запись после истечения lease | Реальные SQL reopen/rollback, оба dedupe уровня, revoke во время await, четыре регрессии lease |
| Общие регрессии | База alpha.4:88 unit/integration +22 E2E | 129/129 unit/integration; браузерный и production gate — ниже |

Данные и процессы preview3000/3001 не изменяются. Тесты независимы от секретов, реальные внешние доставки отмечаются отдельно от controlled-server fixtures.

Независимое ревью нашло существенную ошибку: проверка lease учитывала token/status, но не истечение времени, пока другой worker ещё не забрал job. Четыре реальные SQL-проверки дали RED для ingest/finish/fail и попытки оживить lease через semantic receipt. Теперь срок проверяется в той же транзакции; прочитать прежний receipt можно, продлить истёкший lease нельзя.

Runtime-проверка без токена через публичный GitHub API подтвердила repository ID1437340745 и SHA5a164cbbab457c220765333baaf1860d30c3e7de. Для Node24 в управляемом proxy-окружении потребовался NODE_USE_ENV_PROXY=1. Настройка настоящего webhook в GitHub и внешняя push-доставка не выполнялись; HTTP/worker интеграция проверена управляемыми fixtures и настоящим SQL.

Итоговый gate alpha.5:129/129 unit/integration, typecheck и production build успешны. Все25 прежних браузерных сценариев прошли на production-сервере. Добавлены3 controlled UI сценария: create/revoke с исходной r1 после r2, source/retry, pinned version и replayed receipt. В общем прогоне было27/28: последний новый тест ошибочно выбирал также Next route announcer с role=alert; после уточнения locator повтор новых3/3 успешен. До этого исправлена fixture-ссылка на кнопку refresh из скрытого aside: controlled native SSE теперь доставляет snapshot, не используя реальную БД. Assertion поведения не ослаблен. Первый dev-прогон прервала переустановка зависимостей, поэтому проверка повторена на неизменяемой production-сборке.
