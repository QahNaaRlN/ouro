# D13: журнал developer workspace

Статус: **LOCAL_QUALIFIED / CI_REVIEW_PENDING**. [Спецификация](../specs/developer-pnpm-workspace.md). Atomic branch `codex/pnpm-workspace`, base epic `6595e2e30e4a3f800e647404c8ac083a1d6892c0`. Порядок задаёт C1 обновлённого плана; Form относится к следующему C2 и не блокирует этот срез.

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

## A1 и ограниченное наблюдение manager lifecycle

Чистый source A1 — `da331be715917a573afcbd3d558722f8b7bc09d1`. Первая оболочка fresh install остановилась до manager из-за собственного пустого Join-Path — setup failure, не продуктовый результат. После исправления только shell path precondition все четыре node_modules отсутствовали; настоящий pinned npm exec/pnpm install установил packages/build scripts и вывел Done in1m12.7s, но естественного exit не произошло. До завершения процесса PASS не присваивался и другой heavy job не запускался.

Own pnpm PID40348 (start11:34:58UTC), npm50300 (11:34:51UTC), cmd39544; Done last-write11:36:11UTC. CPU после Done был стабильным, child process у pnpm отсутствовал, один TCP registry104.16.5.34:443 оставался established. Exact source pnpm214190 запускает optional checkForUpdates unawaited; его отдельный resolver — конкретная гипотеза удержания, не доказанная packet attribution. Root разрешил один lifecycle experiment: workspace updateNotifier:false и уже запланированные canonical service task wrappers; версии/locks, deadlines и native/admission assertions не меняются.

Перед остановкой повторно проверены exact executable/command/parent/creation-time всех трёх own PID; taskkill50300/T закрыл только это дерево. Session10391 завершилась exit1. Результат сохранён **STALLED/OWNER_INTERRUPTED, NOT_PASS**, original log/JSON не заменены. Затем в exact worktree проверены четыре resolved node_modules targets; native PowerShell удалил сначала только reparse links без рекурсии по targets, затем сами четыре каталога. Source/profile/env/cache/store сохранены, git clean и lock SHA403adacb… неизменен.

Epic `19c1f663abb240aed9d78f330c335ba380db334d` (protocol PR79: все7 CI PASS) включён Conventional merge `65c843aef078240045d6f6e12521a6bcf9a59d4a`: delta к imported protocolA3 только docs. Добавлены root service:build/typecheck с protocol prerequisites и service:test с web/service artifact prerequisites; CI вызывает явные root build/type tasks и leaf tests после их artifacts. Service build recipe не менялся. После A2 freeze допускается один fresh repeat с optional notification отключённой. Если он снова удерживает процесс, цикл прекращается с concrete evidence/options; обходной CI=true не используется для сокрытия public non-CI launcher риска.

## A2 installation и static/build qualification

Source A2 `f5524ab610a5eceae6ea0780f5720f86e12e688a` чистый до qualification. Четыре node_modules отсутствовали; один fresh repeat с тем же store/cache и без CI=true завершился естественно **exit0/20.5s**, lock403adacb… byte-unchanged, session73647 закрыта. Это PASS для A2; предыдущий STALLED outcome не заменён. Actual npm exec pnpm --version после installation также PASS: installed workspace:* не вызвал Arborist error.

Первый прямой protocol:check был запущен мной до protocol build на Windows CRLF checkout и остановился на manifest.json. Raw CRLF=true; normalized bytes equalHEAD=true. После штатного protocol:build check PASS; production guard не менялся. На том же A2 sequentially PASS: protocol dual compilation/check, root/web/service strict programs, production web/service builds, architecture **922files/0violations/11exact legacy edges**, migration47/59, styles2ordinary CSS/3inline files/0violations, conventions. Session36589 закрыта. Generated protocol differences проверены normalized Git diff exit0 и восстановлены только в штатных generated paths; source metadata не менялась.

