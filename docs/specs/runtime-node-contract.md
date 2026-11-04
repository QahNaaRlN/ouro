# Версия Node для приложения и поставки

Дата: 2026-11-04. Ветка `codex/runtime-node-contract`, база `ca05037`. Основание: принятый Node24, квалифицированный runtime24.19.0 и P5.

Новый service использует Node SQLite и owned Playwright preload/registerHooks. Root launcher всё ещё допускает20.9, а manifests web/service уже закреплены на24.19.0. Нужно согласовать фактический минимальный application runtime до переключения backend. Это явное изменение application prerequisite: **стабильный Node24 LTS, минимум24.19.0, major24**. Будущие major25+ и prerelease не получают непроверенную поддержку; последующие stable24.x удовлетворяют ограничению. Точная CI/dev qualification остаётся24.19.0.

## Область

- Один маленький стандартный ESM helper до установки зависимостей: версия разбирается строго, несовместимый runtime получает понятную ошибку и стабильный code.
- `npm run launch` проверяет runtime до npm/install/build/start. Существующие phases, literal argv, cwd, readiness, cancellation и данные сохраняются. Help доступен без зависимостей.
- Упакованный `dist/main.mjs` остаётся тем же внешним entry path, но сначала проверяет runtime и только затем динамически загружает application bundle. Ни SQLite/PGlite/runner, ни профиль до проверки не загружаются. Wrapper/helper — явные resources build manifest.
- Программный `startService` проверяет application runtime до открытия профиля, worker, listener и resource access. Это не обещание импортируемости всего Node-only bundle на старом Node.
- Root/web/service engine metadata согласуются; `.nvmrc` остаётся точной qualification version. Portable protocol/MCP library consumers не получают новый минимум только из-за application packaging.

В срез не входят окончательная Vite/service поставка ZIP, consumer npm tree, pnpm workspace cutover, Next removal, обновление глобальной установки Node или пользовательского профиля.

## Критерии

1. Pure validator принимает24.19.0/следующий stable24.x и отвергает старые/другие major/prerelease/нестрогие строки.
2. Настоящий несовместимый Node23, если доступен на Windows, завершает launch и built CLI до install/import/profile writes; тестовый sentinel сохранён, phase log пуст. На Linux отсутствие старого executable явно SKIP только этой bounded case; классификатор не пропускается.
3. Положительные existing launcher и artifact/runner/ownership regressions проходят на24.19.0; npm/public entry path/readiness и owned shutdown сохраняются.
4. Новый helper включён в штатный build artifact из известного source; missing helper не обходит gate. Зависимости и lockfile resolutions не обновляются ради engine metadata.
