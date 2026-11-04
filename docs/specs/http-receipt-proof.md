# HRP · Durable HTTP command receipt proof

Дата: 2026-11-04. Ветка `codex/http-receipt-proof`, база `3d568a8` (`codex/project-session`). Реализация истории разрешена; normalized digest и header policy одобрены root review **до кода**. Production cutover, push и изменение рабочих данных не входят в задачу.

## Проблема и evidence

`tests/migration-rehearsal.test.ts:42–44` сохраняет настоящий исторический `ouro_command_receipts` row с успешным response `{state, events:[], cursor}`. Store возвращает его неизменным при exact replay после нынешних actor/role guards (`lib/store.ts:284–294`). Client намеренно не подтверждает пустую партию или legacy события без requestId (`packages/client/src/http/workspace-intent-proof.ts:53–63`): один валидный snapshot не связывает ответ с исходной командой. Поэтому успешный исторический результат остаётся UNKNOWN.

`lib/project-snapshot.ts:63–71` уже нормализует только отсутствующие пустые derived verification collections, если core replay доказывает их пустоту; raw immutable receipt не меняется. Хеш raw JSONB нельзя сравнивать с этим normalized view.

## Предлагаемый HTTP v1

Один bounded ASCII header `X-Ouro-Command-Receipt: v1.<base64url(UTF-8 canonical metadata)>`, максимум 4096 символов. Metadata имеет только `projectId`, `actorId`, `requestId`, `payloadSha256`, `servedBodySha256`, `cursor`. Идентификаторы ограничены прежними пределами, SHA-256 — 64 lowercase hex, cursor — safe nonnegative integer. Неизвестные поля/версия, дублированный или неканонический encoding, неверный UTF-8/JSON, переполнение и несовпадение полей не дают подтверждения.

Header обслуживает только POST `/api/commands`, `/api/projects/:projectId/commands`, `/api/projects/:projectId/tasks`, в совместимых Next wrappers и service bindings. Это same-origin HTTP causal contract, не signature, внешняя attestation или доказательство исторических сетевых байтов. JSON body, MCP tools/результаты, schemas/versions, domain events и stored rows не меняются. Каталог, binding recovery, verification runner, SSE и другие receipt tables не получают этот header.

## Provenance и COMMIT

Server-only `executeCommandWithReceipt` использует private общий execute, возвращающий `{result,row}`, с тем же commit path, что прежний `executeCommand`. Последний сохраняет прежний return type/result и поведение всех MCP/internal callers. Row не накапливается в mutable/global collector/ALS и не доступен HTTP input; откатившийся transaction не оставляет candidate для следующей попытки.

Для duplicate SELECT возвращает реальные `project_id, actor_id, request_id, payload_hash, response, cursor`. Для нового row INSERT использует RETURNING тех же persisted fields. Metadata не составляется echo из request/actor parameters. Только после успешного завершения `await db.transaction(...)`, включая COMMIT, HTTP adapter может получить trusted row. Rollback/COMMIT failure не публикует proof. Второй transaction восстановления после WorkspaceGuardRejected сохраняет нынешнюю повторную проверку actor/role и получает row тем же способом.

Нынешние request/actor/project checks, principal/agent/participant/membership/revocation guards выполняются до lookup/replay, как сейчас. Нового receipt-read endpoint или bypass после потери прав нет. Row identity и hashes должны соответствовать фактическому возвращаемому result; несогласованность оставляет body прежним, но header не добавляется. Proof не пишет rows и не меняет current project version.

SQL cursor принимается только как safe nonnegative integer либо каноническая десятичная bigint-строка с точным безопасным преобразованием. PostgreSQL string и PGlite number проверяются фактически; нельзя молча лишить PostgreSQL ответов header и назвать это compatibility PASS. Нормализация и SHA выполняются после COMMIT вне SQL lock/serialize queue на immutable row/result, без current GET.

## Одобренный hash contract

`payloadSha256` берётся из реального `row.payload_hash`. Client независимо вычисляет SHA-256 от canonical parsed **effective command**: обычный commands body без изменения JSON-значений; для tasks — то же `{type:'startProjectWork', ...acceptedTaskBody}`, что использует handler. Это прежняя сортировка object keys/порядок arrays; raw JSON ordering и whitespace не влияют на business idempotency. Frozen retry bytes не пересобираются и остаются прежними. Исторический duplicate не переоценивается по новой command-content schema: authority даёт прежняя durable запись после нынешних access guards.

`servedBodySha256 = SHA256(canonicalJSON({state: normalizedState, events: originalReceiptEvents, cursor: originalReceiptCursor}))`. Источник — **immutable row.response**, а не текущий GET/state и не input. Общая pure normalization выделяется из существующего `lib/project-snapshot.ts` и вызывается и старым adopter, и server/client digest pipeline; второго списка padding/второго projection engine не будет. Прежние inspect/replay/history admission checks сохраняются. Missing nonempty facts, foreign project, неполная история или projection mismatch не нормализуются в успех.

