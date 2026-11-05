# C1 agent CLI — журнал

2026-11-05. Root разрешил scoped implementation после C0. Создан отдельный `codex/consumer-agent-cli` от epic6595, CGL88cb объединён Conventional merge `29989b459387836e40bae454869dede998a7ebc8` без конфликтов. Старый CGL worktree остаётся clean.

SDD создан до test/product edits. Текущий этап — dependency preparation и positive source characterization, затем actual consumer contract RED. До root review RED/bundle approach product behavior не изменяется. Все данные synthetic; host env/global config/реальные профили не используются. Heavy lease выдан только этому срезу; full CGL qualifier не запускается.

Dependency preparation: own exact-lock npm ci210 и protocol build71 PASS. Frontend/service не собирались. Первый actual7-case run: canonical MCP и ambiguity/invalid selector/privacy PASS; consumer valid before-build MCP отказал `Connection closed` без missing-module — behavioral contract RED. Consumer config/check aliases также отсутствуют/status1. Canonical config/check получили fixture deadlines; это setup/timing FAIL, не product RED. Config observed wall280s при15s child deadline, причина не установлена.

Выполнен один bounded harness repair: прямой тот же tsx loader вместо дополнительного CLI child и ожидание child close после deadline;15s не увеличивались. Targeted canonical2cases дали **2/2PASS**, config-case174.1s wall включая возможный global before hook, checker-case1.54s, весь run182.4s. Это не измеренная CLI process latency. Host/tool process stalls наблюдались также root на trivial calls; причина не объявлена. Canonical source bytes/deps не менялись. Эти отдельные результаты не выдаются за единый7caseGREEN. Own SDK fixture закрыт after hook, repair exec58543 завершён exit0; retry не запускается.

Root получил RED и dependency/bundle boundary до product implementation. Peer gaps внесены в SDD: ENOENT-only absence, exact3 descriptor/hash/DI admission, direct checker cwd и explicit missing/tampered selection. Product source не изменён. Heavy lease освобождена до root review/следующего окна.

Исторический checkpoint до одобрения реализации: **CANONICAL3_CHARACTERIZED_WITH_SCOPED_RUNS / CONSUMER_CONTRACT_RED / PRODUCT_IMPLEMENTATION_NOT_STARTED / APPROACH_REVIEW_PENDING**.

Root и peer затем приняли finite descriptor/layout/DI и разрешили реализацию. Добавлены три shared canonical callable mains, generation-neutral self-contained supplement, strict selector и same-commit isolated producer. Config/check generation entries собираются прежним service compiler. PROJECT_ID механически выделен в named public `core/src/project-identity/index.ts` + leaf с тем же UUID и прежним engine export; это не новая domain semantics. Immutable CLI closure ограничен фактическими authority inputs, включая existing service build recipe.

Descriptor schema counterexamples: nonstring IDs позволяли оставить другие tool bytes непроверенными, array inputDigest проходил coercing regexp. Оба actual RED затем **2/2 GREEN** после scalar/exact-set admission. Producer counterexamples: post-ci source mutation, ancestor compiler import, external runtime dependency и actual Windows junction metafile escape — actual RED затем **4/4 GREEN**. Junction fixture квалифицирован с разрешённым native filesystem доступом; прежний non-escalated pass не был доказательством этой границы.

Последние два root замечания сначала дали actual **0/2 PASS**: reserved equal-form selector не отказывал и compiler мог изменить copied canonical source после ci. После narrow исправлений admission/producer suite дала **8/8 PASS**, 2026-11-05, Node24.19, 1.84s. Ровно тот же finite copied-source/recipe check теперь применяется до и после compiler; selector не расширяет обработку остальных unknown args.

Один дешёвый alias witness: frozen29989 MCP bytes и candidate source, normal/lowercase Windows invocation, все четыре exit0, stdout0/stderr241 и help присутствует. Регрессия не подтвердилась, entry identity guard не усложняется. Первое обращение к отсутствующему старому fixture было SETUP_FAIL; исправный witness использовал собственный временный frozen Git file, удалённый после завершения child. Это не SDK/символьная-link qualification.

Три прежних root strict test type errors исправлены явными типами; итог strict проверяется до source freeze. Полный actual SDK consumer GREEN пока **PENDING**: он должен материализовать committed candidate после merge текущего epic; dirty source fallback запрещён. Первичный oracle остаётся29989, новый candidate SHA фиксируется отдельным evidence commit. Full CGL/browser повторно не запускались; protocol producer/pnpm/остальные installed CLI/ZIP/cutover не заявляются завершёнными.

