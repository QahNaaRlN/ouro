# Живой дашборд, общий MCP и локальные проекты: источники и решения

29.10.2026 · [SDD OURO-ENG-000015](specs/project-workspace.md). Ниже — фактически прочитанные части источников и выбранные границы. Выполнение интеграции фиксируется отдельно в [журнале](plans/project-workspace.md).

## Общий контракт и единый дашборд

Уточнение пользователя определяет результат: на одном экране нужны проект, roadmap, выбранный Flow, агенты/попытки, внимание человека и поток фактов. Стандартизированный предметный контракт поверх MCP связывает эти представления с сообщениями любого совместимого агента. ChatGPT не является отдельным типом домена и не получает специальных полномочий по имени регистрации.

Поэтому все клиенты используют одни schemas/tools, server guards и event history. Живые представления строятся из одного committed snapshot/cursor выбранного проекта; смена выделения не создаёт новый факт. Настройка подключения и назначение — вспомогательные действия дашборда. Чтение файлов добавляет контекст, но не меняет результат пакета на файловые предложения или встроенное исполнение.

## Пример частного MCP из ChatGPT

Прочитаны актуальные [OpenAI Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt) — Prepare the endpoint, Add the MCP server, Check tool selection, Refresh metadata — и [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels): модель outbound polling, prerequisites, permissions, organization/workspace associations, setup, ChatGPT connection, health и troubleshooting. Эти страницы на дату чтения описывают **ChatGPT Plugins → Add custom MCP server → Connection: Tunnel**.

Официальный путь позволяет оставить Ouro на localhost: ChatGPT → OpenAI tunnel service → tunnel-client на машине пользователя → stdio bridge Ouro → project-specific HTTP endpoint Ouro. Для этого не требуется публиковать URL с секретом или добавлять OAuth server в прототип. Tunnel — транспорт; полномочия в Ouro по-прежнему проверяются регистрацией и точным проектом. Публичная публикация plugin имеет другие требования и не входит в этот сценарий.

| Прочитанное требование | Применение |
|---|---|
| Tunnel creator: Read + Manage; runtime principal/operator: Read + Use | В инструкции разделены подготовка tunnel в Platform и обычный запуск runtime; admin key не передаётся долгоживущему клиенту |
| Tunnel связан с Platform organization и целевым ChatGPT workspace | Наличие Platform organization само не объявляется доступом из выбранного workspace |
| Клиент остаётся запущенным для discovery и каждого вызова | Registration/lastSeen в Ouro не выдаются за установленный plugin или постоянное соединение |
| Health/readiness и продуктовый tool call — разные проверки | Полная настройка считается подтверждённой только после вызова из ChatGPT; SDK и локальные health endpoints проверяют свои части |
| После изменения tools нужно обновить metadata | В инструкции есть Refresh и новый разговор после смены схем |

## Реальные команды tunnel-client

