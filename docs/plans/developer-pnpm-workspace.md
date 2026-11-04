# D13: журнал developer workspace

Статус: **SPECIFIED / IMPLEMENTATION_NOT_STARTED**. [Спецификация](../specs/developer-pnpm-workspace.md). Atomic branch `codex/pnpm-workspace`, base epic `6595e2e30e4a3f800e647404c8ac083a1d6892c0`.

## Подготовка 2026-11-05

- Прочитаны D13, целевая архитектура, четыре manifest, CI, protocol build и независимый consumer materializer.
- Выявлены реальные потребители protocol npm lock: same-commit producer scratch делает `npm ci`; удаление lock без отдельного materialized producer contract сломает поставку.
- Проверен primary registry manifest pnpm10.34.9; exact tarball/integrity и Node compatibility приведены в спецификации. Установка и executable qualification ещё **NOT_RUN**.
- Системный Node/manager configuration, developer manifests/locks и runtime source не изменены.

## Последовательность

1. Дождаться завершения dependency slices i18n/Form и подготовленного generation/CLI cutover; взять их committed inputs в эту ветку обычными merge commits.
2. Снять точный resolved inventory и описать producer protocol npm graph отдельно от developer workspace. Получить behavior RED для затронутого materializer/installation admission.
3. Сконвертировать development layout в один frozen pnpm graph, адаптировать настоящих consumers lockfile и соответствующие CI/install instructions.
4. Выполнить Windows/Linux qualification и независимые source/generation/protocol/ZIP/hosted/data gates в их реальной области. До их результата не объявлять D13 или весь epic завершёнными.

Ограничение ресурса: локальные install/build/renderer проверки выполняются последовательно с остальными миграционными историями. Эта запись — спецификация и подготовка; не runtime evidence.
