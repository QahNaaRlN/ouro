# D13: журнал developer workspace

Статус: **IMPLEMENTATION_PREPARATION / QUALIFICATION_PENDING**. [Спецификация](../specs/developer-pnpm-workspace.md). Atomic branch `codex/pnpm-workspace`, base epic `6595e2e30e4a3f800e647404c8ac083a1d6892c0`. Порядок задаёт C1 обновлённого плана; Form относится к следующему C2 и не блокирует этот срез.

## Подготовка 2026-11-05

- Прочитаны D13, целевая архитектура, четыре manifest, CI, protocol build и независимый consumer materializer.
- Выявлены реальные потребители protocol npm lock: same-commit producer scratch делает `npm ci`; удаление lock без отдельного materialized producer contract сломает поставку.
- Проверен primary registry manifest pnpm10.34.9; exact tarball/integrity и Node compatibility приведены в спецификации. Установка и executable qualification ещё **NOT_RUN**.
- Системный Node/manager configuration, developer manifests/locks и runtime source не изменены.

## Последовательность

1. Включить квалифицированные i18n/generation/CLI prerequisites и independent protocol producer обычными merge commits. До frozen protocol prerequisite development lockfiles не удалять.
2. Снять точный resolved inventory и описать producer protocol npm graph отдельно от developer workspace. Получить behavior RED для затронутого materializer/installation admission.
3. Сконвертировать development layout в один frozen pnpm graph, адаптировать настоящих consumers lockfile и соответствующие CI/install instructions.
4. Выполнить Windows/Linux qualification и независимые source/generation/protocol/ZIP/hosted/data gates в их реальной области. До их результата не объявлять D13 или весь epic завершёнными.

Ограничение ресурса: локальные install/build/renderer проверки выполняются последовательно с остальными миграционными историями. Эта запись — спецификация и подготовка; не runtime evidence.

## Возобновление и конечный scope

Root разрешил продолжение по C1. Включён epic `b92b5f6c04dc3933881278e066e42259ed4bc690` (CLI PR78, семь CI PASS) обычным Conventional merge `fdc3f4dd15bb16b00f135265c623236d34633886`. Protocol producer ещё квалифицируется отдельно; installs/lock conversion/builds здесь не выполнялись. Исходные четыре lock inventory: root308, web137, service195, protocol3 entries; разные @types/node pins root24.19.2 и web/service24.10.0 намеренно сохраняются.

До source edits согласован bounded source-launch adapter через actual npm exec exact pnpm: публичные argv/env/profile/cwd/exit и три фазы сохраняются; независимый consumer npm launcher не меняется. Source ZIP остаётся source artifact, C5 consumer ZIP не заявляется. Scope production изменений: три importer manifests + root manager/scripts, workspace yaml/lock и удаление четырёх dev npm locks, launcher install phase, конечная npm task composition, Docker/CI и актуальные пользовательские инструкции. Root владеет непосредственным esbuild import и получает существующий exact0.28.2 direct declaration. Protocol manifest/portable engine не меняются.

Следующий короткий RED — настоящий source launcher в собственном valid source fixture без development npm lock: наблюдаемые install/build/start и literal env/cwd/argv. Старый launcher должен отказать на своём package-lock guard; witness не запускает настоящий package manager. Это admission/CLI RED, а не утверждение о pnpm install. Stale frozen lock и workspace link admission проверяются настоящим pinned manager после отдельного heavy окна. Тесты не требуют source dependencies. Новые lint dependencies передаются единственному owner manifests/lock отдельно; общий update ranges/hoisting не допускается.

## PWS01 actual source-launch RED до production edits

Собственный Node24.19.0 выполнил builtin `--test tests/source-workspace-launch.test.mjs`: **1FAIL0PASS411.98ms**. Реальный `scripts/launch.mjs` скопирован без изменения вместе с runtime guard в отдельный temp source fixture: manifest exact pnpm10.34.9, workspace yaml, lock с четырьмя importers, все дочерние manifests, sentinel существующих данных, foreign Unicode/shell-literal cwd. Npm development lock намеренно отсутствует. Actual failure — существующий launcher package-lock admission: `The Ouro release is incomplete`, exit1 вместо ожидаемого0; dependency/module download или runtime mismatch не участвовали. Тестовый npm witness не устанавливает manager/dependencies и в этом RED не был вызван. Лог — ignored `.operations/source-workspace-launch-red.log`; собственный temp fixture удалён после literal temp-root/prefix проверки. Production source/graphs/CI не редактировались, фоновых процессов нет.

