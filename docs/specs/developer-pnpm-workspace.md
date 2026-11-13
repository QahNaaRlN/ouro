# D13: единый pnpm workspace разработки

Статус: **LOCAL_QUALIFIED / CI_REVIEW_PENDING**. Основание — принятое [D13](../proposals/react-vite-migration/decisions.md) и [операционный C1](../plans/react-vite-completion.md). Ветка `codex/pnpm-workspace` начата от epic `6595e2e30e4a3f800e647404c8ac083a1d6892c0`; квалифицированные delivery prerequisites включены обычным merge `fdc3f4dd15bb16b00f135265c623236d34633886` от epic `b92b5f6c04dc3933881278e066e42259ed4bc690`. Независимый generation launcher и три agent CLI приняты в epic; реальный consumer ZIP остаётся C5, а не результатом этой подготовки.

## Проблема и результат

В development tree четыре manifest и четыре npm lockfile: root, `apps/web`, `apps/service`, `packages/protocol`. Web и service устанавливаются отдельно. Целевой developer workflow использует один `pnpm-lock.yaml` и одну команду установки всего workspace. Нынешние версии продукта, wire-контракты и поведение не меняются вместе с менеджером пакетов.

Workspace включает только существующие package units: root, `apps/web`, `apps/service`, `packages/protocol`. Каталоги frontend/client/core/collaboration/mcp/meridian не получают пустые package manifests ради количества workspace packages. Их архитектурные границы и публичные API продолжают проверяться отдельно. Внутренние зависимости на protocol используют `workspace:*`, без registry fallback; самостоятельная protocol-поставка сохраняет обычный npm manifest после упаковки.

Кандидат инструмента — **pnpm 10.34.9**, exact pin. Primary registry проверен 2026-11-05: engine `>=18.12`, tarball `https://registry.npmjs.org/pnpm/-/pnpm-10.34.9.tgz`, integrity `sha512-9JtajqD97bRLs8DB1ldQkqU8KVDZW3rRXfEfF5dId6LeOgHAfpNOmyjOcW5RwJqUlixzBtCb4uHksYqMh2L9Mg==`. Документация подтверждает Node24 для линии10. Выбор совместимой линии не является утверждением, что это latest pnpm. Фактический допуск требует install/build/tests на Node24.19 Windows/Linux. Глобальная установка, изменение системного Node/PATH и автоматическое скачивание другого Node не нужны.

## Граница development и поставки

Один pnpm lockfile принадлежит developer installation. Независимый `release/consumer/package-lock.template.json` принадлежит иному дереву установки и сохраняется: standalone npm launch и producer build должны работать без source `node_modules` и без pnpm у пользователя.

Удаление `packages/protocol/package-lock.json` нельзя выполнять отдельно от producer: current materializer копирует canonical protocol source в новый scratch и делает `npm ci`. Требуется отдельный committed npm dependency contract **для protocol producer tree**, материализуемый в этот scratch с проверкой metadata/integrity. Он не становится вторым lockfile development tree. Действительные source closure, hashes, portable ESM/CJS/types/CLI, fresh pack и negative admission проверяются заново. Копирование старого готового protocol tarball не заменяет сборку того же commit.

Так же нельзя удалить root lockfile и оставить действующие Docker build или пользовательский launcher зависимыми от него. Переключение выполняется вместе с конкретными адаптациями этих потребителей. Зелёный developer install не означает успешный ZIP/hosted release. До переключения текущая npm-установка остаётся рабочей; документация не предлагает несовместимую команду заранее.

### Конечная адаптация source launcher

Root согласовал конечную границу до изменений: `scripts/launch.mjs` обслуживает developer source tree и текущий source ZIP; независимый consumer envelope использует отдельный `scripts/consumer-launch.mjs`. Публичная source-команда `npm run launch`, argv/port, исходный env, собственный root/cwd, profile/data paths, exit codes, отмена и порядок трёх фаз сохраняются. Меняется только source installation: настоящий npm CLI запускает `exec --yes --package=pnpm@10.34.9 -- pnpm install --frozen-lockfile --prod=false`. Глобальная установка pnpm у пользователя не требуется. Затем выполняются прежние source build/start; Next удаляется на C6. Явная npm task composition устанавливает `npm_execpath` для этой команды и npm-dependent tests/protocol utilities; pnpm CLI не передаётся как npm CLI, resolver по PATH не добавляется.

Независимый consumer остаётся на своём frozen npm graph, `npm ci --include=dev` и fresh build при каждом launch. Developer source installation не является его fallback. `packRelease` продолжает архивировать exact committed **source** tree; ранний перенос archive format/операторских утилит в envelope не входит в этот срез. README различает source preparation и пока не квалифицированный на C5 consumer ZIP. Исторические refs с собственным старым launcher/lock и минимальные source-archive fixtures сохраняют прежний смысл.

