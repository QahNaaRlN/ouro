# CGL — журнал запуска через поколения

Дата: 2026-11-05. Ветка `codex/consumer-generation-launch`, base `f79bdc0d079ae516f4d28fafc442a18a7db28c96`. [Спецификация](../specs/consumer-generation-launch.md).

## До source

Root принял producer f79bdc0: независимый source-build/ci/protocol/runtime/runner/browser proof имеет bounded Windows PARTIAL_HTML_INTEGRITY_FAILED, а не full P5. После scoped commit root явно разрешил generation/envelope implementation на отдельной ветке. Исходный producer worktree оставлен clean для отдельного root publication; push/PR здесь не выполняются.

Прочитаны accepted D13/P5/SWD2/REC, actual consumer materializer/build/qualifier, legacy launch/local-next/MCP bridge, service build/export/config/startup/main и producer tests. Installed Next environment guide/CLI/order уже исследованы в REC; Next runtime/code не меняются. Root сообщил отдельный profile-contention fix; здесь storage source не редактируется.

Concrete plan: dependency-free outer scripts и stable MCP entry материализуются из same-commit templates; nested source сохраняет единственный graph. Finite snapshots → exclusive generation allocation → real ci/fresh build → immutable external BUILT record → atomic last-built → existing service DI с outer cwd/env/profile/MCP и generation resources. UNKNOWN generations не переиспользуются/не удаляются; arbitrary descendants/job-object/process-death гарантия отсутствует. Перед state implementation — causal concurrent/crash/admission RED; далее actual own consumer install/build/runtime/runner/browser fixtures.

## Причинный RED изоляции

Перед production state implementation временная allocation stub воспроизводила старый общий install tree. Pinned Node24.19 native tests: **RED2/2**. CGL01 реально выделил двум параллельным preparation один каталог. CGL02 запустил собственный parent и явно контролируемый detached writer с nonce endpoint, остановил только parent, подтвердил живой writer и получил тот же старый каталог при новой preparation. Это behavioral RED, не отсутствие зависимости/runner. В обоих случаях собственные children закрыты, временные roots очищены после проверки.

Witness не заявляет, что любой npm child всегда переживает parent: эта возможность отдельно реально доказана SWD2 npm lifecycle probe. CGL02 намеренно проверяет безопасный исход при известном surviving writer; никакой общей process-tree death гарантии или PID reclaim нет.

Затем valid source fixture выявила meaningful RED для missing snapshot output и неверного/unknown runtime admission: CGL03/05/06 допускали unknown/foreign record, CGL04 не создавала указанный canonical input. Отдельный повтор CGL02 поймал ошибку fixture read во время truncate-write; heartbeat переведён на append и ограниченное ожидание доказанного роста, без изменения production behavior и без объявления fixture failure продуктовым RED. Реализованы bounded path/source admission, immutable snapshot/effective hashes, complete artifact inventory и immutable BUILT/atomic pointer; первые6 tests GREEN6/6.

Root отдельно подтвердил MCP coherence: serving serviceA injects exact `--generation A` through optional trusted mcpArgs(default empty); buildB/last-builtB не меняет issuedstdioA. Manual selector-free invocation сохраняется как ограниченный last-built choice, не active-owner authority. Добавлены Windows-own-junction source rejection и concurrent immutable publication fixtures; их результаты фиксируются после прогона.

State/junction/concurrent/selector tests получили **GREEN9/9**; public arguments/stdin negative/EOF/idempotency и actual Node23 pre-admission — **GREEN4/4**, суммарно13/13. Materializer после CGL09 RED выполнил actual own same-commit protocol ci/pack и создал envelope: **GREEN1/1**. Это state/materialization/entry proof, ещё не actual end-user launch/runtime.

Root принял explicit optional `--control-stdin` для Windows actual npm qualification: только owned non-TTY pipe и единственная bounded stop line, default без reader; тот же owner→service Node IPC drain. Не добавлены network listener/PID lookup/generic API, flag не пропускает preparation. Базовые stdin tests были добавлены вместе с механизмом и не выдаются за отдельный наблюдённый pre-fix product RED; причинный RED state/unknown admission зафиксирован выше. Actual npm/child-lifetime tests остаются обязательными.

