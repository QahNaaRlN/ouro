# SRP · Разрешение Playwright в неизменяемом снимке

Дата: 2026-11-04. Статус: реализация отдельной истории разрешена владельцем эпика. Ветка `codex/service-runner-packaging`, база `900290a` принятой runtime-истории. Production cutover и публикация не входят в задачу.

## Проблема и результат

Runner исполняет точную копию наблюдаемых файлов в собственной scratch-папке. Обычный `require('@playwright/test')` или `import ... from '@playwright/test'` ищет зависимости относительно этой копии, которая находится вне установленного service package. Наличие CLI в сервисе само по себе не доказывает, что config, тест и отдельный Playwright worker найдут пакет. Предыдущий runtime story оставил этот gate **NOT_QUALIFIED**.

Цель — квалифицировать фиксированный server-owned preload на Node 24.19: `--import <owned module>` регистрирует синхронный `module.registerHooks` только внутри разрешённого Node child. Пакет берётся из установленного server package, без изменения наблюдаемых файлов. Если кандидат не обеспечивает реальные CJS/ESM/TS и worker случаи, результат остаётся NOT_QUALIFIED; общая подмена package resolution не допускается.

## Граница реализации

- Preload — обычный серверный resource рядом с прочими packaged resources. Его путь и package anchor определяет composition root; config/HTTP payload проекта не выбирает preload, argv или package root.
- Hook обслуживает только точные `@playwright/test` и необходимый для проверки версии `@playwright/test/package.json`. Для прочих specifiers вызывается штатный следующий resolver; Node import/require conditions сохраняются. Список не является общим поиском в server node_modules.
- CLI по-прежнему разрешается из server package. Preload передаётся только через argv собственного child, до CLI; процесс сервиса не регистрирует hook. Окружение child остаётся ограниченным и не наследует пользовательские NODE_PATH/NODE_OPTIONS. Глобальные environment variables, junction, symlink, установка в scratch и переписывание imports запрещены.
- Source compatibility Next остаётся: значение по умолчанию указывает на server-owned resource в исходном дереве. Built service получает явный путь от артефакта, независимый от cwd. Никаких Next runtime imports в service не добавляется.
- Все существующие authority checks, observed manifest, точные UTF-8 bytes/BOM, hashes, immutable receipts, повтор без перезапуска и cancel/drain сохраняются. Новый механизм отражается в capabilities новых наблюдений; старые события/снимки не переписываются.

## Наблюдаемые критерии

1. Meaningful RED: установленные CLI и Playwright доступны, но настоящий текущий runner не исполняет bare-import fixture из scratch вне install root. Missing dependency или unavailable test environment не считается RED.
2. Реальные CJS, ESM и TypeScript configs/tests импортируют установленный пакет из snapshot вне install root. Внутри test body подтверждается выполнение в отдельном Playwright worker; package version/identity соответствует server package. Relative imports и Node builtins продолжают работать.
3. Точный allowlist не открывает соседние server packages, неподдержанные subpaths или произвольные bare specifiers. Собственный локальный relative import не переадресуется. Локальный counterfeit пакет не подменяет разрешённый server package.
4. Ordinary built Node service запускается вне source cwd. Через существующие HTTP/command/observation/run guards создаётся реальная проверка и immutable результат. Packaged preload и его manifest resource реально доступны; отсутствие resource завершается явной ошибкой, без fallback. Test snapshots и исходный workspace после запуска имеют прежние bytes/hashes.
5. Cancellation/drain текущего runner и точный recovery не регрессируют. Сборка и strict types проходят; CI выполняет эту группу как часть обязательных service tests, без нового необязательного шага.

## Проверки и ограничения

Primary API: [Node 24.19 module.registerHooks](https://nodejs.org/download/release/v24.19.0/docs/api/module.html#moduleregisterhooksoptions), статус release candidate. Совместимость закреплена за Node 24.19 и текущим установленным Playwright; другая версия требует повторной квалификации. Windows проверяется локально, Linux — отдельным фактическим CI результатом. Browser binaries и полный browser acceptance не доказываются тестами, которым браузер не нужен.

Только synthetic memory/temp profiles, snapshot fixtures и собственные Node children. Служебный SQLite marker, URI normalization, обычный root launch/Docker, потребительская установка, UI/Tailwind и Meridian host остаются отдельными историями. Переход этого bounded gate в PASS не означает завершение полного P2 или production acceptance.