Docker получает тот же четырёх-importer frozen pnpm graph в build/production-deps stages; обычный hosted runtime и mandatory image smoke остаются прежними до C5/C6. Все семь CI jobs и их assertions сохраняются: четыре developer jobs переходят на одну workspace installation, три independent consumer jobs продолжают запускать npm qualifiers без source node_modules.

## Критерии реализации

1. `packageManager` фиксирует exact pnpm; `pnpm-workspace.yaml` перечисляет три дочерних workspace. Один root lockfile содержит все четыре importers, без nested development npm locks. `workspace:*` не может разрешиться в registry package.
2. До конверсии сохраняется inventory resolved version/integrity для всех четырёх графов. Первоначальный lock строится импортом существующих locks, без общего обновления ranges. Допускается только конечная согласованная консолидация ниже; буквальная идентичность четырёх разных layouts не заявляется. Изменения peer layout и реальные несовместимости объясняются отдельно; blanket overrides/hoisting для сокрытия undeclared dependencies не допускаются.
3. Direct dependency принадлежит manifest своего фактического importer. Общие legacy source пока принадлежат root; workspace package не получает фиктивное владение ими. `scripts/build-hosted-operations.mjs` непосредственно импортирует esbuild: root получает exact devDependency `esbuild: 0.28.2` из уже разрешённого root tuple, без обновления версии. Разные копии React/i18n не создают разные Context в production bundle; существующие renderer probes сохраняются.
4. Fresh Windows/Linux `pnpm install --frozen-lockfile` при пустом installation tree проходит и не изменяет lock. Native/optional dependencies и необходимые build scripts допускаются явно и проверяются; блокирование scripts не объявляется успешной проверкой native runtime. В исходных locks install scripts имеют esbuild0.28.2, service tsx/esbuild0.25.12 и optional fsevents2.3.3. Workspace задаёт конечный versioned allowBuilds для обеих esbuild versions и strictDepBuilds; fsevents явно запрещён для Windows/Linux qualification, macOS qualification не присваивается.
5. Граф задач явный: protocol build перед typecheck, root tests, service/web builds; runtime/browser tests используют готовые соответствующие artifacts. Turbo не добавляется без потребности и отдельно проверенных cache inputs/outputs/env. CI не теряет существующие обязательные jobs и не продолжает делать три независимые development npm installs.
6. Root/web/service types, architecture/style/HTTP guards, protocol package, unit/service/PostgreSQL и существующие browser/presentation cases проходят в новом layout. Проверки не заменяются ослабленными assertions ради нового resolver.
7. Independent consumer-source и consumer-generation jobs выполняются без development installation, с отдельным frozen npm graph и same-commit protocol producer; `npm run launch`, issued MCP и документированные CLI сохраняют согласованные контракты.
8. Docker/ZIP/foreign-cwd/Unicode-path/restart и closed-profile rehearsal получают фактическое evidence до final cutover. Рабочие env/profile/DB владельца не используются для этих проверок.

## RED и квалификация

Перед поведением installer/producer должны существовать наблюдаемые failing cases: отсутствие/изменение workspace link, stale lock admission, недекларированная зависимость, отсутствие developer installation у consumer producer. Ошибка скачивания pnpm или отсутствие зависимости — setup failure, а не продуктовый RED.

Документационный этап не требует искусственного failing test. Исторический первый checkpoint: pnpm не был установлен, lockfile не конвертирован, production scripts не изменены. Текущие результаты перечислены в журнале; fresh install/build/browser gates не присваиваются по одному только import.