## Первый actual end-to-end fixture

Первый own run с fixture `62d04179ffab10d0f930503a569121c06505140c` остановился до создания runtime namespace: harness вызывал npm из foreign cwd без `--prefix`, поэтому package не находился. Это **fixture setup error**, не product RED; production gate не менялся. Исправлен только literal npm argv на `npm --prefix ENVELOPE run launch/build/start` из foreign cwd.

Второй actual run создал genA, выполнил независимый ci +fresh build, запустил built Vite/service, прошёл command/SSE/static phases и начал свежую build-only preparation genB при работающем A. Итоговые MCP/browser/drain/restart результаты ещё ожидаются; промежуточные artifacts не объявляются завершённым consumer qualification.

Добавлен dedicated mandatory `consumer-generation` Linux CI job без root install. Он запускает реальные ci/build/start/three-generation/selector/runner/browser/strict HTML checks и публикует только безопасный bounded report. Source producer job сохранён отдельно. Это source CI configuration, не выполненный Linux результат.

## Найденные actual lifecycle defects и scoped fixes

Actual fixture `44bd1f1552dfa068bccccadaf32ba5d3b6dee551` от source parentf79 выполнила npm launch(ci+fresh build), real command/progressive SSE, точные JS/CSS/font/static negatives, свежий buildB при работающем A, actual issued stdioA при pointerB с relative key-file/foreign cwd, runner3 и unchanged navigation6 — PASS. Strict HTML снова Windows FAIL672/1161. Итог **FAILED / STDIN_DRAIN**: pipe уже вызвал shutdown, но оставался event-loop reference. Failed report: `C:/Users/krmif/AppData/Local/Temp/ouro-consumer-project-tolZL2/qualified generation/qualification-report.json`; forced own fixture fallback зафиксирован как failure, не graceful PASS. Проверка процессов по точному unique fixture root после завершения не нашла оставшихся Node workers; profile/source tree не удалялись.

CGL16 выделил причинный actual-child **RED**: callback STOPPED получен, но без EOF процесс не завершался. Detach теперь pause+unref только собственного explicit control pipe; **GREEN127ms**, без process.exit/force. Этот defect не скрывается первоначальными stream-only unit checks.

Отдельный affected run дал20PASS/1FAIL CGL08. Повторяемая Windows concurrency выявила **EPERM именно atomic rename**, подтверждено безопасным syscall code (попытка9 отдельной matrix). После разрешения root добавлены детерминированные CGL17/18/19: transient same-temp, permanent failure, transformed bytes — **RED3/3**, затем scoped same-inode+exact-bytes bounded rename retry и verified cleanup — **GREEN3/3**. Дополнительно missing temp, pointer другого completed writer и replaced inode с теми же bytes — **GREEN3/3**. Actual Windows concurrent publication после fix: **30/30 PASS** без ослабления assertions. Process-local syscall/platform mock не является Windows FS emulation: actual Windows matrix записана отдельно, Linux native result остаётся pending.

Root strict typecheck и service strict typecheck/build — PASS до последних fault fixtures. Existing dependency locks не менялись. Root сообщил accepted producer source Linux CI PASS на более новом эпике, но текущий actual CGL proof остаётся привязан к parentf79; parent sync выполняется отдельно по координации root.

## Qualification scheduling и test mock cleanup

Affected subset с параллельным actual ci/build сохранил failure: CGL21 пересёк локальный whole-test6s timeout, включавший setup/FS и native metadata budget. Node Test отменил callback до async finally; CGL22 вошёл в ещё активный process-local fs mock и также упал. Этот run не называется GREEN. Production errno/deadline/assertions не ослабляются.

