# OURO-ENG-000016 · Cursor и Claude подключаются к Ouro по MCP

29.10.2026 · SDD до кода · база `cdfb7ae` · отдельная ветка `feat/client-onboarding`, alpha.15. Пользователь запросил подключение Cursor и Claude. Поддерживаются Cursor, Claude Code и Claude Desktop; ChatGPT остаётся прежним примером. Общий протокол `@ouro/protocol@0.1.2`, tools и доменные статусы не меняются.

## Наблюдаемый результат

В проекте человек выбирает MCP-клиент, выдаёт отдельную регистрацию/ключ, сохраняет ключ в локальный файл и получает конфигурацию именно для выбранного клиента с точным project URL. Cursor: `.cursor/mcp.json` открытой рабочей папки или глобальный `~/.cursor/mcp.json`. Claude Code: `.mcp.json` открытой рабочей папки; альтернативный `claude mcp add-json` принимает одну server entry, не весь wrapper. Claude Desktop: свой `claude_desktop_config.json` через Settings → Developer → Edit Config. Для этих локальных stdio-клиентов Secure MCP Tunnel не нужен.

Конфигурация использует уже работающий stdio bridge Ouro и явные `OURO_URL`/`OURO_AGENT_TOKEN_FILE`. Node, bridge и key file задаются абсолютными путями; JSON сохраняет пробелы, Unicode и Windows backslashes. Literal ключ не попадает в конфигурацию, argv, URL, localStorage или скачиваемый JSON. Имя MCP server содержит полный projectId, чтобы разные проекты с одинаковым префиксом не замещали друг друга.

Browser и настольный клиент запускаются на машине с Ouro либо с установленным там bridge/runtime. `127.0.0.1` относится к машине клиента; облачный localhost не выдаётся за публичный адрес. Ключ Ouro и API/account credentials Cursor/Anthropic — разные вещи. Генератор не редактирует существующие клиентские настройки и не запускает клиент/модель; инструкция показывает безопасное добавление entry в существующий mcpServers без потери соседних подключений.

## Общий генератор

Pure модуль `lib/agent-client-config.ts` принимает `{client,connection:{projectId,httpUrl,stdioCommand,stdioArgs},keyFile}` и отдаёт `{serverName,entry,config}`. Клиенты: `cursor`, `claude-code`, `claude-desktop`, `chatgpt`. У Cursor/Claude Code entry содержит `type:'stdio'`; у Desktop/прежнего generic ChatGPT-примера canonical shape command/args/env. Все UI JSON содержат wrapper `{mcpServers:{[serverName]:entry}}`. Для CLI Claude Code явно доступен отдельный entry JSON, его нельзя путать с wrapper.

Валидация отвергает неизвестный профиль, пустой/относительный/контрольный key path, невалидные/credential-bearing URLs, HTTP вне loopback, несовпадающий project endpoint и неисполняемые относительные command/bridge paths. Она не читает key file и не доказывает наличие клиентского приложения. Небольшой CLI `npm run agent:config -- ...` печатает JSON тем же генератором и не пишет в пользовательские настройки; чувствительное значение ключа не является параметром CLI.

## Интерфейс и инструкции

Переключатель клиента и поля конфигурации доступны для проекта независимо от того, показан ли ещё одноразовый ключ. Скрытие ключа не мешает повторно получить конфигурацию по пути уже сохранённого файла. На смене проекта/key path не остаётся старый JSON. Перед копированием нужен корректный абсолютный путь. Отдельные регистрации Cursor/Claude позволяют различать их факты и отзыв ключей.

`/projects/help` описывает выбор клиента, точный путь файла, включение сервера/permissions, проверку инструментов, старт назначенной попытки и открытый дашборд. В README и отдельной инструкции есть ссылки на реальные официальные документы. Registrations, config copy или SDK initialize не объявляются установленным Cursor/Claude либо запущенной моделью. LastSeen остаётся фактом обращения; queued меняется только по настоящему ACK.

## Приёмка

| ID | Наблюдаемое поведение |
|---|---|
| CO01 | Cursor, Claude Code, Desktop получают корректные profile entry/wrapper; одинаковые префиксы разных project IDs не сталкиваются |
| CO02 | Абсолютные пути с пробелами/Unicode/Windows escaping сохраняются; literal token отсутствует; плохие пути/URL/project mismatch отвергаются |
| CO03 | Реально сгенерированная entry запускает Node bridge через официальный SDK: discovery 18 tools/resources, свой project context; file-key credential и scope сохраняются |
| CO04 | UI переключает клиентов и показывает правильные инструкции/JSON, скрывает ключ отдельно, позволяет повторно получить конфиг; без валидного пути copy/download недоступны |
| CO05 | A/B navigation/config и разные регистрации не меняют MCP context или старые unknown intents; состояние queued/ACK честное |
| CO06 | CLI генерирует wrapper либо Claude Code entry без редактирования чужих файлов; неправильный ввод даёт безопасный отказ |
| CO07 | README/help/guide содержат рабочие локальные шаги, клиентские permissions/restart/проверку и официальные источники; полные regression gates успешны |

## Прочитанные ориентиры

Фактически прочитаны 29.10.2026: [Cursor MCP](https://cursor.com/docs/mcp), [Claude Code MCP](https://code.claude.com/docs/en/mcp), [MCP: local servers / Claude Desktop](https://modelcontextprotocol.io/docs/2026-07-28/develop/connect-local-servers). Точные разделы/платформенные границы фиксируются в инструкции и журнале. Перед Next-кодом читаются актуальные локальные Next.js docs. Авторизация, SSE и статусы остаются прежними; публичное размещение и установка desktop-приложений в чужой системе не входят в пакет.
