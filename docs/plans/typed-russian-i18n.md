# D08 · План и журнал typed RU pilot

Дата: 2026-11-05. Ветка `codex/typed-russian-i18n`, база `7074479a1bf993fd456d2403fcdf712fe397fb77`. [SDD](../specs/typed-russian-i18n.md) создан до source. Минимальный scope принят root.

| Область | Статус |
|---|---|
| API/consumer audit и primary docs | COMPLETE |
| Дизайн | ACCEPTED, без Form/state/command changes |
| Immutable before | COMPLETE до source edits, exact base copies/SHA256 |
| Source/test definitions | IMPLEMENTED_LOCAL, unqualified freeze для early peer |
| Static equivalence | PASS:19RU nodes/15texts,5handlers/16classNames,Provider runtime AST |
| Dependency installation/RED/GREEN | NOT_RUN, producer lease / HEAVY-FREE |
| Types/build/browser/consumer qualification | NOT_RUN |
| Peer/commit/CI | PENDING; no push/PR |

## Сохранённый инвентарь

- Root и apps/web manifests пока не содержат i18next/react-i18next; source consumers живут вне apps/web/src, поэтому нужны обе реальные installation trees и independent consumer build graph.
- Форма содержит одну catch presentation с raw `.message`; остальная цепочка workspace-project-view → workspace-project → owner.execute сохраняет существующие boolean/confirmed-only semantics. Изменение catch намеренно ограничено безопасной строкой; область команд не расширяется.
- App Provider уже собирает единственный reporter, runtime/QueryClient, catalog environment, beforeunload и AppErrorBoundary. Все прежние expressions и порядок lifecycle сохраняются; root параллельно меняет DI на другой ветке, поэтому merge не должен возвращать устаревший runtime factory default.
- Frozen consumer inputs: `release/consumer/dependencies.json`, `package-lock.template.json`, `registry-provenance.json`. Contract проверяет точные dependencies, metadata slots, template/blueprint SHA256 и registry tuple digest; его нельзя обновлять случайным npm regeneration поверх unrelated versions.
- Исходный provenance содержит 343 registry entries, исторический sourceCommit a10 и qualification PASS старого графа. При новом графе нельзя автоматически объявить прежние qualification поля доказательством новых dependencies. Новый bounded status, hash/tuple evidence и реально выполненные qualification cases фиксируются отдельно с сохранением ссылки на прежний результат.

## Порядок

1. Прочитать actual AGENTS и installed Next use-client guide из существующего client-error-policy installation; новую worktree не устанавливать. Сохранить exact before Provider/task и primary-source notes в ignored .operations.
2. Подготовить factory, app assembly/augmentation, RU dictionary, pure injected error mapper и meaningful test definitions. Сначала сохраняется исходный copy/AST inventory, потом выполняются только объявленные substitutions.
3. Подключить один scoped Provider и форму; field/submit/domain logic не менять. Новые comments/JSDoc по D11 на русском, React module naming/public index сохраняются. Никаких common package imports назад в legacy.
4. Получить отдельное root dependency окно. Проверить опубликованные exact candidates и peer metadata. Контролируемо обновить root/web manifests/locks, independent blueprint/template/provenance; сохранить сравнение registry tuples и оправдать каждый новый/изменённый package. Не менять unrelated release metadata slots или guards ради GREEN.
5. После разрешения запусков получить meaningful failures там, где фактически возможно before implementation comparison. Prepared source нельзя задним числом объявить написанным после RED. Восстановление baseline делается только контролируемо в своей ветке/fixture, без чужих worktrees/profile или production hooks.
6. Проверить pure/type/runtime cases из SDD, обе compilation trees, architecture/conventions/style и необходимые Next/Vite/consumer/browser cases в согласованное CPU окно. Exact RU/presentation comparison и input/UNKNOWN semantics объявляются только в реально доказанном объёме.
7. Frozen source + evidence передать root на peer; atomic commit без push после принятия. Новые languages, async loader, Form/Zod pilot, bootstrap/global error capture и native qualification остаются отдельными задачами.

