# Журнал SWD2 consumer source delivery

Начато: 2026-11-04; финальная локальная квалификация продолжается 2026-11-05. Ветка `codex/consumer-source-delivery`; base `16943f52d03ad496c3e56ff1233be3f589c0d55d`, затем принятая REC dependency `a10cc386c8f71142448383d8bf379cb721f0ae5c`. [Спецификация](../specs/consumer-source-delivery.md).

## Read-only и предложенный дизайн

Прочитаны CONTRIBUTING, принятые D13/P5, README/first-release-guide, old launch/local-next/hosted-next/packer/tests, service build/main/config/resources, web Vite/TS/package configs и фактические root/web/service lock versions. Source closure и independent npm tree описаны до реализации. Никакие пользовательские env/profiles/production releases не читались и не запускались. Source/dependency/lock changes: **NONE**.

Root принял SWD1/SWD2 split и потребовал сохранения ci+fresh build, одного independent consumer lock, committed-tree producer, graceful IPC-first shutdown и отдельного реального install proof. Дополнительно подтвердил обязательную совместимость `.env.local` как отдельный узкий adapter story. Для него создана независимая ветка `codex/runtime-environment-compatibility` от того же base; source до SDD не менялся.

Статус исходной записи: **DESIGN_PROPOSED / IMPLEMENTATION_NOT_STARTED**. Independent install/build/ZIP launch/runner/protocol на тот момент: **NOT_RUN / NOT_QUALIFIED**. SWD1 partial Windows HTML integrity не повышается до all-green. Старые launch/pack/Docker, рабочие profiles и dev pnpm неизменны.

## Принятый structural design и REC dependency

Root принял structural producer/install-tree SDD и отдельно REC до source. REC завершён в `a10cc386c8f71142448383d8bf379cb721f0ae5c` после source peer review:12/12 новых checks (0 skip), full affected24 tests22PASS/2existing Windows POSIX skips; exact pair dotenv16.3.1/expand10.0.0, остальные resolutions/integrities неизменны. Он fast-forward включён в SWD2; текущие service/launch/Next wrappers не подключены к loader. Producer/source closure/consumer lock могут квалифицироваться независимо от открытого launcher owner.

## Реальный Windows npm descendant counterexample