## Frozen candidate A и результат

Source S1: `8654c7fb3eb5d5c016dfc01b07b3fbbb3fb08646`,31 reviewed files. После Conventional merge текущего epic `b957bc95926543e79b4d45f3723f052eaaa04f62` без конфликтов frozen **A = `ff16750d2d7dc3839eff86a37c99d019ec82555b`**. Квалифицирован именно post-merge A, не S1 и не dirty checkout. Collector API передан protocol owner: exact `agentToolFiles`2 scripts, fixed2 runtime envelope additions; materialize-build-tree в CCLI не менялся. Будущая protocol адаптация legacy oracle обязана оставаться test-only frozen29989, не production legacy fallback.

Один actual SDK run A: pinned Node24.19, `npm_execpath` pinned npm-cli.js, `node --import ./node_modules/tsx/dist/loader.mjs --test --test-concurrency=1 tests/consumer-agent-cli.test.ts` с разрешённым native доступом. **12/12 PASS**, exit0,165.52s. CCA01 case/hook wall152.93s включает materialization, не CLI latency. Fresh own legacy install использует original29989 source и его root lock/protocol; candidate materialized по A. Ни legacy, ни consumer blueprint не имеют `.next`, web/service dist или `.ouro`. Candidate manual tools работают без app build/BUILT и без dependency fallback в source checkout.

Пройдены: original4 config profiles/entry/format; direct checker caller-relative key; real SDK initialize/tools/resources/get_context и stdio bridge; candidate manual MCP и npm aliases до app build; invalid/missing/tampered selectors без manual fallback; каждый из3 bundle hashes и exact descriptor set до import; actual immutable authority file list; настоящий unsupported Node23 до отсутствующего descriptor. Полные status assertions не подменялись connection exceptions. Privacy sentinel не попал в stdout/stderr. Own fixture retained: `C:/Users/krmif/AppData/Local/Temp/ouro-agent-cli-l05AbO`. Approved CIM check после suite:0 Node processes с этим fixture identity; SDK servers/stdio transports закрыты after/finally, exec59123 exit0.

Supplement metadata: product `0.1.0-beta.4`, protocol `0.3.0`, sourceCommit A; inputDigest `8ab78a5810b0a73ec50498344b5fbdd7593866821c6c0ea6ac453c462f7c476a`. Output SHA256:

| Tool | SHA256 |
| --- | --- |
| agent-config | `6ab465ff441720fa8306cc4f5fb5af5def0be381900c9b318a1052b88716d842` |
| agent-check | `91cedd1caa99d27bc09c34d504184bb75fa9a004a0634ae47951db612df9d654` |
| mcp-bridge | `fed45d0f95522ad64a5d926f5891b88fe7e8ff15982cb28b60a1548b2ca7c494` |

После merge A выполнен exact updated root `npm ci --include=dev`214 (добавленные parent i18next/react-i18next); protocol dependency build71 и root strict `tsc --noEmit` **PASS**. Existing `core.test.ts` + `agent-client-config.test.ts`: **24/24 PASS**, включая прежний Core behavior/UUID и trusted stdioArgs. Service own exact ci130, strict и build **PASS**; actual built config/check callable exports загружаются, config DI сохраняет exact outer bridge + explicit generation в JSON. Сервис/DB/profile не запускались.

Existing targeted CGL10 сначала отказал на unchanged pointer publication `CONSUMER_POINTER_RENAME_EPERM` в restricted execution, до CLI assertions. FAIL сохранён; тот же case с разрешённым native доступом **1/1 PASS**,1.40s run, без source/deadline/rename policy changes. Причина первого EPERM не объявлена доказанной. Architecture до nested web install имела4 unresolved Router module setup failures; после exact web ci85 (без build/browser) **931 files /0 violations /11 exact legacy edges**. Conventions b957..A: **3/3 subjects PASS**. Locks/dependencies не изменялись этой историей. Generated protocol EOL-only dirt восстанавливается только после normalized diffquiet.

Итог области: **IMPLEMENTED_SCOPED / LOCAL_SDK_QUALIFIED / CI_PENDING**. Evidence commit описывает A; source S1 не выдаётся за обновлённый qualified graph. Полный CGL/browser/Windows HTML qualifier не повторялся; предыдущий Windows HTML FAIL и отдельные CI результаты сохраняют историческую область. Остальные installed CLI, protocol producer decoupling/pnpm, ZIP/hosted/data rehearsal/Next removal/native и общий acceptance остаются отдельными задачами.