Root подтвердил, что whole-fixture6s не является accepted product SLA. Для этих metadata fault fixtures removed arbitrary whole-test limits; native~1s/max41 assertions и bounded CI watchdog сохранены. Добавлен serial mock lease с fully-settled finally, включая setup failure: следующий case не меняет fs exports/platform до восстановления предыдущего. После завершения active actual qualifier affected subset выполняется последовательно, без конкурирующего тяжёлого install/build. Это scheduling/test-lifetime correction, не новый product RED и не увеличение production deadline.

Следующий full fixture `a8a84f6f725b1dfacba0ce548a16dfcba35ec170` завершился NPM_LAUNCH FAIL во время concurrent regressions. Сохранены compiler/web/service artifacts, immutable BUILT pointer и own profile, outer node_modules отсутствует. Без safe owner-phase capture точная причина не доказана; этот результат не объявляется новым product RED или PASS. Report: `C:/Users/krmif/AppData/Local/Temp/ouro-consumer-project-TgU7oi/qualified generation/qualification-report.json`. Harness теперь сохраняет только фиксированный owner-phase code, без raw stderr/config.

Отдельный witness без ci/build на уже собранном own generation: настоящий `npm --prefix ENVELOPE start -- --control-stdin`, foreign cwd, own file profile → READY22.355s; stop line без EOF → graceful code0, total22.838s, safe stderr пуст. Это actual npm/service stdin fix evidence, не повышение предыдущего failed full run. Root организовал exclusive-heavy окно: свежая qualification ждёт grant; затем полный actual run без concurrent install/build/browser, после него serial affected subset. Production300s aggregate harness/owner30s readiness/native~1s budget сохранены.

## Exclusive full run и serial regressions

Root освободил exclusive-heavy окно. Fixture `8d08e5d39f7e687e567bfe8c6e28095cd871235f` от parentf79: **все13 functional phases PASS** — actual npm launch ci+fresh build при production env, command/SSE/assets/static negatives, buildB при сервереA, real issued MCP A при pointerB/relative keyfile/foreign cwd, runner3+unchanged browser6, stdin graceful stop без EOF, npm startB безci +persisted exact receipt, новая fresh launchC без control-stdin +direct-owner IPC drain, stable outer env/profile/literal cwd. Strict HTML Windows672/1161 остаётся FAIL, overall **PARTIAL_HTML_INTEGRITY_FAILED**, exit1; fallback не использован. Report: `C:/Users/krmif/AppData/Local/Temp/ouro-consumer-project-jtCOrh/qualified generation/qualification-report.json`. No-control phase использовал explicit positive --port: это не default/no-args/launch0 proof.

CGL23 отдельно выполнил actual npm lifecycle parent-kill: nonce-owned detached writer продолжает только UNKNOWN genA, новый actual ci+fixture build создаёт genB, A не выбран/не удалён; **PASS6.9s**. Fake build artifacts относятся только к process/state causality, не заменяют real Ouro13-phase proof. Teardown остановил verified own writer по nonce endpoint и подтвердил writer/install-owner exit перед cleanup unique fixture.

Последующий static audit выявил предел этого teardown: npm CLI/shell ancestor не записан, поэтому exit двух указанных Node children ещё не доказывает завершение всех mutating npm steps на Linux. Сам causal assertion PASS сохраняется, full child-cleanup qualification не присваивается. До freeze требуется transparent test-only wrapper, записывающий fresh pid+nonce и затем исполняющий тот же pinned npm CLI в этом процессе, плюс shell lineage и confirmed exit перед fixture cleanup; ambiguity → retained fixture/FAIL. Это не PID reclaim и не замена actual npm fake success. Во время static-only review код ещё не менялся.

После закрытия heavy children весь affected subset выполнен последовательно: **78 tests,76PASS,0FAIL,0cancel,2 existing POSIX-only skips**. CGL21/22 и REC06 теперь PASS; предыдущий45PASS/2FAIL/1cancel run сохранён как исторический failure, не переписан. Heavy окно освобождено root; далее только static design до разрешения нового code scope.

## Producer scratch placement: отдельный bounded gap

