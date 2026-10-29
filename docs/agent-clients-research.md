# Cursor и Claude: источники и решения подключения

29.10.2026 · [OURO-ENG-000016](specs/client-onboarding.md). Разделы ниже прочитаны в актуальных официальных документах до реализации профилей. Результаты исполнения фиксируются отдельно в [SDD/TDD](plans/client-onboarding.md).

## Общий локальный путь

Существующий bridge Ouro уже связывает MCP stdio с project-bound HTTP. Для Cursor/Claude Code/Desktop выбран этот путь: клиент запускает известный локальный Node bridge, а ключ читается из отдельного файла. Так сохраняются прежние transport/auth/scope guards; устанавливать специальный сервер протокола каждого клиента или OpenAI Tunnel для этих клиентов не нужно. Типы состояния и 18 tools версии0.1.2 не меняются.

Конфигурация — инструкция запуска, а не свидетельство, что приложение установлено, модель запущена или работа разрешена. Генератор печатает данные и не заменяет существующие клиентские настройки. Отдельные регистрации дают отдельные identity/отзыв и различимые события.

## Cursor

Прочитаны разделы [официального MCP-руководства](https://cursor.com/docs/mcp): `Using mcp.json`, STDIO fields, Configuration locations, Config interpolation, Using MCP in chat, Tool approval и FAQ/logs. Они задают `mcpServers`, локальные `command`/`args`/`env`, явный `type:stdio`, проектный `.cursor/mcp.json` и личный `~/.cursor/mcp.json`.

В Ouro выбран готовый JSON с абсолютными путями без зависимости от shell expansion клиента. Настройки Cursor позволяют включить сервер и увидеть tools; клиентская политика разрешений сохраняется. Наличие server entry не объявляется фактическим tool call. Первичный источник также описывает ограничения администраторов и MCP Logs — эти средства используются в диагностике вместо предложения отключить проверки.

## Claude Code

Прочитаны [MCP reference](https://code.claude.com/docs/en/mcp): local stdio, `--` и `--env`, mcpServers-import, управление сервером, project trust, installation scopes и add-json. Получены различия `.mcp.json`, private local и user scopes; add-json принимает одну entry. Имя серверного подключения ограничено буквами/цифрами/дефисом/подчёркиванием, поэтому Ouro использует полный UUID с безопасным префиксом.

[CLI reference](https://code.claude.com/docs/en/cli-reference) подтверждает загрузку отдельного JSON-файла через `--mcp-config`. Это предпочтительная альтернатива копированию JSON внутрь shell-команды: она не требует дополнительных правил экранирования для пользовательского пути. Переключатель `--strict-mcp-config` не включается автоматически, поскольку он изменил бы набор остальных доступных MCP-подключений.

Дополнительно прочитаны [environment variables](https://code.claude.com/docs/en/env-vars), [MCP quickstart](https://code.claude.com/docs/en/mcp-quickstart) и [setup/npm](https://code.claude.com/docs/en/setup). Официальный `CLAUDE_CONFIG_DIR` позволяет изолировать настройки, а quickstart уточняет размещение `.claude.json` внутри выбранной папки. Это ориентир технической изолированной проверки, не изменение пользовательского home. Для работы модели пользователь отдельно настраивает свой аккаунт/провайдера; ключ Ouro не подменяет эти credentials.

## Claude Desktop

Прочитаны [MCP local servers](https://modelcontextprotocol.io/docs/2026-07-28/develop/connect-local-servers): Edit Config, JSON mcpServers, full restart, connectors и logs. Профиль Desktop сохраняет canonical command/args/env. Руководство называет macOS-путь `~/Library/Application Support/Claude/claude_desktop_config.json` и Windows-путь `%APPDATA%\Claude\claude_desktop_config.json`.

У разных выпусков и установок точный путь получают через Developer → Edit Config. Поддержка Linux и нативных приложений не выводится из одной JSON-схемы: общий экспорт не объявляется выполненной GUI-проверкой каждой платформы. Облачный разговор claude.ai не запускает локальный stdio-процесс просто от вставки этого JSON.

## Границы выбранного решения

Абсолютный путь, пробелы/Unicode и Windows escaping остаются JSON-данными. Путь key file присутствует в конфигурации, значение ключа — нет. URL не переносит credential и не может подменить project endpoint. Полный projectId в имени исключает коллизию прежнего короткого префикса. JSON для одного клиента не выдаёт доступа к другому проекту.

Нативные edit/shell tools Cursor/Claude Code остаются возможностями этих клиентов. Ouro наблюдает только явно переданные по общему контракту факты; чтение локального файла, внутренний план модели или само копирование config не создают факт исполнения автоматически. Этот предел отражён в инструкции, интерфейсе и статусах queued/ACK.

Локальный запуск требует клиента, Node bridge, key file и доступного Ouro на соответствующей машине. WSL/Windows mapping, удалённый hosting/туннель и публикация MCP в marketplace не добавлены. Как отдельно установленный пользовательский Cursor/Claude подключился на практике, проверяется его tools/вызовом и наблюдавшимися фактами, а не именем регистрации.