## Фактический журнал

- Exact base/clean worktree подтверждены, actual AGENTS и Next guide прочитаны. Primary source candidate metadata и provider/global-plugin distinction переданы root до source.
- HEAVY-FREE соблюдается: npm/install/tsc/build/browser/tests не запускались. Dependency files пока не менялись. Результаты source/static audit будут добавлены отдельно, без выдуманного runtime PASS.
- `.operations/before/manifest.json` до source сохранил Provider 2087 bytes и task 6049 bytes из точного base; `.operations/before/` содержит неизменённые Git bytes. Библиотечный instance не создавался: выполнялись только файловые snapshot/parser scripts.
- Реализованы 10 source modules из SDD и два consumer delta. Shared factory копирует каждый dictionary tree перед init, app assembly содержит только статический RU registry, explicit Provider получает один stable instance. В catch изменён только способ получения строки; прежнее локальное string error state не реорганизовано, нового языка/динамического повторного перевода сохранённой ошибки здесь нет.
- `.operations/text-transfer.json` фиксирует 19 substitutions в 15 ключей. Изначальное ожидаемое число 20 в checker уточнено по actual AST до записи текста; это исправление счётчика evidence script, не product RED. Все исходные русские формулировки copy сохранились.
- `.operations/check-source-equivalence.cjs` / `source-equivalence.json` с Node24.19.0/TypeScript5.9.3: task non-presentation AST exact после исключений из SDD, 5 JSX handlers и 16 classNames exact; Provider runtime/reporting/cleanup AST exact после удаления нового wrapper/state. Import deltas проверены точно; parse diagnostics всех 10 новых source files равны нулю. Production modules не исполнялись, typechecker не запускался.
- Подготовлены `tests/typed-russian-i18n.test.ts`: три meaningful cases готовности/no-global, deep instance isolation, safe injected error keys с getter/secret traps. `tests/typechecks/typed-russian-i18n.ts`: compile-only negative key/namespace/defaultValue cases. Эти проверки пока NOT_RUN, а не GREEN или RED-first evidence.
- `git diff --check` PASS; все семь root/web/consumer dependency files, protocol, ledger и guard остались без изменений. Source передан root для early peer; дальнейшие исправления и qualification выполняются после согласования/выделенного окна. Commit/push/PR не выполнялись.
- Root early peer принял остальной candidate и запросил config admission: отсутствие declared language/default namespace могло дать initialized instance с raw keys. Добавлены bounded own-entry проверки до createInstance, убран пустой ns fallback. Подготовлены пять negative inputs (включая inherited-only entries) и отдельный positive empty-dictionary case; empty dictionary остаётся допустимым. Всё это пока **NOT_RUN**, actual RED/GREEN будет получен только после dependency window; библиотечный runtime сейчас не исполнялся. Factory source после этой правки снова frozen для qualification.

## Точный runbook выделенного dependency окна — пока STATIC ONLY

Разрешение на запуск ещё не выдано. Ни одна команда ниже пока не выполнялась. Producer выполняет свой checkpoint, затем root выдаёт отдельный exclusive grant. Pinned executable — Node24.19.0 из существующего own runtime, npm CLI этой поставки **11.17.0**; системный Node/PATH глобально не меняется.

Перед qualification рекомендован root-owned checkpoint/sync с принятым epic `4e826240` либо более новым явно выбранным SHA. Сохранить createWebProjectRuntime/WEB_PROJECT_SOURCE_ID и type-only public runtime import из PR72; добавить к ним D08 instance/wrapper, не вернуть прежний implicit HTTP factory. Старый707 before/static result остаётся историческим; after-sync Provider сравнивается с точным чистым новым parent отдельно. Семь dependency files между7074479 и4e826240 сейчас идентичны, что подтверждено read-only diff.

### Семь изменяемых metadata files