Static inspection показал, что source materializer выбирает `dirname(output)` для своего unique protocol install stage. При nested `ENVELOPE/source` это помещает producer dependency tree внутрь итогового envelope, хотя runtime proof его не использует. Root принял узкое исправление: сначала actual CGL09 RED по отсутствию stage в envelope; затем optional absolute `producerScratchRoot` с неизменным default и explicit own outer parent в composition. Без graph/dependency changes, delete/move, automatic cleanup или полной consumer переквалификации в этом checkpoint. Проверка ещё не выполнена; discovery не отменяет ранее подтверждённые runtime assertions и не повышает поставку до release.

## Обнаруженный PORT compatibility gap

Static сверка current worker с REC/installed CLI guide показала gap: start без inherited PORT мог принять PORT из файла, а start0 env expansion видел0 до bind. Old launch и start различаются: launch default/explicit positive CLI; start Commander parseInt/env/nonnegative0 и actual listener port до env. Root запретил автоматический reserve→close→bind shortcut и запросил early owned listener/adoption design. [Конкретные модули, минимальный API и RED matrix](../specs/consumer-prebound-startup.md) записаны до source changes. Никакой чужой3000 не занимается/не останавливается.

Отдельный P5 installed-CLI remainder принят root: сохранить `agent:check` (`scripts/check-agent.mjs`), `agent:config` (`scripts/agent-config.ts`) и inventory других documented installed/hosted commands до release replacement. Текущий finite envelope не объявляется заменой всего старого source ZIP; это следующая отдельная compat story, текущий proof не расширяется.

## Approved prebound implementation и focused actual RED

Root прочитал конкретный SDD и actual transport/runtime, одобрил structural same-Server DI/adoption с queue32/conn64/startup30s; default standalone остаётся immediate. До source implementation CPB01 actual old launch matrix PASS, CPB02 unmodified local-next/Commander options witness PASS, CPB03 настоящий old start0 + synthetic `${PORT}` config witness PASS. Candidate CPB04 дал missing empty-port rejection RED; CPB05 настоящий consumer worker + unchanged REC/locked parsers дошёл до own witness с PORT0 вместо actual>0 — **genuine RED** до app/DB imports.

Первая hook попытка ошибочно передала Windows path в --import, получив ERR_UNSUPPORTED_ESM_URL_SCHEME. Исправление только fixture на file URL позволило baseline3PASS/candidate2RED; setup error не называется product RED. Next runtime dependency в consumer не добавлен, реальные env и чужой3000 не участвовали.

Начата implementation: stdlib early listener, canonical Node-only structural type, mode-specific port helper, HTTP adoption/deferred activation, ранний worker stop latch. Request bookkeeping перенесён перед dispatch/queued flush; body/Hono/redirect/drain pipeline сохраняется. Во время отдачи heavy lease F/root выполняются только source edits; focused checkpoint ждёт нового grant. CGL23 transparent same-process real npm witness +shell lineage написан, но ещё не проверен.

## Focused prebound и placement checkpoint

Root выдал exclusive focused окно без full consumer/browser/app build. CPB01–05/07 прошли, CPB06 подтвердил вызов loader после stop во время dynamic module import, CPB08 подтвердил замену primary START на DRAIN_INCOMPLETE: **6PASS/2FAIL**, без fixture errors. Worker теперь проверяет stop после import до REC call; owner сохраняет primary failure, отдельно отмечает cleanupIncomplete и снимает listeners через finally независимо от cleanup result. Повтор CPB — **8/8 GREEN**.

Real TCP CPH01–05 и existing HTTP/startup cleanup дали **22/22 GREEN**: server identity/непрерывное занятие порта, byte-exact queued HMAC/HEAD/cookies, closed/over-cap skip, startup-only caps, deadline и handler drain. Service strict typecheck — PASS. Default standalone HTTP path и прежние raw body/auth/stream/background/shutdown assertions прошли в том же checkpoint.

CGL09 actual same-commit materialization дошла до готового envelope и получила **RED** именно на наличии producer install stage внутри него. После optional absolute scratch root + explicit own outer parent повтор CGL09, existing CMT01 default sibling behavior и CMT02 invalid-root admission дали **3/3 GREEN**. Producer CI/pack выполнялись только для собственных synthetic committed fixtures; app ci/build/browser/full qualifier не запускались. Default metadata сохранена, explicit root обозначен без абсолютных путей; stages не удаляются и не перемещаются.

