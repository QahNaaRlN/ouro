# Журнал REC environment compatibility

Дата: 2026-11-04. Ветка `codex/runtime-environment-compatibility`; base `16943f52d03ad496c3e56ff1233be3f589c0d55d`. [Спецификация](../specs/runtime-environment-compatibility.md).

## До source

Прочитаны installed Next16.4.3 environment guide, CLI/config loader, bundled @next/env16.4.3 implementation/package metadata, actual local-next/hosted-next/launch и README. Выявлена потеря `.env.local` при прямом standalone service; root подтвердил отдельный обязательный compatibility adapter без Next runtime dependencies. Создан новый изолированный worktree от SWD1; текущая consumer ветка не смешивает producer/tree изменения с parsing semantics.

Исходное наблюдение: Next CLI default NODE_ENV=production для build/start, но непустой inherited NODE_ENV сохраняется; @next/env выбирает MODE=production при dev=false кроме NODE_ENV=test. local wrapper forcing предшествует loading. hosted validation предшествует loading и принудительным production/cloud flags. Bundled parser versions16.3.1/10.0.0 зафиксированы как кандидаты, install/qualification пока не выполнены.

Статус этой исходной записи: **DESIGN_PROPOSED / IMPLEMENTATION_NOT_STARTED**. Synthetic baseline/tests на тот момент: **NOT_RUN**. Source/dependency/lock changes на тот момент: **NONE**. Реальные пользовательские env/profiles/DB/production не читались. Consumer independent install, full P5/cutover/native: **NOT_QUALIFIED**.

## Read-only synthetic characterization

Pinned Node24.19 с установленным SWD1 `@next/env16.4.3`, семь свежих child processes, собственные `tmpdir()/ouro-env-characterization-*` dirs: **7/7 PASS**. Подтверждены precedence четырёх production files, inherited development + production phase, special test/local skip, quotes/multiline/duplicate/escaped dollar/default expansion, forward/backward cross-file references, cycle-file failure + continuation. Next internal `__NEXT_PROCESSED_ENV` отключает loading; перенос этого framework control/cache не предлагается. Все dirs проверены по parent/prefix и удалены, реальные env не читались.

Также actual unmodified `scripts/local-next.mjs start --port 47813` запущен со своим minimal temp Next config (завершает собственный child до app/DB). Сняты production mode, inherited development и forced localDemo=1. Первое ожидание fixture было ошибочным: ожидался PORT из env file49999, фактически получен выбранный CLI47813. Исходники Next `start-server.js:280` подтверждают предварительную запись PORT; это **ошибка characterization expectation, не domain RED**. Окончательный повтор и сохранённые regression tests ещё NOT_RUN.

Исправленный повтор actual local-next start: **PASS**, выбранный PORT47813 сохраняется, synthetic inherited-dollar reference раскрывается старым loader. Child самостоятельно завершён, собственный temp root удалён. Listener/profile/fixture процессов не осталось.