Primary pinned Node24.19 source прочитан до эксперимента: [libuv Windows process.c](https://raw.githubusercontent.com/nodejs/node/v24.19.0/deps/uv/src/win/process.c), [version.h](https://raw.githubusercontent.com/nodejs/node/v24.19.0/deps/uv/include/uv/version.h), [Unix process.c](https://raw.githubusercontent.com/nodejs/node/v24.19.0/deps/uv/src/unix/process.c). Actual runtime: Node24.19.0, libuv1.52.1, Windows. Global kill-on-close Job покрывает назначенных non-detached direct children; silent breakaway и swallowed assignment access-denied исключают гарантию arbitrary tree из одного source review.

Первый disposable multi-case run не дошёл до итоговой сводки из-за fixture readiness timeout; это **не domain RED**, частичные результаты не повышались до qualification. Повтор сохранён в ignored local `.operations/owner-probe.mjs`: каждый case имеет собственные readiness/PID/heartbeat markers, parent/children созданы самим fixture, service использует только новый собственный temp profile. Child stdout/stderr не содержат пользовательских credentials; реальные env/profiles не читались.

| Actual owned case, kill parent via SIGKILL | Наблюдение после250ms + ещё400ms |
|---|---|
| parent Node → direct Node heartbeat writer | direct descendant dead, writer dead, heartbeat stopped |
| parent Node → actual pinned npm-cli `run mutate` → Windows shell → Node writer | direct npm child dead, **writer alive и heartbeat continued** |
| parent Node → actual esbuild0.28.2 native context worker, write:false | native descendant dead |
| parent Node → actual built standalone service, new file fixture profile, READY | service descendant dead |

Все собственные surviving PID после наблюдения остановлены, каждый parent awaited, temp profile/dirs удалены только после parent/prefix checks; experiment exit0, live own child не осталось. Это воспроизведение конкретного unsafe assumption; не доказательство portable process-tree guarantees. Linux runtime experiment ещё NOT_RUN. Launcher/producer source в этот момент NONE.

## Предложенный generation пересмотр

Root предложил отдельные generation install trees вместо повторной mutation общей установки. Обновлён SDD до launcher source: outer stdlib command envelope без dependency graph, canonical source manifest/lock blueprint, новый atomic-mkdir generation на каждую ci+fresh build; start читает только BUILT, profile/env/keys остаются stable outer; MCP получает stable forwarding entry и explicit config path DI. Runtime service/profile owner остаётся прежним; orphan npm writer меняет только старый generation. UNKNOWN не выбирается и не удаляется, automatic GC первоначально отсутствует.

Открытые проверки: root review generation revision, atomic pointer semantics Windows/Linux, operator source-edit policy, реальный parent-kill old-generation writer + independent new install/build, current start/build/MCP compatibility, install/resource/runner/protocol proofs. `npm run build` предлагается явно адаптировать к new-gen ci+build (envelope не имеет node_modules); `npm start` остаётся no-preparation shortcut. Это **DESIGN_PROPOSAL**, не квалификация, и не новое изменение принятых D01–D16.

## Первый независимый producer source boundary

До source SDD дополнен конкретными files/gates для immutable inventory. Добавлен no-op stub + tests. Pinned Node24 native TypeScript runner без source dependency install:

```text
node --test --test-concurrency=1 tests/consumer-source.test.ts
RED: 5 FAIL / 0 PASS / 0 skipped.
```

Missing dependency не участвовала: реальные собственные Git histories успешно создавались. Stub вернул пустой immutable identity/source bytes и пропустил committed private/symlink/unsafe-ref fixtures. Затем реализован stdlib-only `scripts/consumer-delivery/committed-source.mjs` с typed declaration: Node admission, literal Git argv, исключённые ambient GIT_* checkout overrides, один resolved commit, full tracked-tree private/mode/path/case audit, fixed diagnostics и bounded cat-file batch. Consumer/protocol closure выбирается конечными явными roots/files, не по dirty checkout. **GREEN5/5, 0 skip**; дополнительная metadata SemVer fixture выполняется следующим прогоном.

Read-only actual HEAD inventory на `a10cc386c8f71142448383d8bf379cb721f0ae5c`: **205 consumer files / 101 protocol files**, consumer1689194 bytes, protocol1793815 bytes, Next route/runtime paths0. Это inventory, не доказательство полной sufficiency или independent build. В текущем worktree source helper/test/docs ещё uncommitted; production pack/launch/Docker/dependencies/locks не менялись. Native TypeScript runner выдал MODULE_TYPELESS_PACKAGE_JSON warning; root package type не менялся ради warning. Existing root CI tsx glob автоматически включает `.test.ts`.

Статус той записи: **STRUCTURAL_DESIGN_ACCEPTED / GENERATION_REVISION_PROPOSED / PRODUCER_BOUNDARY_IN_PROGRESS**. Production launch/pack/Docker/dev pnpm не менялись; full P5/cutover/native не были квалифицированы.

## Same-commit protocol и independent graph prototype

Из101 immutable protocol Git blobs commit `a10cc386c8f71142448383d8bf379cb721f0ae5c` в новом отдельном install tree выполнены canonical ci/build/pack. Начальный Windows artifact:159282 bytes, SHA256 `4c347508d12394759dede8d02ab4edeed5c6f739abcd5f101e5528f3a6bbc2e7`. Checkout/node_modules/user profile не копировались; platform-identical tgz bytes не предполагаются, SRI всегда вычисляется по actual normalized bytes.

Первый combined consumer prototype: frozen registry tuple gate из union существующих root/web/service locks **PASS**, настоящий independent ci254 packages **PASS**, затем strict typecheck дал15 diagnostics из недостающих app inputs. Это **actual source closure RED**, а не install failure. Не хватало `app/human-view/*`, `packages/mcp/src/*`, `packages/meridian/src/theme.ts`. CSD01 regression сначала RED, затем finite roots/file добавлены. Повтор в новом tree: **220 canonical source files, ci/type/fresh Vite+service build из foreign cwd PASS**. Все registry version/resolved/integrity tuples происходят из уже qualified locks; новые версии не выбирались. Six bundled WASI metadata entries относятся к уже зафиксированному parent archive.

Далее actual independent artifact: owned file project/command → progressive SSE → issued MCP stdio → graceful stop/restart → exact frozen receipt replay **PASS**. Owned packaged runner вне install root: CJS/ESM/TS3/3, snapshot bytes неизменны; protocol ESM/CJS/empty HTTP surface **PASS**. В этот момент origin worktree node_modules отсутствовал. Это disposable prototype evidence, не готовый producer/ZIP/launcher.

## Peer findings и исправления immutable audit

Независимый read-only peer воспроизвёл Git replacement objects: при requested/returned original commit выдавались replacement bytes. Сохранены **два отдельные RED** — commit replacement и blob replacement; все Git calls helper получили `--no-replace-objects`, оба GREEN. Root refs/replace read-only:0. Все220 исходников уже выполненного independent proof побайтно совпали с новым canonical inventory; source digest `e36c317ed74ef51309b7c8372d54f8ebd888298b67c84a9eee95c5bfc9c03b67`.

Root source review нашёл prefix audit gap: одинаковый полный lowercase path недостаточен для `A/first.ts` + `a/second.ts` и `X` + `x/child.ts`. Оба **index-only actual Git fixtures RED**, без опасного case-conflicting checkout в Windows. Исправлена таблица original spelling/type каждого prefix; оба GREEN и положительный Cyrillic path GREEN. Source proof на canonical текущем tree этим не обесценивается; это исправление admission для иных input trees.

## Frozen dependency contract и воспроизводимый materializer

Generated data `release/consumer/dependencies.json`, `package-lock.template.json`, `registry-provenance.json` сохраняют343 registry entries (включая6 bundled metadata) из успешного combined graph. Они не являются ещё одним install root. Template SHA256 `73fcc3cba7cb716651712426b09b22c4e8910be063b191086619414ab329f913`, blueprint SHA256 `adc24d8749d326f14ab63c207650e0a6de0805302f09eb8bee551096309d40cd` (canonical LF). Registry tuples заморожены; обновляются только2 product-version slots,2 local tgz path slots,1 protocol version и1 actual SRI.

`dependency-contract.mjs`: meaningful stub **RED4/4**, implementation **GREEN5/5**. Проверены сохранность каждого registry object, source-data tampering, protocol name/dependency/bin/engine/filename mismatch, invalid SemVer/empty artifact и checkout CRLF. Нормализуется только согласованный `./` prefix bin paths с обеих сторон. Helper не выдаёт произвольный Buffer за проверенный tarball: bounded archive/same-commit production подтверждает orchestration. Для actual version/artifact materialized final lock **побайтно равен** lock успешного ci/build/runtime proof: SHA256 `9136f2e4b593cee1225bcf53f75c3706054b5772254ff6c85ef9ce6a3014fa90`.

`materialize-build-tree.mjs`: valid committed fixture сначала дала meaningful stub RED (commit identity пустой), затем GREEN. Public API не принимает внешний tgz: own unique protocol stage получает файлы того же commit, ci(ignore-scripts) и direct canonical pack; actual bounded archive/name/version/SRI проверяются перед output. Existing `protocolMetadata` переиспользован named export +RU JSDoc; старый body/packer behavior не менялись. Output новый, каждый файл wx, source/dependency/tooling inputs представлены относительными provenance entries. Producer stage unique sibling, не часть output/archive и без автоматического unsafe cleanup. Нет working profile или private env discovery.

Consumer build template выполняет Node gate → explicit-root REC → combined/web/service strict typechecks → silent Vite build → service build → browser/service input manifests. `.mjs.template` является committed data для целевого scripts context, а не работающим entry репозитория. No Next runtime/tsx/source protocol symlink в application graph. Npm consumer preparation остаётся ci+fresh build; end-user wrapper ещё отсутствует.

## Воспроизводимый source-build harness и scope локального результата

Новый `npm run consumer:qualify -- --work ABSOLUTE_NEW_DIRECTORY --browser` использует только stdlib до materialization и свой separate consumer install. Dedicated mandatory `consumer-source` CI job **не выполняет root install**, явно проверяет отсутствие root node_modules и требует same pipeline +strict HTML. Chromium install — отдельный явный CI-only flag; локально cached Playwright1.64.1, без browser install/host settings/global multiproject manifest writers. Unit/local precommit fixture содержит canonical app blobs и конечные owner delivery files, затем собственный commit; production materializer читает только этот commit. Origin и fixture SHA в evidence различаются.

Повторяемый run с origin `a10cc386c8f71142448383d8bf379cb721f0ae5c`, fixture `3207dabe1165ea8f7b70cccbf5e1195c9b26dbce`,220 source inputs подтвердил:

- Same-commit materialization, independent ci с **NODE_ENV=production и include=dev**, fresh combined/web/service types +Vite/service build из foreign cwd, source-input closure и local dependency resolution — **PASS**.
- Bare protocol consumer без application dependencies: ESM/CJS/HTTP types .ts/.cts/CLI и invalid-flow refusal — **PASS**.
- Actual file project/command, progressive SSE, issued built MCP stdio, graceful restart/exact immutable receipt — **PASS**.
- Owned Playwright CJS/ESM/TS3 и **неизменённые navigation/cookie6 assertion bodies** из выбранного commit — **9 passed**; SDK snapshots и navigation source bytes неизменны. Own service/runner/browser children закрыты graceful.
- Strict HTML TCP bytes/HEAD gate — **FAIL**, expected672/received1161. Overall **PARTIAL_HTML_INTEGRITY_FAILED**, exit1. Никакого skip/filtering/injected-line удаления или изменения production headers. Это соответствует сохранённому SWD1 Windows host-transformation ограничению; mandatory Linux exact gate ещё **PENDING**.

Report этого run: `C:/Users/krmif/AppData/Local/Temp/ouro-consumer-project-YTfqoG/qualified source & runtime/qualification-report.json` (own retained verification tree, не release input). Полная source delivery/ZIP/launcher/generation/cutover/native/production acceptance из этого не следует.

Последняя дополнительная JS/CSS/font byte check выявила **ошибочное ожидание fixture** `immutable`: действующий static handler отдаёт `public, max-age=3600`. Исправлено только ожидание под существующий header, source/static behavior не менялся; этот шаг не был domain RED.

Финальный повтор 2026-11-05: origin `a10cc386c8f71142448383d8bf379cb721f0ae5c`, fixture `378e81df7d277124f4cf7f255feebecd67e2bf0a`,220 inputs. Materialization, independent ci, fresh foreign-cwd build, source-input closure, local dependency resolution, bare protocol, **точные JS/CSS/woff2 bytes и GET/HEAD Content-Length/cache**, static negative matrix, progressive SSE, issued MCP, persisted restart/exact receipt, runner3 + unchanged browser6 и graceful shutdown — **PASS**. `NODE_ENV='production'` задаётся непосредственно в bounded child environment helper и передаётся в `spawnSync` для `CONSUMER_CI`; `--include=dev` сохранён. Это не только parent environment witness.

Strict HTML TCP/HEAD снова **FAIL672/1161**, overall **PARTIAL_HTML_INTEGRITY_FAILED**, exit1. Финальный report: `C:/Users/krmif/AppData/Local/Temp/ouro-consumer-project-ShTCqq/qualified source & runtime/qualification-report.json`. Source repository install отсутствовал (`sourceRepositoryInstallAbsent:true`); завершённые runner/browser/service children остановлены. Linux mandatory gate остаётся PENDING; этот Windows результат не называется all-green.

## Локальные checks перед source freeze

Root/source peer принял constructor/data/template direction, same-commit provenance, no-replace, wx и fixed substitutions; requested prefix fix выполнен через RED→GREEN. На правильном project tsx runner выполнено:

```text
node --import tsx --no-wasm-code-gc --test --test-concurrency=1
  tests/consumer-source.test.ts tests/consumer-dependency-contract.test.ts
  tests/consumer-materialization.test.ts tests/release-package.test.ts tests/runtime-environment.test.ts
38/38 PASS, 0 skipped: source11 +dependency5 +materialization1 +old pack9 +REC12.
npm run typecheck: PASS (canonical protocol prebuild +root tsc).
Architecture:851 files /0 violations /11 existing exact legacy edges.
Historical migration baseline:47 routes /59 explicit methods PASS.
Styles:16 CSS /10 inline residue files /0 violations; source/ledger unchanged.
Conventions and git diff --check: PASS.
```

Первый запуск old pack tests native Node TS runner не разрешил существующий extensionless `tests/symlink-helper`; это runner setup failure, не product RED. После own unchanged root/web ci (210/81 packages) правильный project tsx выполнил old pack9/9. Новых root/web/service dependencies/locks не добавлялось (REC exact pair уже base); root package получил только developer qualification script. Протокольные generated EOL changes проверены как semantic-zero и восстановлены перед source commit.

Parent сообщил отдельный реальный Linux SPP03 contention failure и ведёт profile-contention fix. Profile-owner/store/DB в этой ветке не меняются; current proof привязан к указанному old source contract. Родительский storage patch и full/Linux CI — **PENDING**, source qualification не называется all-CI-green.

Root peer прочитал committed source, prefix audit fix, lock/materializer/build contract и final qualifier/CLI/mandatory CI job; scoped source review принят. Existing `protocolMetadata` body сохранён буквально, изменены только named export и RU JSDoc. Финальные local checks:38/38 tests (включая old pack9/9 и REC12/12), root typecheck, architecture, historical47/59 migration inventory, current style ledger и conventions — PASS. Продуктовые source/dependency locks относительно base не менялись.

Текущий status: **SOURCE_BUILD_IMPLEMENTED_LOCAL / PARTIAL_WINDOWS_QUALIFICATION / SOURCE_FREEZE_CHECKS_PASSED**. Generation direction принята к детализации, но public `launch/start/build` envelope, stable MCP forwarding, source-edit/pointer/GC policy, ZIP/production/Docker replacement и dev pnpm implementation остаются **NOT_IMPLEMENTED / NOT_QUALIFIED**. No push/PR; реальные пользовательские env/profiles/DB не читались и не менялись.

## Последующая интеграция source-build

2026-11-05: после frozen local result включены принятые service/environment/entity/storage родители. Root опубликовал head00f206e и принял [PR66](https://github.com/QahNaaRlN/ouro/pull/66) в эпик4b234e5 после пяти mandatory CI PASS. Новое source qualification [job126809925511](https://github.com/QahNaaRlN/ouro/actions/runs/41897236221/job/126809925511) работало без root install:238inputs, actual production-env independent ci/includeDev, foreign-cwd fresh builds, portable protocol, exact assets/HTML, SSE/MCP/restart, runner3/navigation6/graceful shutdown — PASS на Linux. HTML672/672bytes; общий scope SOURCE_BUILD_QUALIFICATION/overallPASS/endUserReleaseNOT_QUALIFIED.

Прежний Windows PARTIAL_HTML_INTEGRITY_FAILED сохраняет область и исходные672/1161bytes. End-user generation launcher/installed CLI/ZIP/production cutover не становятся готовыми из-за source-build PASS. Их отдельная implementation story продолжается; текущий интегрированный source-build — **QUALIFIED_INTEGRATED**, полный P5 — **IN_PROGRESS**.