Все children focused checkpoint завершились, heavy lease возвращена root. CGL23 с новым transparent npm/shell witness, root types/guards, финальный affected serial run и свежий полный consumer proof на новой implementation остаются pending. Ранее functional13/serial78 относятся к прежнему состоянию и не переименованы в текущий PASS.

## Scoped source freeze до parent sync

Независимый read-only peer L изучил последний prebound/PORT/cleanup/scratch delta и не нашёл material blockers. Root принял focused **33 cases + service strict types** ограниченно и разрешил отдельный source/tests/docs/workflow commit перед parent sync. Это не разрешение повысить прошлый functional13 до новой полной квалификации. CGL23 transparent npm/shell teardown, финальные root checks и свежий full consumer proof остаются **PENDING**.

До staging `git diff --ignore-space-at-eol --quiet -- packages/protocol` подтвердил semantic-zero. Восстановлены только75 указанных dirty generated paths (`bin/ouro-protocol.mjs`, `schemas/*.json`, `src/version.ts`); protocol source/contract и зависимости не менялись. `git diff --check` PASS. Staging выполняется явным конечным списком CGL файлов, без `git add -A`. Во время root/F heavy window Node/npm/build/tsc/browser не запускались.

## Committed source и parent synchronization

Scoped source freeze: **`ae80b02e373a305c6f812bf10cfc4970ce4b4d12`**,49 files,+1242/−35. Затем local `codex/react-vite-epic` **`4e826240bde2cce64c6ca4d10a39c3682bf14da4`** объединён без конфликтов в **`1c51c69763b0b646310e006c272e0c83abc56808`**. Все5 parent CI jobs и browser/presentation steps сохранены; новый consumer-generation является шестым job. `qualify-build-tree.mjs` с BROWSER_INSTALL/toolFailure и `profile-owner.ts` совпадают с parent по Git blob identity. CGL diff относительно этого parent сохраняет тот же finite49-file scope.

Parent-range whitespace check отдельно обнаружил уже входящую пустую строку EOF в `docs/plans/tailwind-integrations.md:108`; чужой файл не исправлялся. Scoped CGL diff check PASS. При sync не запускались npm/Node/build/tsc/browser. После synchronization **root checks, CGL23 cleanup qualification, affected serial suite и свежий full consumer proof остаются PENDING**; прежнее Windows HTML ограничение сохраняется, Linux result этой generation story не заявлен. Commit/merge не являются runtime qualification или публикацией.

## Windows affected checkpoint и test type correction

На frozen **`6d4fb853253a88c0087bb389ac6eb74c4f0329ca`** root выдал отдельное короткое exclusive окно. Изменённый CGL23 прошёл standalone **10.8s** и затем в serial suite **6.4s**, включая confirmed exit nonce-owned writer, postinstall Node, shell и transparent same-process pinned npm CLI перед own fixture cleanup. Affected serial suite: **87 tests,85PASS,0FAIL,0cancel,2 прежних POSIX-only skips**,139.9s. Fake build artifacts CGL23 по-прежнему доказывают только process/state isolation; они не заменяют real Ouro build.

Последующий root strict typecheck впервые проверил новые test edits и получил реальные compile failures: Next ProcessEnv требует literal NODE_ENV; invalid env inference разрушал spawn overload, JSON witness требовал explicit presence narrowing, а два injected rename parameters не имели типов. Исправлены только3 test files без production/deadline/cleanup-policy изменений. Повтор root strict typecheck — **PASS**, targeted3-file suite — **24/24PASS**, включая CGL23. Первый compile FAIL сохранён как test-source defect, не назван environment/domain RED.

