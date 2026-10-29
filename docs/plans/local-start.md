# Локальный запуск · журнал SDD/TDD

29.10.2026 · [Критерии пакета](../specs/local-start.md).

Исходная база — интегрированный `6879b0d` (alpha.11), ранее 245 unit/integration и 57 production E2E. Этот пакет проверяет запуск и установку; прежние результаты не выдаются за проверки новой обвязки.

При чтении выявлены POSIX-присваивания в npm dev/start, Linux-specific browser/temp/artifact пути и отсутствие clone-команды с полной веткой в README. Следующий шаг — RED на launcher до реализации, затем GREEN и проверка чистого клона с сохранением данных между dev и production.

## RED → GREEN

До реализации две проверки завершились настоящим RED: `npm dev must use a Node entrypoint without shell environment assignments` и аналогичный отказ для start. Сначала ограниченная среда не позволила тестовому subprocess работать; этот запуск не считается RED. Повтор в разрешённой среде показал именно два указанных assertion failure.

После реализации обе проверки GREEN: реальный Node entrypoint запускает fixture Next CLI из пути с пробелами, кириллицей и `&`, сохраняет буквальные аргументы с shell-символами и `OURO_DATA_DIR`, устанавливает loopback и local demo, передаёт код ошибки7. CLI загружается в том же Node-процессе, без shell или промежуточного процесса: сигналы завершения обрабатывает Next. Реальные dev/build/start и чистый клон проверяются следующим gate.

Playwright по умолчанию использует установленный им Chromium, явный `CHROMIUM_PATH` сохранён. Временная БД использует `os.tmpdir()`, два прежних абсолютных screenshot-пути заменены `testInfo.outputPath()`. Нативные Windows/macOS в этой среде не запускались.