| File | Единственная цель изменения |
|---|---|
| `package.json` | Добавить exact i18next26.7.1/react-i18next17.1.12 в runtime dependencies |
| `package-lock.json` | Root lock-only resolution этих зависимостей; прежние удовлетворяющие tuples сохранить |
| `apps/web/package.json` | Те же exact runtime pins для независимого web installation tree |
| `apps/web/package-lock.json` | Web lock-only resolution, без смены React/Router/Vite/TypeScript |
| `release/consumer/dependencies.json` | Те же exact pins в отдельном consumer blueprint, без Next и local protocol link |
| `release/consumer/package-lock.template.json` | Собственный consumer graph от прежнего template, только justified dependency closure и прежние finite slots |
| `release/consumer/registry-provenance.json` | Новые canonical hashes/counts/input provenance, честные qualification states для нового graph |

Service manifest/lock, protocol contract/version и release product version не меняются. Если фактический resolver требует другой dependency change, он сначала объясняется по опубликованному closure, а не скрывается массовым lock regeneration.

### 1. Metadata verification и before inventory

Семь raw before files/SHA256 уже сохранены parser-only script в `.operations/dependencies-before/`, без npm. Root lock содержит303 package entries, web132; оба фиксируют React/ReactDOM19.3.1. Consumer template содержит344 entries: один protocol,337 registry URLs и6 bundled entries. Его существующее `registryPackageEntries:343` означает число non-protocol tuple rows, включая bundled subset; это значение не надо ошибочно складывать с6 повторно.

После grant запросить publisher metadata exact package versions через собственный npm CLI (`view <name>@<version> version engines peerDependencies dependencies dist --json`), сохранить безопасный JSON. Не выбирать новый latest автоматически и не устанавливать пакет при отсутствии exact published version. Проверить peer ranges против фактических React19.3.1/TS5.9.3. Для каждой новой transitive dependency сохранить registry resolution/integrity и объяснение parent edge.

Конкретная потенциальная коллизия уже найдена статически: root и consumer имеют `@babel/runtime8.1.0`, а candidate react-i18next требует ^7.29.7. Сохранение существующего8.1.0 с новым совместимым nested7.x допустимо; молчаливое понижение прежнего root tuple или перенос unrelated packages нельзя принять без разбора. В web прежнего Babel runtime нет. Это ожидаемая resolver задача, не уже подтверждённая установленная топология.

### 2. Две development lock-only resolutions

Последовательно, в root и apps/web, выполнить pinned npm `install --package-lock-only --ignore-scripts --no-audit --no-fund --save-exact i18next@26.7.1 react-i18next@17.1.12`. Эти операции дают реальные manifest/lock пары, но ещё не runtime qualification.

Сравнить каждую запись packages до/после: path/version/resolved/integrity и dependencies/peer metadata. Unchanged tuples остаются точными; новые записи должны входить в closure двух pins. Изменение dev/peer flags допустимо только из-за новой runtime reachability. Не применять npm update/audit fix, blanket dedupe или замену всех package metadata. При unrelated churn остановить этот шаг и исследовать причину, сохранить собственный before вместо бездоказательного принятия diff.

### 3. Отдельный consumer graph

Не строить consumer template из root/web lock: они имеют другой dependency universe, Next и local protocol layout. В собственном scratch материализовать прежний consumer manifest/lock с настоящим canonical own protocol tarball и реальными finite metadata values через существующий contract. Для npm resolution нельзя подставлять фиктивные artifact bytes или запускать npm поверх placeholder versions.

На этом manifest/lock выполнить только добавление exact двух pins в lock-only mode. Вернуть прежние шесть finite slot occurrences: product version2, protocol tarball2, protocol version1, protocol integrity1; protocol entry/contract и остальные locked tuples сохранить. Consumer blueprint и template root dependencies должны совпадать буквально. Не менять consumer guard/slots ради GREEN.

Пересчитать blueprint/template SHA256 по LF-canonical JSON и tuple digest точно как в dependency-contract.mjs: sorted `key|version|resolved|integrity` для всех non-root/non-protocol entries + завершающий LF. Пересчитать entry/bundled counts по той же исходной семантике. Числа и SHA не редактируются догадкой.