Read-only child import inventory завершён один раз: web21files/10packages, service43/8 и protocol20/2. Service/protocol полностью declared. Root принял exact root-runner-owned test scopes из спецификации; `playwright.config.ts` использует web/tests, а не общий root testDir. Найдено ровно два настоящих application ownership gaps: Fontsource imports в standalone web entry. Root разрешил direct web declarations exact5.3.0, без нового tuple. Offline lock-only update exit0/3.4s добавил ровно6lines importer bindings, packages/snapshots неизменны; audit415identities/0new/0changed integrity, прежняя согласованная таблица10root substitutions неизменна. Новый lock SHA256 `ef5b86a7654f98b034f0d53aecf588913e1751d52461610f860ea16f108392b2`.

Это новый importer input, поэтому A3 freeze предшествует одной заключительной fresh Windows frozen installation с пустыми четырьмя module roots и сохранёнными store/cache. На A3 повторяются web build/font resolution и focused launch/auth/SDK/context proofs; A2 root/protocol/service types, service build и прежние guards переиспользуются только при неизменных соответствующих source/tuple inputs. Полный mandatory CI остаётся обязательным exact publication head. Runtime tests и финальный A3 install пока **NOT_RUN**.

## A3. Заключительный local qualification

Source A3 **`daaddc0df2951c849b16344f8679a69e6ffcfcb6`**. До fresh install native PowerShell проверил четыре resolved module roots внутри exact worktree и удалил только эти installation directories, сначала unlink reparse leaves без обхода targets. Source/profile/env/store/cache не менялись. Actual pinned Node24.19/npm11.17/pnpm10.34.9 frozen install завершился естественно **exit0/13.7s**, все четыре module roots отсутствовали до запуска; lock SHA `ef5b86a7654f98b034f0d53aecf588913e1751d52461610f860ea16f108392b2` byte-unchanged. Web font package links оба5.3.0 и realpath равен соответствующему root package. Session47933 закрыта.

Последовательные actual A3 results:

| Проверка | Результат |
|---|---|
| Canonical web:build с protocol prerequisite | PASS; production bundle/font assets |
| Source launch/relative env/config + auth/rate limits + real HTTP/stdio SDK | 29tests:27PASS0FAIL,2existing Windows platform skips;69.49s |
| CPB01 actual source port compatibility | 1PASS0FAIL; не весь CPB/CGL suite |
| Pnpm entry → explicit npm task → standalone protocol | 1PASS0FAIL62.35s: own npm ci/tarball/ESM/CJS/types/CLI |
| Catalog renderer | 4PASS20.9s |
| Error-policy renderer | 4PASS12.1s |
| I18n actual dev composition | 2PASS9.4s |
| Actual production i18n build/module graph + renderer | 2PASS7.2s; independent Providers/context identity и raw input retention |
| Stale frozen manifest в собственном metadata-only workspace | Actual manager exit1/ERR_PNPM_OUTDATED_LOCKFILE; no node_modules; expected refusal PASS |

Sessions58253 и80446 завершились exit0; owned HTTP/stdio/browser qualifiers закрылись, активной своей exec session нет. Heavy lease передан quality owner до документационных edits. Scope process proof не означает глобальную проверку всех неизвестных процессов Windows.

A2 strict programs/protocol/service build и architecture/style/migration/conventions сохраняют qualification для unchanged source и415exact tuple/SRI inputs. A3 к A2 меняет только две web font declarations/importer links и документацию; оба fonts до и после — тот же physical package5.3.0. Web production build и все affected runtime/context cases выполнены на A3. Полные root/service/PostgreSQL/browser/presentation/consumer Linux/Windows checks не дублировались локально; все семь mandatory CI jobs на publication head обязательны перед merge. POSIX cancellation/signal tests не названы Windows PASS.

Publication B после source A3 изменяет только evidence/текущий progress; A3→B diff обязан быть documentation-only. Actual ZIP/source install fallback/hosted/data migration, C1 quality completion, C2 architecture/Form и дальнейшие C3–C7 не присваиваются этим результатом. Исходный main/dev и их dirty state не затрагивались. [Текущий completion status](react-vite-completion-progress.md).
