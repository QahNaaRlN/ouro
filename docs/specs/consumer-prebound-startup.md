# CGL port bootstrap — непрерывное владение listener до env/application imports

Дата: 2026-11-05. Статус: **DESIGN_ACCEPTED_NARROW / IMPLEMENTED_FOCUSED / CHECKPOINT_PASS / FULL_CONSUMER_PENDING**. Дополнение к [CGL](consumer-generation-launch.md) и [REC](runtime-environment-compatibility.md). Root одобрил structural same-Server DI/adoption после конкретного review API/matrix; reserve→close→rebind не допускается. Ранее пройденные13 functional phases не доказывают эту совместимость.

## Подтверждённый gap

`scripts/consumer-worker.mjs` задаёт PORT только при переданном explicit port, затем вызывает REC. При start без inherited PORT файл `.env.local` способен выбрать bind port. Это расходится с установленным Next16.4.3: CLI выбирает default3000/inherited/explicit value, listener уже получает порт, `start-server.js` записывает **actual** port в process.env.PORT до env/config loading. Для PORT0 это выбранный OS ephemeral port; `${PORT}` в env файле раскрывается в actual port. CLI guide прямо указывает, что PORT нельзя выбрать из `.env`.

Modes различаются. Старый `scripts/launch.mjs` принимает только decimal integer1..65535, default3000, и передаёт Next CLI `--port`, игнорируя inherited PORT. `scripts/local-next.mjs start` передаёт аргументы реальному CLI: Commander использует parseInt/nonnegative parser, env PORT и default3000. Explicit0 допустим у start, но не у launch; пустой inherited PORT у start отклоняется до env loading. Не унифицировать modes ради реализации.

Прочитаны installed `next/dist/docs/01-app/03-api-reference/06-cli/next.md`, `next/dist/bin/next`, `next/dist/server/lib/utils.js:298`, `next/dist/cli/next-start.js` и `next/dist/server/lib/start-server.js`. Next не становится dependency consumer; framework-private env caches и arbitrary Next debug switches не копируются.

## Узкая точка DI

`apps/service/src/bootstrap/start-http-server.ts` уже создаёт **node:http.createServer** самостоятельно и применяет `@hono/node-server.getRequestListener`; Hono serve здесь не используется. Options `overrideGlobalObjects:false`, `autoCleanupIncoming:true`, Web body bridge, URI redirect owner и response finish/close ownership сохраняются. Установленный node-server2.1.6 принимает готовые IncomingMessage/ServerResponse. Второй HTTP proxy/framework adapter не требуется.

| Модуль | Предлагаемое изменение |
|---|---|
| `scripts/consumer-delivery/owned-http-listener.mjs` + `.d.mts` | Stdlib-only early bind, bounded deferred request queue, current sockets, одна adoption и idempotent pre-adoption close. После Node gate, до REC; без Hono/Core/PGlite/dotenv imports. |
| `apps/service/src/bootstrap/prebound-listener.types.ts` | Каноническое Node-only описание handle для transport и script declaration; не client/Core/protocol contract. Входит в existing finite service source prefix. |
| `scripts/consumer-delivery/consumer-port.mjs` + `.d.mts` | Mode-specific legacy port admission до env reads; launch/default и start parseInt/env semantics. Reserved browser ports характеризуются по actual old next-start и отклоняются до env/profile, без runtime Next import. |
| `scripts/consumer-worker.mjs` | Node/id admission → early listener → actual PORT/local bind authority/demo flags → REC outer root → app import → startService с listener DI. Ранний stop latch до awaited bootstrap. |
| `apps/service/src/bootstrap/start-http-server.ts` | Optional prebound handle вместо второго Server; тот же dispatch/normalization/Hono/body pipeline. Existing sockets включены в тот же shutdown owner. Deferred activation только для prebound startup. |
| `apps/service/src/runtime/start-service.ts` | Optional server-only listener в options; address/state validation до store open. Store/background/worker startup → ready=true → activate → return. Catch закрывает unadopted listener/прежних owners; DB.close только после confirmed drain. |
| Producer envelope inventory/fixtures | Только finite stdlib helper files того же commit; graph/lock/deps/public protocol без изменений. |

## Минимальный handle и ownership

Предложение: `OwnedHttpListener` с readonly server/address/url/state, snapshot текущих sockets, `adopt(requestListener)`, `closeIfUnadopted()`. State PREBOUND→ADOPTED→CLOSED либо PREBOUND→CLOSED. Adoption однократна; закрытый/уже переданный/несовместимый host/port handle отвергается. После ADOPTED исходный worker не закрывает raw server: обычный HTTP owner делает request/task drain и закрытие. Pre-adoption close идемпотентен и освобождает только свой listener/sockets. Без private socket fields/FD extraction, PID/port owner lookup или close/rebind.

