# HRP · Журнал durable HTTP receipt proof

Дата: 2026-11-04. Ветка `codex/http-receipt-proof`, база `3d568a8`. [Дизайн/SDD](../specs/http-receipt-proof.md) создан до кода; normalized digest и absence-header policy одобрены root review до реализации.

Изучены реальные `ouro_command_receipts` schema, store commit/duplicate/guard recovery paths, legacy migration fixture, project snapshot normalizer, HTTP service bindings и client frozen intents/adopter checks. Existing raw command JSON/MCP и immutable rows сохраняются. Старые SPP/SRP worktrees оставлены чистыми; push не выполняется.

- Дизайн: ROOT_REVIEW_APPROVED; optional header для strong bound nonempty, required для empty fallback, present invalid/mismatched всегда UNKNOWN. Предпочтён private `{result,row}` execute, digest после COMMIT вне SQL lock.
- Implementation: IMPLEMENTED_LOCAL; final root integration/CI ещё не заявлены. Общий private commit path возвращает persisted row только после COMMIT; прежний executeCommand сохраняет JSON result. Один extracted pure projection normalizer используется adopter и обоими digest pipelines.
- Meaningful RED: CONFIRMED на неизменённом HEAD `3d568a8`, затем первый GREEN на текущем коде. Details ниже.
- SQL/TCP/client qualification: LOCAL_PASS, включая финальный ownership fix. Browser: LOCAL_PASS (2/2) повторён на окончательном коде. External PostgreSQL: CI_PENDING, локальный disposable PostgreSQL не задан. Linux qualification: CI_PENDING. Production/live cutover: NOT_STARTED.

## Исправление первого fixture и настоящий RED

Первый тест ошибочно проверял status внутри injected fetch: transport catch скрывал assert, и UNKNOWN наблюдался на HTTP 401. Ошибка аутентификации fixture, а также промежуточные неверный URL login (404) и Windows `--import` без file URL **не являются domain RED**. Код начал меняться до исправления fixture; эта последовательность не скрывается.

Исправленный fixture регистрирует synthetic credential именно исходного seeded actor UUID и входит через реальный `/api/participants/session`. HTTP status assertions теперь выполняются за пределами transport catch. Исторический row заранее закоммичен прямым fixture SQL; **оба POST — exact replay**, первый POST не создаёт row.

Для genuine baseline создан собственный ignored archive неизменённого `git archive HEAD` в `.operations/receipt-baseline-oXSzHL`. LF-normalized исходники store, service bindings и client receipt guard совпадают с HEAD; TSX `require.resolve` для `@/lib/store`, `@/lib/auth`, core проверен внутри archive. Рабочие профили и frozen P1 source не менялись. `.operations/receipt-authenticated-baseline-red.log`: login 200, command statuses `[200,200]`, raw historical JSON совпал, старый клиент вернул UNKNOWN вместо confirmed. `.operations/receipt-first-green.log`: тот же fixture на текущем коде 1/1 GREEN, прежний row/response не переписаны.

Отдельный HRP09 RED проверил настоящее назначение baseline guard: точная документированная header adaptation отклонялась как `Changed route contract: app/api/commands/route.ts`. После конечной phase mapping 7/7 guard tests GREEN. Historical `http-baseline.json` не регенерирован; разрешены только три точных original→accepted source hashes, прежние paths/methods остаются обязательными. Другой hash/path/method, stale original, duplicate или unknown metadata map отклоняются.

Промежуточный HRP07 упал на fixture FK: при `seedEvents:[]` исходный `local-human` ещё не был зарегистрирован. Добавлен явный fixture principal до historical SQL INSERT; это setup correction, не product RED.

## Ownership review и второй product RED

Root review потребовал реальную same-actor reauthentication при остановленном SHA. HRP14 использует `createProjectRuntime`, настоящий QueryClient, `createProjectHttpPorts` и память SQL fixture: epoch 10 dispatch получает 200 proof, SHA задерживается; old lease закрывается, epoch 11 начинает exact retry с теми же bytes. После освобождения старого SHA disposed adopter не принимал snapshot, но общий catch **заменял новый sending record на UNKNOWN**. Этот конкретный RED подтверждён до fix и принят root review.