Primary pnpm10.x docs при возобновлении подтвердили: import workspace требует предварительно объявленный yaml; allowBuilds поддерживает exact package matchers с10.26.0, strictDepBuilds отклоняет unreviewed scripts. Выбранная версия10.34.9 поддерживает эти настройки. [Import](https://pnpm.io/10.x/cli/import), [allowBuilds/strictDepBuilds](https://pnpm.io/10.x/settings#allowbuilds). Это чтение документации, не install qualification.

## Source adapters и первое окно manager admission

Принятый RED сохранён commit `c5c7c7f5f896f01f948ae0da6d8902195b46fc45`; protocol prerequisite `471e9b2d6716cf0069a93c4fe9c621201dcb5eb8` включён обычным merge `db6bcb5bfb14d4dfec32c673c4d6927bfe1db336`. После конечного source-launch изменения PWS01 dispatch **1PASS0FAIL807.9966ms**; этот witness не является install qualification. Existing FRL03 сохраняет failure/signal/owned-descendant/Ready проверки с новой install command и получает literal relative OURO_DATA_DIR case. Root task composition, Docker и только четыре developer CI installations адаптированы; три consumer zero-source-install jobs и их assertions не менялись. Дочерние developer locks пока сохранены, quality-tool dependencies сюда не входят.

Root дал отдельное окно только bootstrap/import/audit. В свежем own Unicode source fixture скопированы текущие четыре manifests и workspace yaml: root/service имеют workspace:* и node_modules отсутствует. Настоящие Node24.19/npm11.17 запускают exact pnpm через npm exec; `pnpm --version` вернул **10.34.9/exit0/9.02s**. npm Arborist не отказал на workspace:*; это actual bootstrap capability, не pnpm install PASS. Глобальные Node/manager/PATH не менялись; npm update notice не исполнялся.

Перед import сохранены все исходные registry version/resolved/integrity записи: root305, web136, service192, protocol2; unique union425. Стандартный root `pnpm import` exit0 произвёл416 identities, но tuple audit выявил **45missing/36new/0same-key-integrity-change**. В частности, web Babel/Rollup/electron tuples обновились. Такой lock **не принят**; установки и удаления старых locks не было. Исходный неудачный generated lock, inventory/audit и логи сохранены только в ignored `.operations`.

Actual cause прочитан в установленном exact pnpm10.34.9: import handler читает npm lock только из opts.dir, затем передаёт один preferredVersions map всем workspace manifests. Child npm locks не становятся его preferred inputs. Root разрешил **один** bounded repair: отдельный temporary workspace с preference-only aggregate всех четырёх старых registry inventories, сохраняя original version/resolved/integrity и source-lock/path/hash; затем обычный pnpm import и audit. Этот input не является устанавливаемым/committed npm graph; product overrides, resolver или новая конвертирующая библиотека не добавляются. Admission требует ноль genuinely new external tuples и ноль изменённых integrity; исчезнувшие old identities и importer consolidation объясняются отдельно. Пока результат repair **NOT_RUN**, heavy lease возвращён protocol для его bounded SDK case.

## Единственный repair и допуск графа

После закрытия protocol SDK root вернул heavy lease. Один aggregate import завершился exit0 и415identities: **425→415,0new external tuples,0changed integrity**. Все635 preference records сохраняют source-lock/path/hash и исходные version/resolved/integrity; aggregate scratch никогда не устанавливался. Неудачный первый generated lock сохранён отдельно. Стандартный pnpm list lock-only даёт четыре importer trees; исходные деревья получены стандартным npm ls package-lock-only. Полные результаты — ignored `.operations/pnpm-{aggregate-tuple,importer}-audit.json`, raw trees и logs. Это finite migration evidence, не новая production library.

Root прочитал фактический audit и принял конечную [таблицу десяти замен и причину](../specs/developer-pnpm-workspace.md#согласованная-конечная-консолидация-графов) как D13 peer/layout resolution, **не буквальную идентичность четырёх graphs**. Root302→302; service189→189 и protocol2→2 без registry differences; direct versions не менялись, кроме workspace notation и direct declaration прежнего esbuild. Web136→151 связывает optional Vite peers с уже имевшимися root versions. Original root npm ls фиксирует invalid forwarded0.3 против proxy-addr exact0.2 и недостающую optional WASI metadata; service local-protocol metadata без installation также даёт exit1. Эти исходные diagnostics сохранены и не выдаются за domain RED или зелёный baseline.

После допуска скопирован только generated repaired pnpm lock; удалены ровно четыре development npm locks с literal checked workspace paths. Release consumer/protocol-producer npm contracts сохранены. Lock SHA256 до installation: `403adacb32c5115188981147dd2ddb49b02421f21ce427452e3d3c5e37915404`. Qualified protocol A3 `a82f29a67354bea7db2e24ad8d6b9e90af220d64` включён Conventional merge `18abab0a18552eacb7bdb4124913aa15a8eee0b4`, единственный frozen oracle остаётся29989 и не получает current/pnpm fallback.

Следующий gate после source commit A — одна fresh Windows frozen installation, четыре strict programs, production web/service builds, guards, affected FRL03/relative-env и source-task/standalone-protocol checks, настоящие catalog/error/i18n renderer contexts и focused root SDK/auth/rate-limit tests из-за десяти согласованных root substitutions. Все mandatory CI jobs сохраняют полный набор; local full CGL/SDK/browser125 не дублируется автоматически. Fresh install и эти runtime gates пока **NOT_RUN**.