До adoption node:http держит bounded queue неизменённых IncomingMessage/ServerResponse, не читает body и не запускает auth/SQL. Закрытые requests удаляются и не получают handler. Предложены конечные startup-only caps:32 pending requests,64 connections и общий30s owner deadline до activation. Превышение закрывает только соответствующее собственное unadmitted соединение; общий deadline закрывает непринятый bootstrap listener. Auth response до готовности не обещается. Caps снимаются при adoption, ready requests идут по existing transport без новых лимитов/body cleanup. `server.maxConnections=0` не используется как сброс: Node трактует0 отдельно; достаточно снять bootstrap tracking policy. Continuity/queue/abort/cap cleanup проверяются реальным TCP.

Transport получает existing sockets и tracking новых; queued requests идут через тот же единый dispatch, устанавливающий finish/close bookkeeping до URI/Hono вызова. Raw URL/body/headers не трансформируются. Handler/SQL lifetime, background reservations, SSE cancellation и unused-body after-finish cleanup сохраняются.

Prebound mode возвращает HTTP owner с deferred activation: startService завершает storage/background/worker startup, затем ready и activate. Queued commands не обгоняют этот barrier. До activation ошибка/stop закрывает queue без новых app operations. После activation stop принадлежит обычному HTTP owner. Default standalone startHttpServer без DI сохраняет immediate admission. Передача ownership/activation должна быть синхронной после построения полного stop handle, без throwing queue flush и потерянного владельца.

Worker ставит stop latch до env/app awaits. До application startup stop закрывает unadopted listener и не начинает store. Если stop пересёк store/migration, не обещать отмену arbitrary Promise: ждать phase boundary/cleanup, original failure отличать от incomplete shutdown. Parent fallback остаётся явной неуспешной остановкой. Закрытие раннего TCP listener не является доказательством SQL drain.

## RED matrix до реализации

| Entry/layer | Baseline и expected assertion |
|---|---|
| Actual old launch + fake npm recorder | No CLI port с unset/empty/0/numeric/nonnumeric inherited PORT всегда передаёт --port3000. Explicit positive overrides; explicit0/duplicate/invalid rejects до ci. Bind3000 не требуется. |
| Actual old start CLI/Commander, intercepted nextStart only | Unmodified local-next/bin CLI выбирает default3000, env numeric, parseInt suffix/decimal quirks; empty/negative/NaN rejects до nextStart/env. CLI override и -p отдельно. Fixed Node24 test-only module hook захватывает options без bind/profile; это parser evidence. |
| Actual old start PORT0 + own config | Реальный listener0→actual>0 до config; synthetic file PORT не меняет его, ${PORT} раскрывается в actual. Config пишет own witness и завершает child до app/DB. Чужой3000/реальные env не участвуют. |
| Candidate modes/env | Тот же выбор до loader. Current CGL default+file PORT даёт RED; start0+${PORT} даёт RED0 вместо actual. Invalid empty/reserved ports не читают env и не открывают profile. |
| Continuous ownership | Barrier между bind0 и REC/adoption: independent bind того же порта получает EADDRINUSE; server listening/address/identity постоянны; второй listen/close отсутствует. Реальный TCP + source/spy evidence, не polling как единственное доказательство. |
| Queued wire compatibility | До adoption GET/HEAD/raw signed POST/body prefix; после activation один ответ через existing handler, exact HMAC/raw bytes, cookies/SSE/abort/finish. Closed/over-cap requests не запускают handler/SQL. |
| Failures/lifecycle | Env/import/store failure, cancel до/во время startup, repeated close/adopt, mismatch handle: release own port, no leaked sockets/timers, original failure retained; DB только после drain. |

После focused RED→GREEN: affected HTTP tests, strict types/build и real independent consumer proof на **explicit positive launch port**. Inherited start0 отдельно и не выдаётся за launch0. Ранее названный noFlag phase означал отсутствие **control-stdin** при explicit positive --port, не no-args/default3000 proof. Default3000 доказывается parser/witness без остановки/занятия чужого listener.

После baseline3PASS и genuine candidate2RED выполнена узкая implementation по этому дизайну. Дополнительные CPB06/08 получили genuine RED: stop во время module import всё ещё вызывал REC loader, а failed child cleanup маскировал START как DRAIN_INCOMPLETE. После phase-boundary admission и primary-error/finally fix CPB01–08 прошли **8/8**. Cleanup failure остаётся явным safe flag/diagnostic, без raw cause/config output.

CPH01–05 по реальному TCP прошли **5/5**: тот же Server без второго listen/close, early raw HMAC/HEAD/три cookie, закрытые и over-cap requests, снятие startup cap, deadline cleanup и handler drain. В том же serial checkpoint existing HTTP14 и startup cleanup3 прошли, суммарно **22/22**, service strict typecheck PASS. Это focused Windows evidence; parent source peer и повторный full consumer proof ещё требуются. Acceptance полного P5/production и Linux CI PASS из этого не следуют.