Исправление: типизированный admission `admitted|inactive` в HTTP callback; после async boundaries и до/после callback success/failure/catch могут менять только object identity своего dispatch. Existing frozen identity остаётся проверкой допустимости исходного intent, но не выдаётся за epoch/dispatch ownership. Сам global RAM intent не получает epoch. Новый duplicate наследует uncertainty от ещё sending предыдущего запроса; обычный отказ после возможного первого COMMIT остаётся UNKNOWN. Старый success консервативно игнорируется после нового dispatch. Solo disposed response остаётся UNKNOWN, ошибки callback изолированы тем же guard.

HRP14 same-actor accessEpoch 10→11 и A→B→A GREEN. При A→B→A snapshot Query key закономерно совпадает, но владелец session другой; проверены отсутствие старого admission/cache update, точная идентичность нового pending record и последующее подтверждение только нового dispatch. Промежуточный assert об обязательном различии snapshot Query keys в A→B→A был ошибкой fixture, исправлен на реальную модель runtime. Callback throw и запуск нового exact retry внутри старого throwing callback также проверены.

Существующие concurrent intent tests уточнены под dispatch ownership: разрешает record newest positive, older late errors не воскрешают его; late error не переписывает newest sending presentation, но uncertainty уже sticky и последующий отрицательный исход остаётся UNKNOWN. Это сохраняет original bytes, label/slot и запрет автоматического retry.

## Промежуточные проверки

- Node 24.19.0: новые SQL/client/TCP + migration guard 33/33 GREEN до дополнительного HRP14 review; после ownership fix focused client/UNKNOWN/runtime/dispatch группа 93/93 GREEN. Итоговая группа ниже отдельно.
- Existing auth/projection/session/MCP/migration группа 90/90 GREEN; existing workspace/user-auth/AST + новые proof tests группа 63/63 GREEN до ownership fix.
- Service all47-route negotiation, negative auth/body priority, SQL/cookies/revoke/MCP/SSE/raw webhook HMAC: 5/5 GREEN.
- Service artifact outside source cwd, file SQL restart и cross-process/crash mutex: отдельный повтор 2/2 GREEN. Первый запуск одновременно с тяжёлыми build/SQL suites дал два readiness10s timeout без stderr. Deadline не менялся; timeout не считается domain RED и сохранён как ограничение параллельного запуска.
- Real browser WebCrypto/HTTP: historical preseeded replay и отдельный fresh COMMIT lost response→UNKNOWN→exact explicit retry 2/2 GREEN. First browser attempt имел ENOENT из-за повторного создания manifest при загрузке Playwright config worker; исправлено наследованием одного owned manifest path, не изменением product кода. В CI добавлен обязательный отдельный browser step; default product browser suite не захватывает fixture `.browser.ts`.
- Root/service/web strict typechecks, Next production build, service build, architecture0 violations/16 finite legacy edges, HTTP inventory47/59, conventions и protocol71 schemas PASS до финальной повторной сверки.
- External PostgreSQL harness расширен actual INSERT/SELECT row proof, bigint-string cursor и 9/11→12 immutable empty receipts. Локальный запуск: 7 SKIPPED по существующему explicit disposable-DB guard, **не PG PASS**. Реальный PG result остаётся CI_PENDING.

## Финальная локальная сверка

Все команды выполнялись в этом worktree через закреплённый `D:/PersonalProjects/ouro-worktrees/react-vite-foundation/.operations/runtime/node-v24.19.0-win-x64/node.exe`. PATH менялся только для собственного процесса, чтобы дочерний Next/Vite использовал тот же Node. Рабочие DB/profiles и окружение хоста не менялись.