### 4. Honest provenance

Старый provenance/source a10 и его PASS остаются историей Git/before snapshot, не proof новых пакетов. Новый graph получает pending/not-run qualification до выполнения соответствующих checks. Источник фиксируется как точный root-approved frozen source/checkpoint и отдельные фактические lock blob/hash inputs; нельзя записать будущий self-referential commit SHA или назвать dirty source committed delivery.

`qualifiedLocks` обновляется лишь после реально выполненных local install/type checks соответствующих inputs; до этого новые input hashes остаются в own inventory и квалификация pending. `independentCi`, `combinedTypecheck`, `freshBuildForeignCwd`, `actualServiceRestartSseMcp`, `ownedRunnerCjsEsmTs` не наследуют прежний PASS. После каждой фактической проверки повышается только её точный статус. Linux/native/full P5/publication не повышаются локальными Windows checks. Если committed consumer build ещё невозможен до approved commit, статус остаётся pending до root CI/delivery run.

### 5. Actual installs и проверки

После согласованного tuple diff выполнить fresh pinned `ci --include=dev --ignore-scripts --no-audit --no-fund` отдельно в root/web и собственном материализованном consumer graph, если он входит в данное окно. Никаких чужих node_modules/profile. Не включать install scripts автоматически. Missing registry/cache/setup failures фиксируются отдельно, не product RED.

Проверить installed exact manifests/types: initAsync/bundled synchronous initialization, getI18n/Provider API, typed namespace augmentation в root и web compilation. Запустить пять подготовленных i18n tests и compile-negative cases. Для config admission получить честный regression RED на контролируемой реконструкции pre-admission candidate (own-entry check отсутствует, старый ns fallback сохранён), восстановить frozen candidate в finally, затем GREEN; это regression/mutation confirmation после source, не выдуманное RED-first авторство.

Root/web strict types, architecture/conventions/style/diff, new i18n cases и существующие error-policy regressions проверяются один раз после final source fixes. Existing renderer/error/UNKNOWN4-case suite отдельно проверяет новый Provider wrapper. Next/Vite builds и необходимые route/browser cases выполняются только в пределах grant; повторять уже зелёные heavy jobs без source change или конкретного concern не требуется.

### 6. Meaningful duplicate-context renderer case

В test-only Vite fixture actual production ProjectRuntimeProvider импортируется из root components. Root-scope probe импортирует react-i18next из root tree, а apps/web-scope probe — своим обычным bare import из web tree. Оба должны получить один и тот же instance object, ready=true и реальный RU текст. Ни global initReactI18next, ни явный i18n prop в hook, ни тестовый общий provider вместо production не маскируют различие module identity.

До фикса actual Vite resolver решает, воспроизводится ли split; failure не заявляется по одному предположению. При meaningful RED минимальный config delta — dedupe только i18next/react-i18next в existing Vite resolve policy. Проверить исправление renderer и production build module graph; global singleton/fallback как обход запрещён. Два отдельно смонтированных production Provider должны оставаться разными instances, изменение вложенного dictionary одного не переходит в другой.

Настоящая форма дополнительно сохраняет typed inputs при RU rerender/refresh и не отправляет POST из-за перевода. Existing server receipt/UNKNOWN proof остаётся отдельным real route evidence. Context fixture не выдаётся за полный app/native qualification или native glyph parity.

### 7. Freeze и committed consumer proof

После peer final source/metadata diff и local qualification root согласует atomic commit. Canonical consumer materialization читает committed Git source: full independent build/consumer proof для новых deps выполняется только на реально зафиксированном candidate/CI head, без dirty-tree обхода. До этого consumer provenance остаётся в указанном pending объёме. Root публикует/вливает историю после CI; никаких push/merge из этой static подготовки нет.

Фактический статус всего runbook на момент записи: **NOT_RUN**, кроме read-only inventory и raw metadata snapshots. Producer/F lease не занимался, новых процессов установки/компиляции/браузера нет.
