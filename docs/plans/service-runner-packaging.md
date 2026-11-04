# SRP · Журнал Playwright resolver qualification

Дата: 2026-11-04. Ветка `codex/service-runner-packaging`, база `900290a`. [SDD](../specs/service-runner-packaging.md) создан до тестов и кода. Push не разрешён в этой истории.

## До реализации

Прочитаны CONTRIBUTING, принятые service runtime spec/journal, `lib/verification/{local-runner,observation,playwright}.ts`, store runtime ownership, service configuration/build/artifact tests. Актуальные установленные Next 16.4.3 route-handler guides повторно просмотрены; HTTP wrappers в этой истории не меняются. Официальный Node 24.19 API подтверждает синхронный `registerHooks` как release candidate. Установленный Playwright 1.64.1 запускает worker через Node fork без собственного override execArgv; фактическое наследование preload всё равно требует теста.

Исходный runner запускает абсолютный CLI и копирует точные наблюдаемые bytes в scratch; механизма разрешения bare Playwright imports в этой папке нет. Установленные зависимости и product RED проверяются раздельно. Новая ветка оставляет завершённый service runtime worktree чистым для публикации интегратором.

## Результаты

- RED: **3/3 FAIL** — настоящий текущий runner стартовал установленный CLI, но bare imports в copied config не нашли `@playwright/test` (CJS/TS MODULE_NOT_FOUND, ESM ERR_MODULE_NOT_FOUND). `.operations/runner-red.log`. Отсутствующая protocol dist до этой проверки была штатно собрана и не считается RED.
- Реализация: fixed `--import` resource, точный allowlist, явный DI path через service/store, capability `playwrightResolution=ouro-owned-preload/v1`. Server process hook не регистрирует; только его собственный child и наследующий worker.
- CJS/ESM/TS и worker inheritance: **3/3 PASS**. Простой parentURL override оказался недостаточен для Node CJS default resolver: require использует заранее полученный createRequire(owner) URL и shortCircuit; ESM сохраняет штатные import conditions. Provider path/version, relative/builtin imports, отсутствие NODE_PATH/NODE_OPTIONS и unchanged input hashes проверены в настоящем worker. Синтаксическая ошибка собственного TS fixture исправлена отдельно; это не product RED.
- Packaged artifact/HTTP runner: **PASS** для всех трёх форматов. Ordinary built Node service вне source cwd проходит create/command/registered-agent MCP ACK/observation/run/replay. Witness содержит packaged preload и отдельный worker; exact receipt replay не добавляет второй witness. Наблюдаемые workspace bytes и snapshot hashes сохранены.
- Missing resource и counterfeit provider: **PASS**. Startup не открывает profile при отсутствии preload. Локальный fake Playwright не подменяет owner; остальные specifiers сохраняют нормальное локальное разрешение и не переадресуются в server node_modules.
- Итоговая новая группа: **6/6 PASS**, без SKIP; `.operations/runner-final-new-tests.log`. Strict service typecheck включает сам `.mjs` resource через checkJs и проходит.
- Существующие runner regressions: **12/12 PASS**, включая Webpack compatibility, immutable exact recovery, snapshot mutation, stop/revoke и store-before-SQL-close ordering; `.operations/runner-existing-regressions.log`.
- Окончательный build и новая группа вместе с затронутыми прежними artifact/startup/ownership cases: **14/14 PASS**, без SKIP (`.operations/runner-final-service.log`). Полная прежняя группа 37 TCP checks повторно не запускалась.
- Root strict TypeScript, architecture (0 violations, 16 exact legacy edges), migration (47 routes / 59 methods), styles и conventions: **PASS**. Service strict TypeScript/checkJs, build и Next production build: **PASS**. AST audit 5 новых TS/JS files: 0 AnyKeyword, 0 обычных комментариев; новые описания — русские JSDoc. `git diff --check`: PASS.
- Windows Node **24.19.0** / Playwright **1.64.1**: scoped PASS. Linux CI: **NOT_RUN**. Совместимость Node 20 не заявляется. Root consumer engines/launcher пока сохраняют прежний контракт; обязательный Node 24.19 install/launch enforcement относится к P5, а не решён скрыто этой историей.

Root peer review preload, DI/resource/build и local-runner diff: blockers не найдено. Синтаксическая ошибка при добавлении собственного negative test исправлена до финальной группы и не считается domain RED. Root/service/web `npm ci` выполнены по прежним lockfiles; allow-scripts и системный Node не менялись.

SQLite atomic marker, URI normalization, live cutover и browser acceptance остаются за границей этой истории.
