# D13: единый pnpm workspace разработки

Статус: **SPECIFIED / IMPLEMENTATION_NOT_STARTED**. Основание — принятое [D13](../proposals/react-vite-migration/decisions.md). Ветка `codex/pnpm-workspace` начата от epic `6595e2e30e4a3f800e647404c8ac083a1d6892c0`. Прототип generation launcher и его CLI ещё не переключили установленный выпуск; этот документ не объявляет готовность поставки.

## Проблема и результат

В development tree четыре manifest и четыре npm lockfile: root, `apps/web`, `apps/service`, `packages/protocol`. Web и service устанавливаются отдельно. Целевой developer workflow использует один `pnpm-lock.yaml` и одну команду установки всего workspace. Нынешние версии продукта, wire-контракты и поведение не меняются вместе с менеджером пакетов.

Workspace включает только существующие package units: root, `apps/web`, `apps/service`, `packages/protocol`. Каталоги frontend/client/core/collaboration/mcp/meridian не получают пустые package manifests ради количества workspace packages. Их архитектурные границы и публичные API продолжают проверяться отдельно. Внутренние зависимости на protocol используют `workspace:*`, без registry fallback; самостоятельная protocol-поставка сохраняет обычный npm manifest после упаковки.

Кандидат инструмента — **pnpm 10.34.9**, exact pin. Primary registry проверен 2026-11-05: engine `>=18.12`, tarball `https://registry.npmjs.org/pnpm/-/pnpm-10.34.9.tgz`, integrity `sha512-9JtajqD97bRLs8DB1ldQkqU8KVDZW3rRXfEfF5dId6LeOgHAfpNOmyjOcW5RwJqUlixzBtCb4uHksYqMh2L9Mg==`. Документация подтверждает Node24 для линии10. Выбор совместимой линии не является утверждением, что это latest pnpm. Фактический допуск требует install/build/tests на Node24.19 Windows/Linux. Глобальная установка, изменение системного Node/PATH и автоматическое скачивание другого Node не нужны.

## Граница development и поставки

Один pnpm lockfile принадлежит developer installation. Независимый `release/consumer/package-lock.template.json` принадлежит иному дереву установки и сохраняется: standalone npm launch и producer build должны работать без source `node_modules` и без pnpm у пользователя.

Удаление `packages/protocol/package-lock.json` нельзя выполнять отдельно от producer: current materializer копирует canonical protocol source в новый scratch и делает `npm ci`. Требуется отдельный committed npm dependency contract **для protocol producer tree**, материализуемый в этот scratch с проверкой metadata/integrity. Он не становится вторым lockfile development tree. Действительные source closure, hashes, portable ESM/CJS/types/CLI, fresh pack и negative admission проверяются заново. Копирование старого готового protocol tarball не заменяет сборку того же commit.

Так же нельзя удалить root lockfile и оставить действующие release packer, Docker build или пользовательский launcher зависимыми от него. Переключение выполняется после подготовленного generation/CLI cutover либо вместе с конкретными адаптациями этих потребителей. Зелёный developer install не означает успешный ZIP/hosted release. До переключения текущая npm-установка остаётся рабочей; документация не предлагает несовместимую команду заранее.

## Критерии реализации

1. `packageManager` фиксирует exact pnpm; `pnpm-workspace.yaml` перечисляет три дочерних workspace. Один root lockfile содержит все четыре importers, без nested development npm locks. `workspace:*` не может разрешиться в registry package.
2. До конверсии сохраняется inventory resolved version/integrity для всех четырёх графов. Первоначальный lock строится импортом существующих locks, без общего обновления ranges. Изменения peer layout и реальные несовместимости объясняются отдельно; blanket overrides/hoisting для сокрытия undeclared dependencies не допускаются.
3. Direct dependency принадлежит manifest своего фактического importer. Общие legacy source пока принадлежат root; workspace package не получает фиктивное владение ими. Разные копии React/i18n не создают разные Context в production bundle; существующие renderer probes сохраняются.
4. Fresh Windows/Linux `pnpm install --frozen-lockfile` при пустом installation tree проходит и не изменяет lock. Native/optional dependencies и необходимые build scripts допускаются явно и проверяются; блокирование scripts не объявляется успешной проверкой native runtime.
5. Граф задач явный: protocol build перед typecheck, root tests, service/web builds; runtime/browser tests используют готовые соответствующие artifacts. Turbo не добавляется без потребности и отдельно проверенных cache inputs/outputs/env. CI не теряет существующие обязательные jobs и не продолжает делать три независимые development npm installs.
6. Root/web/service types, architecture/style/HTTP guards, protocol package, unit/service/PostgreSQL и существующие browser/presentation cases проходят в новом layout. Проверки не заменяются ослабленными assertions ради нового resolver.
7. Independent consumer-source и consumer-generation jobs выполняются без development installation, с отдельным frozen npm graph и same-commit protocol producer; `npm run launch`, issued MCP и документированные CLI сохраняют согласованные контракты.
8. Docker/ZIP/foreign-cwd/Unicode-path/restart и closed-profile rehearsal получают фактическое evidence до final cutover. Рабочие env/profile/DB владельца не используются для этих проверок.

## RED и квалификация

Перед поведением installer/producer должны существовать наблюдаемые failing cases: отсутствие/изменение workspace link, stale lock admission, недекларированная зависимость, отсутствие developer installation у consumer producer. Ошибка скачивания pnpm или отсутствие зависимости — setup failure, а не продуктовый RED.

Документационный этап не требует искусственного failing test. На момент записи: pnpm не установлен в этой ветке, lockfile не конвертирован, production scripts не изменены; все implementation gates **NOT_RUN**.

Primary references: [pnpm installation](https://pnpm.io/installation), [workspace protocol](https://pnpm.io/10.x/workspaces), [lockfile import](https://pnpm.io/10.x/cli/import). Для import workspace требуется заранее объявленный `pnpm-workspace.yaml`; импорт сам по себе не доказывает сохранение всего графа.