Guard checkpoint: migration **47/59 PASS**, styles **0 violations PASS**, protocol **71 schemas PASS**, current-HEAD conventions PASS. Полный PR range conventions остаётся FAIL из-за automatic merge subject `1c51c697...`; root выполняет отдельный metadata-only reword с protected lease, здесь history не переписывается. Local architecture guard отказал на4 unresolved `@tanstack/react-router` imports в parent web sources: package/lock требуют1.170.46, но модуль отсутствует и в `apps/web/node_modules`, и в root install. Guard не ослаблен, CI install workflow не изменён; local architecture qualification остаётся **NOT_QUALIFIED** до bounded install/check. Это подтверждённый local install gap, а не доказательство нарушения dependency direction. Новая app/browser/full consumer квалификация в этом окне не запускалась.

## Первый Linux PR74 result и bounded diagnostics

Root сохранил первый actual Linux generation report в ignored `.operations/pr74-generation-FAIL/qualification-report.json`. Synthetic CI source commit **`8fb9e97a08fb4b34abd38cde44770044ff973389`**,Node24.19.0,root install absent. Seven phases PASS: independent materialization, actual npm launch+fresh production build, persisted command/progressive SSE, exact JS/CSS/font, negative static/API/HEAD, buildB while serverA, issued MCP A while pointerB/foreign cwd/keyfile. Strict HTML **672/672 PASS**. Затем **RUNNER_BROWSER FAIL** и **ownedChildFallback:INCOMPLETE**,overallFAILED. Browser installation и runner ещё не были раздельными phases; первичный report не доказывает причину, child exit или confirmed cleanup. State не удалялось и результат не повышается до full Linux/P5 PASS. Consumer-source job PASS относится к другому bounded contract.

По root request qualification-only helper теперь выделяет **BROWSER_INSTALL**, затем прежний RUNNER_BROWSER, и сохраняет только finite `toolFailure` phase/exitCode/signal/errorCode/elapsedMs/deadlineMs. Stdout/stderr, argv, paths, env/credentials не попадают в report. Retry/limits/timeouts/runtime ownership не меняются; Node syntax check PASS. Actual next-head diagnostic execution и новый full local consumer proof остаются **PENDING**. Root сообщил latest epic `cf355523...`; в этом checkpoint нового parent sync нет.

Текущий статус: **IMPLEMENTED_PARTIAL / FUNCTIONAL13_PREVIOUS_PASS / WINDOWS_HTML_FAIL / CURRENT_SERIAL85_PASS_2_SKIP / CURRENT_STRICT_PASS / LOCAL_ARCHITECTURE_NOT_QUALIFIED / FIRST_LINUX_GENERATION_FAILED / FINAL_QUALIFICATION_PENDING**. Production launch/pack/Docker, host settings, реальные env/profiles/DB не менялись. Installed CLI compatibility и замена всего source ZIP остаются отдельными PENDING работами.

## Root: история feature и статическое разрешение web dependencies

Перед исправлением собственного unmerged merge subject сохранена backup branch `codex/cgl-before-merge-message-fix` на `f90cdd07c34829f75e0964d2a75fd5d0e2499cbc`. Merge `1c51c697...` пересоздан как `1f4d8543a91d6d4dd89e7c6182ef53df96418cdf` с теми же tree и двумя parents, затем переприменены только два собственных descendant commits. Полное source-tree identity до/после metadata correction проверено: PASS. История main/dev/epic, принятые чужие commits и source freeze ae80 не переписывались.

Latest qualified epic `cf355523a1259b0e2826a4efa0a5fb4524e5fea5` объединён отдельным Conventional merge `e4b0a27df658b27f340806fd3c9ebb591f01a5c5`. Проверка **полного PR range**, а не только последнего subject:5subjects и PR title PASS. Публикация исправленной собственной draft feature защищается точным remote lease; backup сохраняет прежний unqualified history/evidence.

Для read-only local architecture check использован existing web dependency tree из собственной qualified `project-runtime-environment`. До ссылки проверены byte-identical web package/lock hashes и exact Router1.170.46. Исходники и зависимости не изменялись; npm/build через ссылку не запускались. Guard:798resolved files,0violations,11exactlegacyedges — PASS. Это локальный статический resolver check с явно переиспользуемыми dependencies; свежая установка и весь resolved graph по-прежнему проверяются штатным CI, не объявляются локально повторно установленными. Full consumer proof остаётся PENDING.