| Проверка | Команда после имени Node | Результат |
| --- | --- | --- |
| SQL/TCP proof + source adaptations + прежний client/session/runtime/dispatch/UNKNOWN | `--no-wasm-code-gc --import tsx --test --test-concurrency=1 apps/service/tests/http-receipt-proof.test.ts tests/http-command-receipt.test.ts tests/migration-baseline.test.ts tests/workspace-intents.test.ts tests/project-session.test.ts tests/project-session-http.test.ts tests/project-session-runtime.test.ts tests/project-command-dispatch.test.ts` | **108/108 GREEN**, 0 skipped |
| Браузер на итоговом Next build с настоящим WebCrypto | `node_modules/@playwright/test/cli.js test --config=playwright.receipt-proof.config.ts` | **2/2 GREEN**, historical exact replay и отдельный fresh COMMIT |
| Итоговая production сборка, включая root strict types | `node_modules/next/dist/bin/next build --webpack` | PASS после ownership fix |
| Service strict types | `node_modules/typescript/bin/tsc --noEmit -p apps/service/tsconfig.json` | PASS после ownership fix |
| Web strict types | `node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json` | PASS после ownership fix |
| Service distributable | `apps/service/scripts/build.mjs` | PASS; server source после этого build не менялся |
| All-route negotiation/SQL/MCP/SSE/raw HMAC | `--no-wasm-code-gc --import tsx --test apps/service/tests/service-parity.test.ts` | 5/5 GREEN |
| Ordinary Node artifact, foreign cwd/restart/crash | `--no-wasm-code-gc --import tsx --test apps/service/tests/service-artifact.test.ts` | 2/2 GREEN отдельным повтором без изменения deadline |
| Архитектура / исходный HTTP-инвентарь / conventions | `scripts/check-architecture.mjs`, `scripts/check-migration-baseline.mjs`, `scripts/check-conventions.mjs` | 0 violations, 16 finite legacy edges; **47/59 PASS**; conventions PASS |
| Protocol schema verification | npm CLI `--prefix packages/protocol run check` | 71 schemas PASS; только EOL-generated diff затем проверен как semantic-zero и убран |
| Внешний PostgreSQL | `--import tsx --test tests/external-postgres.test.ts` | 7 SKIPPED, CI_PENDING; существующий PostgreSQL CI harness выполнит новые обязательные assertions |

Core/domain/MCP/protocol source, DB SQL migrations, protocol versions/schemas/manifest, historical HTTP baseline и package manifests/locks не изменены (`git diff --exit-code` для этих путей PASS). В source нет новых explicit `any` или `//` comments. `git diff --check` PASS. В финальном browser fixture виден существующий Yjs duplicate-import warning из seed source + bundled Next в одном test process; collaboration/Yjs там не исполняется, mutation/snapshot проверка использует реальные HTTP JSON/client ports. Это fixture boundary, не утверждение новой collaboration qualification.

Scope результата: HTTP-only causal proof трёх command endpoints, совместимый raw JSON/MCP, одно shared normalization правило и bounded client admission/dispatch ownership. Это не подпись, не обход нынешней авторизации, не автоматическое разрешение чужого nonempty suffix и не приёмка всей миграции. Публикацию PR, финальный CI и integration выполняет root.

## Синхронизация с эпиком

После scoped implementation commit `d55814f72a8c0d57ff87f28697dfd88994581fab` выполнен порученный merge `origin/codex/react-vite-epic` на `d0206db7a86f1af199a6f0f479687c092e183675`. Итоговый merge commit: `981b0938c9786b45070b194178681672de5dcf72` (`chore: sync React Vite epic`). Автоматический merge subject сначала отклонён conventions guard; исправлен только заголовок собственного непубликованного merge commit, код и родители сохранены. Конфликтов не было.

В `lib/store.ts` автоматическое объединение добавило runner preload option/owner forwarding рядом с сохранённым receipt path. Новая service сборка содержит точную копию `lib/verification/runtime/playwright-preload.mjs` и явную запись resource в manifest; URI owner перенесён из эпика. Package manifests/locks не менялись. Client typed admission/dispatch identity, receipt canonicalizer/normalizer/header helpers и finite 3-wrapper source map побайтно/по Git diff сохранены относительно `d55814f`. Historical HTTP baseline не генерировался и остался прежним.

После merge на Node 24.19.0 повторены:

- Root/service/web strict types — PASS; service build и actual resource bytes/manifest — PASS.
- `--no-wasm-code-gc --import tsx --test --test-concurrency=1 apps/service/tests/http-receipt-proof.test.ts tests/http-command-receipt.test.ts tests/migration-baseline.test.ts` — **38/38 GREEN**.
- Next production build — PASS; затем `node_modules/@playwright/test/cli.js test --config=playwright.receipt-proof.config.ts` — **2/2 GREEN** на объединённом artifact, собственном synthetic профиле и настоящем browser fetch/WebCrypto.
- HTTP inventory **47/59 PASS**, architecture **0 violations / 16 finite legacy edges**, conventions — PASS.

Это затронутые локальные проверки синхронизации, **не полный CI**. PostgreSQL и Linux остаются CI_PENDING. Отдельное исправление SPP/Linux mutex находится в другом worktree и в этот merge не входит. Рабочие профили, host environment, push/PR и live cutover не выполнялись.