Это нормализованный **view digest**, actual JSON response не переписывается. Перед header server сравнивает normalized view из row.response и фактически возвращаемого result, а также row.cursor с response.cursor. Client применяет тот же pure normalizer к received body и сравнивает digest. Из digest явно исключён только transport field `replayed`: он не хранится в immutable response и меняется между первым ответом и replay; client всё равно требует boolean. `{state,events,cursor}` — полный business response view v1; другие top-level fields не входят в этот контракт и не получают доверия через proof.

## Одобренный client admission

Сильное существующее правило для **непустой** партии сохраняется: actor/project/requestId, полный suffix и frozen version interval должны совпасть. Header не делает foreign suffix или legacy events без requestId допустимыми. Для **пустой** партии новый fallback допускается только при валидном header, точных row identity/payload/view hashes, валидном normalized snapshot и `cursor === expectedVersion`; receipt принадлежит исходному frozen request. Исторические неподтверждённые события не превращаются в accepted факты.

Совместимость: отсутствие header не меняет прежнее сильное подтверждение непустой bound партии; оно оставляет прежний UNKNOWN для empty/unbound receipts. Если header присутствует, но невалиден/не совпадает, ответ остаётся UNKNOWN и для непустой партии. Валидный header никогда не обходит strong suffix guard непустой партии. Это решение подтверждено root review до кода.

Transport сохраняет relative closed endpoints, credentials same-origin, redirect:error и проверку JSON response. Header не даёт права выполнить другой request. Нет автоматического retry, смены requestId/expectedVersion/body, забывания UNKNOWN или нового receipt fetch. Проверка hashes добавляет async boundary: same frozen intent, disposed/current session, actor/project/access/host epochs и adopter ownership остаются обязательными; delayed proof не обновляет чужой cache/context.

Global RAM record намеренно не хранит session epoch: исходные bytes должны переживать навигацию и повторную авторизацию того же автора. Scope authority проверяет существующий session admission proxy; HTTP callback явно различает `admitted` и `inactive`, legacy callback без результата совместим. Отдельная dispatch object identity проверяется после await, до/после callback и перед каждой terminal записью/catch. Поздний ответ старой отправки не меняет новую exact retry, даже при совпадении автора/bytes или возврате A→B→A. Если новой отправки нет, disposed admission оставляет исходный запрос UNKNOWN. Callback throw также fail-closed и не заменяет чужой dispatch.

Начатый exact duplicate наследует uncertainty, пока предыдущая отправка ещё `sending`. Поэтому поздний отрицательный ответ нового повтора не может выдать возможный предыдущий COMMIT за доказанный rejection. После передачи владения dispatch старый success также консервативно игнорируется; разрешить запись может актуальная отправка с допустимым admission. Это не автоматический повтор и не разрешение забыть UNKNOWN.

## Наблюдаемые критерии и RED → GREEN

1. Actual SQL historical row с `events:[]` проходит нынешний replay, но текущий HTTP/client не подтверждает его: meaningful RED. После изменения exact manual retry получает proof и подтверждает тот же business результат, не выполняя команду снова.
2. Legacy response без пустых derived collections и его fully normalized view имеют одинаковый v1 served digest. Immutable stored JSONB/events/revisions остаются побайтно/структурно прежними; missing nonempty collection остаётся UNKNOWN.
3. Новая команда даёт proof из фактического INSERT RETURNING; deferred COMMIT failure/rollback не даёт proof или новых committed facts. Digest first response/replay совпадает при разном replayed.
4. Нет header, неверный header/hash/версия/encoding, foreign row/actor/project/request, foreign suffix, изменённый snapshot или payload дают прежний UNKNOWN; автор/членство после revoke не получают replay proof. Одного валидного snapshot недостаточно.
5. Actual tasks mapping, key order/whitespace и exact frozen retry bytes проверены отдельно. Новые headers не меняют raw JSON body/MCP result или protocol schemas/manifest.
6. Browser fixture теряет ответ после настоящего COMMIT, сохраняет UNKNOWN и точные bytes, затем восстанавливает исторический результат только явным exact retry. Context switch/revoke/delayed proof не загрязняют новую session/query cache.
7. Targeted store/auth/legacy projection/client/session/TCP/browser checks, strict types, architecture and migration guards проходят на Node 24.19. Неустановленная dependency, недоступное окружение или отсутствие browser binary не считается domain RED.
8. Existing external PostgreSQL qualification harness проверяет реальный proof/replay и historical empty fallback, включая bigint cursor string, как часть PostgreSQL CI job. Если локального disposable PostgreSQL нет, фактический PG результат остаётся CI_PENDING; никаких новых production connections.

Только synthetic memory/temp profiles и собственные fixture children. UI/CSS/URI, release/launcher, native host и live cutover не входят в scope. Implementation, acceptance и Linux/browser qualification объявляются только по фактическому evidence.
