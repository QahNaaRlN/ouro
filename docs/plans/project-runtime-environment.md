# Project runtime environment · журнал

База: `e93e34c56e792dcf28ee2e3cf98b96766f9e15da`. Ветка `codex/project-runtime-environment`; интеграция только в эпик после обязательного CI. [Контракт](../specs/project-runtime-environment.md).

1. Зафиксировать обязательные DI и убрать implicit HTTP/browser defaults из переносимой фабрики.
2. Подключить прежние web зависимости в одном compatibility composition adapter; общий source ID использовать и для catalog reads.
3. Проверить scope/owner/UNKNOWN и границы imports; затем квалифицировать совместный head.

Source changes: **IMPLEMENTED_LOCAL**. Полный embedded/native runtime и multi-host pending storage: **NOT_IMPLEMENTED**.

## Локальные результаты

- Установлены неизменённые root/web lockfiles с pinned Node24.19.0, offline ci/ignore-scripts. Это подготовка проверки, не consumer delivery qualification.
- Фактическая прежняя фабрика из exact base была временно подставлена в собственной worktree, после чего исходник кандидата восстановлен в `finally`. PRE01–04 дали четыре поведенческих RED: отсутствующее окружение принималось, source оставался same-origin, изменение входной configuration перенаправляло ports, ошибка connectivity оставляла активного owner. Setup failures в этот RED не включались.
- После исправления PRE01–04 и два существующих runtime/UNKNOWN/exact-retry случая:6/6 PASS.
- Добавлен PRE05 для ошибки последнего connectivity cleanup: повторный release не повторяет cleanup, session завершается и новая аренда получает нового owner.
- Полный целевой набор `project-runtime-environment`/`project-session-runtime`/`http-command-receipt`: **34/34 PASS**,0 skipped/cancelled. Он включает прежние durable receipt, потерю/повреждение ответа и исходный exact retry; новые semantic fixtures не выдаются за реальный native transport.
- Root/web types и architecture/migration/style guards выполняются; build/browser/full CI пока **NOT_RUN** для этой ветки. Результат первого локального GREEN не заменяет финальную проверку integration head.

## Peer и расширенная квалификация lifecycle

- PRE06 actual RED: `session.start()` + throwing subscription.close оставляли view активным и запись registry переиспользуемой. Исправлено: terminal state и удаление записи registry до вызова port cleanup, попытка каждого собственного cleanup, игнорирование поздних snapshots.
- PRE07 actual RED: access revocation + throwing close оставляли публичную Query projection активной. Первая fixture teardown маскировала assertion своим повторным close error; fixture cleanup уточнён, отдельный saved RED содержит `true !== false`. Это не environment/setup RED.
- PRE08/09 actual RED: throwing state observer останавливал revoke и превращал подтверждённое чтение в failure. Теперь observers изолированы безопасным capture; access capture не публикует промежуточное активное представление. Один candidate ошибочно использовал operation `async` вместо существующего `async-operation`: policy отвергла метаданные, два теста закономерно не прошли. Исправлен operation literal, политика не ослаблялась.
- Промежуточный набор после PRE06/07:78/78 PASS и root/web types/guards PASS. После PRE08/09 финальный расширенный набор и strict types повторяются из-за реального source fix; предыдущий результат не переносится на новый head автоматически.

## Финальный локальный checkpoint

После последнего исправления observer metadata: **97/97 PASS**,0 skipped/cancelled в восьми suites (`project-runtime-environment`, `project-session-runtime`, `project-session`, `project-session-http`, `http-command-receipt`, `client-error-policy`, `catalog-read-query`, `catalog-read-http`). PRE06–09 GREEN, включая реально запущенную subscription, поздние callbacks, очистку Query projection, сохранность принятого чтения и safe reporter без synthetic secret. Независимый read-only peer принял последний delta.

Root и web strict types — PASS. Architecture892files/0violations/11exactlegacyedges; HTTP inventory47routes/59methods; style guard2ordinaryCSS/3inlinefiles/0violations — PASS. Ordinary style debt и geometry policy этим срезом не меняются. Builds/real browser/final combined CI пока не запускались локально для этой истории; обязательны на опубликованном integration head. Локальное heavy окно освобождено.

## Первый CI head

PR72 `55ca64cbeb8502673935d7daac7fde8d121b6fa7`: consumer-source job126881915656 завершился FAIL в общем phase `RUNNER_AND_BROWSER`. Сохранён original qualification report в собственном ignored `.operations/pr72-consumer-FAIL`; все предыдущие phases, включая independent install/build249sourcefiles, strict HTML672/672, assets, SSE, issued MCP и persisted restart/exact receipt — PASS. Browser installation и actual runner прежде делили один phase и не сохраняли exit/signal/tool error code; отчёт не позволяет установить причину. Длительность сама по себе не доказывает timeout или product regression.

В qualifier добавлены отдельный `BROWSER_INSTALL` phase и конечные numeric/allowlisted tool diagnostics (exitCode/signal/errorCode/elapsed/deadline). Raw stdout/stderr/config/HTTP/SDK errors по-прежнему не попадают в отчёт. Deadlines, browser cases, command assertions, independent graph и критерии PASS не меняются. Это диагностическая правка harness; новый head требует нового CI, прежний FAIL не переклассифицирован.