Primary references: [pnpm installation](https://pnpm.io/installation), [workspace protocol](https://pnpm.io/10.x/workspaces), [lockfile import](https://pnpm.io/10.x/cli/import). Для import workspace требуется заранее объявленный `pnpm-workspace.yaml`; импорт сам по себе не доказывает сохранение всего графа.

## Согласованная конечная консолидация графов

Exact pnpm10.34.9 import берёт preferred versions только из npm lock текущего каталога. Первый import обновил36 внешних identities и отклонён. Единственный разрешённый repair использует временный preference-only aggregate635 исходных registry records с version/resolved/integrity и original lock/path/hash, затем штатный import. Aggregate не устанавливается и не коммитится как npm graph. Результат: **425→415 unique identities,0new external tuples,0changed integrity**, без product overrides или нового resolver. Источники остаются frozen locks commit `db6bcb5bfb14d4dfec32c673c4d6927bfe1db336`.

Root принял следующие десять замен только в root reachable graph как D13 peer/layout resolution. Каждая выбранная версия уже находилась в старом web/service lock; service и protocol reachable graphs не меняются.

| Root dependency | Раньше | В pnpm | Исходный frozen importer |
|---|---|---|---|
| @hono/node-server | 2.1.5 | 2.1.6 | service |
| baseline-browser-mapping | 2.11.34 | 2.11.35 | web |
| caniuse-lite | 1.0.30001819 | 1.0.30001820 | web |
| encodeurl | 2.0.0 | 2.0.1 | service |
| express-rate-limit | 8.7.1 | 8.7.3 | service |
| forwarded | 0.3.0 | 0.2.0 | service; proxy-addr требует exact0.2.0 |
| hono | 4.13.14 | 4.13.16 | service |
| ip-address | 10.7.5 | 10.7.6 | service |
| jose | 6.2.13 | 6.2.15 | service |
| qs | 6.17.0 | 6.17.1 | service |

Standard lock-only inspection даёт root302→302, service189→189 и protocol2→2 reachable identities. Web136→151 получает optional Vite peers из уже существующего root graph: jiti2.7.0, tsx4.23.15, lightningcss1.32.0 со всеми его platform packages и detect-libc2.1.2. Это явная binding-консолидация, а не новые registry версии. Direct resolved versions сохраняются; @ouro/protocol0.3.0 получает workspace link notation, root непосредственно объявляет уже существующий esbuild0.28.2.

Исходный npm lock-only baseline не объявляется полностью зелёным: npm фиксирует root forwarded0.3.0 как invalid против exact0.2.0 и отсутствующие optional WASI records; service fixture сообщает отсутствующие local-protocol child metadata без installation. Эти результаты сохранены отдельно от actual install и domain RED. Новый layout обязан пройти focused root SDK/auth/rate-limit проверки, strict programs, native/runtime production builds и настоящие catalog/error/i18n renderer probes. Все mandatory CI checks и независимый frozen consumer graph сохраняются. Actual ZIP/hosted/data rehearsal остаётся C5.

## Явный task graph и ограниченная manager policy

Канонические developer commands принадлежат root; `npm run` и `pnpm run` используют один набор scripts:

| Команда | Обязательная подготовка |
|---|---|
| dev, build, typecheck, test | protocol build через именованный prehook |
| web:dev, web:build, web:typecheck | protocol build через именованный prehook |
| service:build, service:typecheck | protocol build через именованный prehook |
| service:test | service:build → web:build → leaf service tests |
| browser/presentation qualification | CI явно собирает соответствующие artifacts перед renderer steps |

Raw workspace commands/recursive build — низкий уровень с готовыми protocol/artifact prerequisites. Web использует root-owned общий source, для которого не создаётся фиктивный package dependency. Изменений immutable service build recipe, watch orchestration или Turbo нет. CI может вызывать leaf service tests после своих явных именованных build steps, не повторяя те же builds ради wrapper.

Для exact pinned manager задаётся `updateNotifier:false`: выключена только optional latest-version notification, остальные registry/native/frozen/admission проверки сохранены. Первый natural-exit gate завис после строки Done и остановлен как STALLED/OWNER_INTERRUPTED; separate unawaited update resolver и registry socket объясняют гипотезу, а не доказанную причину. Следующий один fresh run обязан завершиться естественно exit0; один printed Done не считается PASS. [Официальная настройка](https://pnpm.io/10.x/settings#updatenotifier).

## Конечное владение child imports

Один read-only AST inventory проверил apps/web21, apps/service43, packages/protocol20 source/config/test files, исключив install/generated output. Все прямые внешние imports service/protocol объявлены их manifests. Web standalone entry действительно импортирует оба Fontsource packages: web получает direct exact5.3.0 для Inter и JetBrains Mono, уже имеющиеся в root frozen graph. Offline lock-only изменение добавляет только две importer bindings, ни одной новой package/snapshot tuple или integrity.

Root владеет общим Playwright runner и этими конечными web tooling scopes: `apps/web/playwright.config.ts` (navigation tests в `apps/web/tests`), catalog/error-policy/i18n/service configs (собственные testDir указаны в configs), `apps/web/tests/navigation.spec.ts` и `apps/web/tests/fixtures/service-web-setup.ts`. Query import в `apps/web/tests/fixtures/catalog-probe.tsx` принадлежит root-owned renderer probe. Соответствующие @playwright/test1.64.1 и Query5.105.3 объявлены root; отсутствие у ближайшего child manifest здесь не скрывается hoisting и не превращается в общее исключение для application imports. Обычный web app/Vite source остаётся web-owned. Новый dependency-lint framework не добавляется.