Прочитаны [onboarding.md](https://github.com/openai/tunnel-client/blob/bf9e87efa7f5efadb44744e15e1f2857b246bf97/docs/onboarding.md), [configuration.md](https://github.com/openai/tunnel-client/blob/bf9e87efa7f5efadb44744e15e1f2857b246bf97/docs/configuration.md), встроенные [help quickstart](https://github.com/openai/tunnel-client/blob/bf9e87efa7f5efadb44744e15e1f2857b246bf97/cmd/client/help_topics/quickstart.txt) и [help samples](https://github.com/openai/tunnel-client/blob/bf9e87efa7f5efadb44744e15e1f2857b246bf97/cmd/client/help_topics/samples.txt), шаблон [sample_mcp_stdio_local](https://github.com/openai/tunnel-client/blob/bf9e87efa7f5efadb44744e15e1f2857b246bf97/cmd/client/profile_samples/sample_mcp_stdio_local.yaml.tmpl) и [init_command.go](https://github.com/openai/tunnel-client/blob/bf9e87efa7f5efadb44744e15e1f2857b246bf97/cmd/client/init_command.go). Это исходники help/config на commit bf9e87e, не заявление о запуске бинарника с настоящими credentials.

Из них взяты реальные команды `init --sample sample_mcp_stdio_local --profile ... --tunnel-id ... --mcp-command ...`, `doctor --profile ... --explain` и `run --profile ...`. Флаг init `--control-plane-api-key-ref` допускает ссылку `file:...` или `env:...`; профиль сохраняет ссылку вместо literal key. Прочитан stdio transport: дочерняя команда запускается через exec, поэтому OURO_URL и OURO_AGENT_TOKEN_FILE задаются окружением запуска, а не вставкой секретов в shell-команду.

Проверены README проекта и metadata latest release: на 29.10.2026 это v0.0.18 от 23.10.2026, доступны Windows/Linux/macOS amd64/arm64. Рабочая инструкция ссылается на [latest](https://github.com/openai/tunnel-client/releases/latest) и Platform download, чтобы не закреплять устаревший URL архива. Для macOS официальный README рекомендует Homebrew; обход Gatekeeper не предлагается. Запуск выбран foreground, с видимым terminal lifecycle; для самостоятельной долговременной эксплуатации источник описывает native runtimes/services отдельно.

Разделены две учётные сущности: runtime key OpenAI разрешает доступ tunnel-client к tunnel service; agent key Ouro разрешает конкретной регистрации работу в одном проекте. Они не заменяют друг друга. Локальные пути к обоим файлам допускаются в конфигурации; значения не помещаются в Git, argv, URL или инструкции для модели.

## Файловая привязка и текущее чтение

Прочитаны Node.js 24 [fs.realpath](https://nodejs.org/docs/latest-v24.x/api/fs.html#fsrealpathpath-options-callback), [fsPromises.lstat](https://nodejs.org/docs/latest-v24.x/api/fs.html#fspromiseslstatpath-options), [fsPromises.open](https://nodejs.org/docs/latest-v24.x/api/fs.html#fspromisesopenpath-flags-mode), [path.isAbsolute](https://nodejs.org/docs/latest-v24.x/api/path.html#pathisabsolutepath), [path.resolve](https://nodejs.org/docs/latest-v24.x/api/path.html#pathresolvepaths) и [path.relative](https://nodejs.org/docs/latest-v24.x/api/path.html#pathrelativefrom-to). Node прямо предупреждает: проверка isAbsolute сама по себе не защищает от traversal. Realpath разрешает symlink, но canonical pathname не гарантирует единственной идентичности из-за hard links/bind mounts; lstat проверяет саму ссылку.

Поэтому выбор корня и входной путь MCP — разные операции. Локальный оператор выбирает существующую папку; сервер фиксирует canonical root и identity. Агент передаёт только относительный path внутри уже выбранной привязки. Во время доступа проверяются корень, типы компонентов и идентичность открытого файла; внутренние symlink и hard-linked файлы исключены. Проверка credentials и execution assignment выполняется до filesystem IO. Текст выдаётся с sha256/size/modifiedAt, сохраняя различие между «прочитал эти байты» и «выполнил работу по ревизии».

Списки ограничены одной папкой и 200 записями, чтение — 128 KiB UTF-8. Фильтры известных credential paths не являются анализатором всего содержимого; запись, shell и автоматическая установка зависимостей не добавлены. Эта поверхность даёт подключённому агенту контекст, а не полномочия выполнять произвольный код на машине пользователя.

## Отдельный проект и отдельная история

Project ID замыкается в store facade и URL, ключ проверяется в том же project scope. Shared SQL owner connection сохраняет один владеющий процесс PGlite, а новые проекты не получают demo seed. Переключение UI не меняет route/credential подключённого агента и не переносит intent в другой endpoint. Неопределённый исход остаётся связан с исходным автором, URL, requestId, телом и версией; восстановление по receipt предшествует новым guards папки.

Это ограниченный локальный operator workflow, не принятие production tenancy/SSO. Human assignment, агентский ACK, решение, применение/clearance, разрешение продолжения, итог execution и human acceptance DoD сохраняются разными фактами. User-приоритет перенёс локальный вход и общий живой дашборд перед пакетным построением полной дорожной карты.

[Как пользоваться проектом](project-workspace-guide.md) · [Самостоятельно подключить ChatGPT](chatgpt-guide.md) · [Контракт 0.1.2](protocol-guide.md).
