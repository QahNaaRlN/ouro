# Журнал application Node contract

Дата: 2026-11-04. Статус: реализация, scoped local qualification и независимое source review PASS; CI/merge PENDING.

План: зафиксировать application prerequisite; meaningful negative runtime tests до кода; общий стандартный helper; launch/service entry и manifests; положительные affected regressions; independent review и CI. Существующий20.9 prerequisite сохраняется в истории как прежний контракт; новый минимум не маскируется обновлением expected без основания. Source/public API protocol version и SQL не меняются.

## Реализация и проверка

Один стандартный `scripts/runtime-node.mjs` проверяет каноническую stable24 с минимумом24.19.0, safe numeric components и отклонением других major/prerelease. Launcher сохранил прежний named export, порядок install/build/start, cwd/argv/readiness/shutdown и help до установки. Стандартный service wrapper остаётся по прежнему `dist/main.mjs` и проверяет версию до dynamic `application.mjs`; wrapper/helper явно входят в manifest и копируются из canonical source. Программный `startService` проверяет prerequisite первой операцией. Root/web/service manifests согласованы; portable protocol/MCP minimum не менялся.

До реализации targeted version test показал настоящий RED: прежний validator принимал23.11.0 (`Missing expected exception`). Первая проба остановилась только на старом тексте ошибки18; порядок уточнён до production edits, и это косметическое несовпадение не выдаётся за policy RED.

Node24.19.0 Windows:

- Existing launcher + actual system Node23 refusal: **8 PASS /2 existing POSIX-only SKIP**,3.1s. Node23 завершает запуск до первой install phase, sentinel существующих тестовых данных сохранён.
- Built artifact/entry/HTTP/MCP/restart/OS crash/runner qualification: **9/9 PASS**,23.6s. Real Node23 не загрузил application witness; Node24 загрузил; отсутствующий helper не обошёл guard; bytes/manifest совпали. Witness проверяет entry ordering, не заменяет actual service tests.
- После синхронизации receipt/type prerequisites `bb1d1a2`: root/service strict types и service build PASS, штатный service suite из его cwd **85/85 PASS**,75.4s. Включены SQL/COMMIT/receipts, raw URI/webhook/SSE/auth, profile locks и реальные verification workers. Последующий parent`d30f4a3` меняет только participant presentation.
- Architecture **848files/0violations/11finite framework edges**, migration47routes/59methods, regular styles gate и conventions PASS. Styles result относится к соответствующей проверенной основе, не означает полного Tailwind rewrite.
- Независимое read-only review подтвердило pre-import gate, package/resource roots, unchanged args/readiness/IPC/signals, engine-only metadata и отдельный portable library contract; blockers нет.

Offline `npm --package-lock-only` отказал из-за отсутствующего optional WASI tarball в cache. Вместо непреднамеренного пересчёта зависимостей явно изменены только три root `packages[''].engines.node` поля lockfiles. Автоматическое deep-equality сравнение с сохранёнными исходниками подтвердило: все остальные поля/resolutions каждого lockfile тождественны. Версии зависимостей не обновлены.

Actual unsupported-executable tests на Linux могут иметь только явно объяснённый SKIP, если отдельного старого Node нет; strict version matrix выполняется везде. Поддержка engine range не присваивает qualification новым24.x автоматически. Финальный consumer ZIP/pnpm/Next cutover, native acceptance, production deploy и реальные профили не изменялись.