## Fresh Windows combined proof на frozen f99

Root выдал отдельное exclusive-heavy окно после завершения чужих owned процессов. До запуска проверены clean tracked tree и exact HEAD **`f99ca177691e42f32a83fe64d15477165be93d31`**. Весь ordinary qualifier выполнен с pinned Node24.19/npm, `--browser`, cached Chromium и escalated собственными disposable fixtures. Producer source во время исполнения не менялся, local retry/host settings/browser install не выполнялись. Work root: `C:/Users/krmif/AppData/Local/Temp/ouro-cgl-windows-combined-1f4a5f7cf55b42598e26cc3047edb7ff`.

**Все13 functional phases PASS**: independent materialization; actual npm launch с ci includeDev/production env +fresh build; persisted command/progressive SSE; exact JS/CSS/font; negative assets/API/HEAD; buildB while serverA; issued MCP A while last-builtB/foreign cwd/relative key file; real CJS/ESM/TS runner3; unchanged navigation/cookie6; actual npm stdin graceful drain; npm start last-built безci +exact persisted receipt; третья fresh explicit-positive-port launch без control-stdin с direct IPC drain; stable outer env/profile/sentinel/literal cwd.

Strict Windows HTML gate сохранён **FAIL expected672/received1161**, итог **PARTIAL_HTML_INTEGRITY_FAILED**, exit1. Никаких фильтрации HTML, увеличения timeout, пропуска проверки или forced fallback для получения PASS. `sourceRepositoryInstallAbsent:false`: root install существует, поэтому Windows результат не назван zero-root-install proof; materialized artifact находится вне repository ancestry и использует собственные install trees. Наличие root install не подменяется заявлением об отсутствии.

Безопасный report: `<work root>/qualification-report.json`, SHA256 **`997EC673ECE482236E0EDC4FBCE62A9B5EC7D801CE3E8E559D139D66E88776FA`**. В report отсутствуют error/ownedChildFallback: ordinary owner closures/drain завершились штатно. Дополнительный approved CIM identity check после выхода qualifier нашёл **0 node/cmd/esbuild/chrome процессов с exact unique fixture path**. Это подтверждает scope собственного наблюдения и не обещает общего контроля arbitrary grandchildren. Никаких kill/delete по PID или cleanup retained fixture не выполнялось. Все локальные heavy children завершились; lease возвращена root.

## Linux result и отдельный Windows CI gate

Root проверил новый PR74 run **41928063352** на f99: **все6 jobs SUCCESS**. Linux consumer-generation job **126917603751**, synthetic source `85fdef77...`, содержит14phase PASS, включая browserInstallation, strict HTML672/672 и sourceRepositoryInstallAbsent:true. Consumer-source также SUCCESS. Это полученный root CI evidence; первый RUNNER_BROWSER/INCOMPLETE report остаётся историческим FAIL с неустановленной причиной. Ни Linux PASS, ни Windows functional13 не объявляют P5 overall/production/ZIP acceptance.

Для unresolved local Windows strict-byte gate root запросил один named **consumer-generation-windows** CI job: windows-latest, Node24.19 через прежнюю `.nvmrc`, source node_modules отсутствует, ordinary `--browser --install-browser`, прежний30min job budget. Six existing jobs/steps остаются; новый job седьмой. Только report artifact, без raw child output/profile/env/credentials. Runtime, expected bytes, timeout/retry/host settings не меняются. В этом checkpoint выполнены только YAML/SDD/journal source edits и static diff check; **новый Windows CI NOT_RUN** до root review/publication. No local heavy повтор.

Текущий scope: **LINUX_COMBINED_PASS / WINDOWS_FUNCTIONAL13_PASS / WINDOWS_LOCAL_STRICT_HTML_FAIL / WINDOWS_CI_PENDING / CLI_REMAINDER_PENDING / ARCHIVE_NOT_IMPLEMENTED / PRODUCTION_NOT_QUALIFIED**.