Сверены primary exact-tag [dotenv16.3.1 README](https://github.com/motdotla/dotenv/blob/v16.3.1/README.md) и [dotenv-expand10.0.0 source](https://github.com/motdotla/dotenv-expand/blob/v10.0.0/lib/main.js). Новые версии не выбирались. Production helper/dep/lock source остаются NONE до design review.

## Design admission и meaningful RED

Root прочитал оба SDD и принял REC до production helper implementation. Разрешён только exact pair dotenv16.3.1 / dotenv-expand10.0.0; Next-private processed/cache/reload controls явно исключены. Current launch/local-next/hosted-next/service entry не подключаются и не меняются; consumer integration принадлежит SWD2.

Сначала создан no-op loader с уже действующим Node gate и сохранены behavioral fixtures. Зависимости установлены pinned Node24.19/npm, затем выполнено:

```text
node --import tsx --test --test-concurrency=1 tests/runtime-environment.test.ts
RED: 10 tests, 1 PASS, 9 FAIL, 0 skipped.
```

REC01: old loader успешно вернул четыре файла/их значения; candidate вернул пустые loadedFiles и только inherited значения. REC02/03/04/05/06/09 не получили ожидаемые file settings; actual old local-next достиг owned config witness, candidate не загрузил FIXTURE_MODE. REC07 не отказал invalid options, REC10 не установил phase default. REC08 с **реальным Node23.11.0** уже PASS: gate сработал до FS witness и отсутствующего parser install. Это domain RED отсутствующей совместимости, не ошибка установки или недоступный server.

## Реализация и ограниченность dependency diff

`scripts/runtime-environment.mjs` имеет только stdlib/helper static imports; gate предшествует validation, FS calls и динамическим parser imports. Absolute root + finite phase; root-only fixed filenames, current process precedence, MODE selection, exact parse/expand, first-file reconciliation и safe diagnostic codes. Helper не возвращает env values/contents/raw errors и не пишет console logs. Loader — однократный bootstrap текущего процесса, не новый identity/config singleton или HMR.

Root package/lock добавляют только dotenv16.3.1 и dotenv-expand10.0.0. `npm install --package-lock-only --ignore-scripts --save-exact ...` дополнительно добавил шесть optional bundled WASI metadata entries и переставил два существующих TanStack objects. Это обнаружено structural diff, не принято: шесть additions удалены, original order восстановлен. Финальный tracked lock diff — **23 additions**, manifest — **2 additions**; сравнение каждого unrelated package object/resolved/integrity с HEAD **PASS**. Нет library upgrades и изменений root scripts или nested locks. `npm ci --include=dev` в собственном worktree установил210 packages; existing esbuild allow-scripts notice не менялся.

## Проверки и текущие ограничения

- После реализации: **REC12/12 PASS, 0 skipped**. REC01 содержит семь differential cases на fresh children. Дополнительно сохранены cycle continuation, owned-root-only discovery, independent build/start reload, explicit Next-private-control exclusion, actual unmodified local-next start с ephemeral PORT и actual hosted pre-file rejection, fixed failure diagnostics и настоящий Node23.11 gate.
- Affected existing launch/hosted + initial REC10: **20 PASS / 2 existing Windows POSIX-only skips / 0 FAIL**. Новые REC tests не имеют Windows skip в текущем прогоне.
- `npm run typecheck` сначала выявил test-only Next augmentation: ProcessEnv требует NODE_ENV, хотя fixtures намеренно проверяют его отсутствие. Исправлена только typed fixture boundary; прямой `tsc --noEmit` затем **PASS**. Это qualification/type error, не product RED.
- Первый architecture scan был запущен одновременно с protocol build и без nested web install: получил unresolved protocol/Router modules. Это environment ordering/install failure, не domain RED. Установлен неизменённый apps/web lock (81 package), scan повторяется после build; результаты ниже фиксируются отдельно.
- Protocol build создал только ожидаемые generated line-ending changes; до commit обязателен semantic-zero check/restore. Рабочие env/profiles/DB/production не читались. Consumer install/full P5/cutover/native/Windows source ZIP acceptance остаются **NOT_RUN / NOT_QUALIFIED**.

## Финальная локальная квалификация и peer review

Root прочитал adapter/DTS и exact manifest/lock delta и принял source peer review. Отдельно подтвердил, что current wrappers/DB не подключены, Next internal cache остаётся вне контракта и SWD2 install-tree ownership пока OPEN.

Pinned executable для всех команд: `D:/PersonalProjects/ouro-worktrees/react-vite-foundation/.operations/runtime/node-v24.19.0-win-x64/node.exe`; npm CLI — соседний `node_modules/npm/bin/npm-cli.js`, PATH менялся только в дочернем shell. После ручного исключения посторонней metadata выполнен **повторный настоящий `npm ci --include=dev` на окончательном lock: PASS** (210 packages). Финальное сравнение каждого unrelated package object/resolved/integrity с HEAD: **UNCHANGED / PASS**; изменения только root dependency map и два новых exact package entries. Native/system/global npm/Node настройки не менялись.

```text
node --import tsx --test --test-concurrency=1 tests/runtime-environment.test.ts tests/release-launch.test.ts tests/hosted-launch.test.ts
24 tests: 22 PASS / 2 existing POSIX-only Windows skips / 0 FAIL.
REC отдельно: 12 PASS / 0 skipped, включая реальный Node23.11.
node node_modules/typescript/bin/tsc --noEmit: PASS.
node scripts/check-architecture.mjs: 851 files / 0 violations / 11 exact existing legacy edges.
node scripts/check-migration-baseline.mjs: original 47 routes / 59 exports PASS.
node scripts/check-ui-styles.mjs: 16 CSS / 10 inline residue files / 0 violations.
node scripts/check-conventions.mjs: PASS.
git diff --check: PASS.
```

Protocol generated changes проверены через `git -c core.autocrlf=false -c core.safecrlf=false diff --ignore-space-at-eol --exit-code -- packages/protocol` (**semantic zero**) и восстановлены только в своём worktree. Новые tests входят в existing обязательный root npm test CI glob; full CI этим агентом не выполнялся. Current source/build/start/service entry не изменены; env adapter integration и independent consumer install/producer/Windows/Linux ZIP остаются SWD2.

Текущий статус: **IMPLEMENTED_LOCAL / TARGETED_PASS / SOURCE_PEER_ACCEPTED**. Scoped commit разрешён root после этих checks. No push/PR/production changes; реальные пользовательские env/profiles/DB не читались. Full P5/cutover/Next removal/native acceptance: **NOT_QUALIFIED**.
