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
