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

Текущий статус: **IMPLEMENTED_PARTIAL / FUNCTIONAL13_PREVIOUS_PASS / WINDOWS_HTML_FAIL / SERIAL78_PREVIOUS_NO_FAILURE / PREBOUND_FOCUSED_PASS / PLACEMENT_PASS / SOURCE_FREEZE_AUTHORIZED / FINAL_QUALIFICATION_PENDING**. Production launch/pack/Docker, host settings, реальные env/profiles/DB не менялись. Installed CLI compatibility и замена всего source ZIP остаются отдельными PENDING работами.
