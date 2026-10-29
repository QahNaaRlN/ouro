# Подключить агента · 0.1.0-alpha.13

Пакет [OURO-ENG-000001](specs/agent-connect.md), разработан по SDD/TDD. Поддерживается MCP-клиент с tools и stdio либо Streamable HTTP с настраиваемым bearer-заголовком. LLM, аккаунт провайдера и установка IDE остаются на стороне пользователя.

## Быстрый путь

1. `npm ci`, затем `npm run dev`; откройте <http://127.0.0.1:3000>.
2. В **«Агенты»** создайте именованную регистрацию. Скопируйте одноразовую конфигурацию stdio либо HTTP. Список/история не хранят ключ. Конфигурацию с ключом храните локально, вне Git.
3. Добавьте JSON в MCP-клиент и перезапустите его MCP-подключение. Выданные `command`/`args` содержат абсолютные пути и работают из другой папки.
4. Создайте/выберите спеку, активируйте ревизию, выберите зарегистрированного агента и **«Разрешить одну попытку»**.
5. Дайте агенту инструкцию: «Прочитай `ouro.get_context`, найди назначенную попытку, подтверди запуск через `ouro.confirm_started`. Работай по её ревизии, сообщай факты через Ouro; вопросы и развилки передавай человеку».
6. Ответьте в Human View. Разрешение продолжения и его ACK — отдельные действия. После результата человек проверяет и принимает DoD.

Без назначения агент получает пустой список и инструкцию ожидать. Ключ не даёт права самостоятельно назначить работу, активировать спеку, выбрать ответ или принять DoD.

## Конфигурации

UI выдаёт готовые JSON с реальными путями и одноразовым ключом. Ниже только шаблоны.

Общий stdio для Claude/Cursor и клиентов с такой же JSON-оболочкой:

```json
{"mcpServers":{"ouro":{"command":"/absolute/path/to/node","args":["/absolute/path/to/ouro/packages/mcp/bin/ouro-mcp.mjs"],"env":{"OURO_URL":"http://127.0.0.1:3000/api/mcp","OURO_AGENT_TOKEN_FILE":"/absolute/path/to/local-agent-key.txt"}}}}
```

Можно задать `OURO_AGENT_TOKEN` вместо файла, но не оба одновременно. Bridge не открывает БД: все изменения идут через сервер Ouro. stdout содержит только MCP; диагностика stderr не печатает ключ. Удалённый endpoint требует HTTPS.

Cursor HTTP (`.cursor/mcp.json` либо пользовательская конфигурация):

```json
{"mcpServers":{"ouro":{"url":"http://127.0.0.1:3000/api/mcp","headers":{"Authorization":"Bearer YOUR_AGENT_KEY"}}}}
```

Claude Code HTTP (`.mcp.json` либо пользовательская конфигурация):

```json
{"mcpServers":{"ouro":{"type":"http","url":"http://127.0.0.1:3000/api/mcp","headers":{"Authorization":"Bearer YOUR_AGENT_KEY"}}}}
```

Первоисточники: [Claude Code MCP](https://code.claude.com/docs/en/mcp), [Cursor MCP](https://cursor.com/docs/mcp). Формат оболочки других клиентов может отличаться. Проверка этого пакета выполнена независимыми официальными SDK-клиентами HTTP и stdio; установка конкретных проприетарных клиентов не заявляется проверенной.

## Инструменты

| Задача | Tool |
|---|---|
| Назначения, immutable ожидание, DoD, решения, guards и текущая версия | `ouro.get_context` |
| Разрешённые изменения после committed cursor | `ouro.get_updates` |
| Начало, завершение или неуспех конкретного прохода строгой схемы | `ouro.report_flow_step` |
| Факт / вопрос / выбор / препятствие | `ouro.report_action`, `ouro.report_question`, `ouro.report_fork`, `ouro.report_blocker` |
| Фактический запуск / продолжение / остановка | `ouro.confirm_started`, `ouro.confirm_resumed`, `ouro.confirm_stopped` |
| Подтверждение применения положительного решения с evidence | `ouro.confirm_decision_applied` |
| Результат попытки с evidence | `ouro.complete_execution` |
| Устранение после успешной разрешённой remediation | `ouro.clear_blocker` |
| Отзыв своего открытого запроса с причиной | `ouro.withdraw_decision` |
| Ответ на явный запрос уточнения человека с исходным event ID | `ouro.submit_decision_clarification` |
| Сводка Reality или предложение новой спеки по точным источникам своего исполнения | `ouro.submit_proposal` |

`tools/list` публикует строгие схемы. Запись содержит `executionId`, `requestId`, `expectedVersion`; spec/revision/actor связывает сервер. Сетевой повтор сохраняет исходное тело/requestId. При конфликте нужно прочитать контекст, без автоматической подмены версии. Глобальный cursor может продвинуться при пустом списке видимых этому агенту событий.

Для source-backed предложения укажите `sourceCursor` и точные ID первичных событий в каждом finding. `get_context` возвращает допустимые `proposalSourceIds`. Сервер проверяет каждый источник именно для выбранной попытки; чужие попытки того же агента и другие ревизии не становятся источниками автоматически. Pending версию можно уточнить с proposalId/baseProposalRevisionId; human review/adoption остаются отдельными полномочиями. [Инструкция](agent-proposals-guide.md).

Отозванный ключ получает 401. Ответ агенту не содержит полного snapshot чужих работ. Старый HTTP Inbox сохранён для совместимости; новые интеграции используют `/api/mcp`.

## Как работать по runId

При новой попытке человек может включить **«Строгий учёт проходов»**. До назначения убедитесь, что клиент поддерживает контракт 0.1.1 и `ouro.report_flow_step`; старому клиенту оставляйте legacy-попытку. Старые исполнения не получают проходы задним числом.

1. После `ouro.confirm_started` прочитайте `work[].execution.flowRuntime.currentRunId` и `work[].flowProgress`. Работайте по точной назначенной ревизии и доступным guards.
2. Начните текущий ready-run через `ouro.report_flow_step` с phase `start`. Для wait состояние станет waiting. Завершение сообщает отдельная команда phase `complete` с evidence; выбор condition требует edgeId. Неуспех начатого run сообщает phase `fail` с evidence.
3. Новые `report_action/question/fork/blocker` передают flowStepRunId. Action.completed не завершает run. Поздняя фаза существующего actionId сохраняет прежнюю привязку, даже если currentRunId уже другой.
4. Во время начатого шага можно обнаружить внеплановый вопрос, развилку или блокер. При несовпадении типа узла опустите flowNodeId: сервер запишет flowInterrupt. Человеческое решение, применение/устранение, отдельное продолжение и ACK обязательны по действующим guards; операционный Fork не выбирает ребро плана.
5. После complete заново прочитайте currentRunId: каждое посещение имеет новый runId и visit. Повтор сетевого запроса сохраняет исходные runId/requestId/тело/expectedVersion и возвращает квитанцию, а не начинает следующий шаг.

Human/system-шаги, retry и skip подтверждает человек. Runtime.failed основной незавершённой попытки активной ревизии блокирует спеку до допустимого retry. Завершённый result требует отдельного итога execution и отдельной человеческой приёмки DoD. [Профиль, владельцы, повторы и пример MCP](flow-runtime-guide.md).

## Проверка и ограничения

Задайте `OURO_URL` и `OURO_AGENT_TOKEN_FILE` (либо `OURO_AGENT_TOKEN`) в локальном окружении, выполните `npm run agent:check`. Команда делает initialize/listTools/get_context и показывает tools, имя агента и число назначений без ключа. Историю она не меняет.

Обычная передача работы: запросить остановку → дождаться ACK → отменить остановленную попытку → отозвать ключ/назначить другого агента. Экстренный отзыв немедленно запрещает доступ, но не останавливает внешний процесс. Отозванный агент уже не сможет прислать ACK. Человек может отменить разрешение операторской командой, сохранив признак неизвестной фактической остановки; до отдельного свидетельства оператора о проверенной внешней остановке новое конфликтующее исполнение запрещено. [Процедура восстановления](methodology-guide.md).

Получив `DecisionClarificationRequested` через `get_updates` либо `clarifications` назначенной работы в `get_context`, агент отвечает `ouro.submit_decision_clarification` с `clarificationEventId` исходного факта. Контекст содержит и ранее записанные уточнения/ответы, поэтому переподключение не теряет открытый вопрос человека. Ответ не закрывает запрос и не разрешает исполнение. Отзыв собственного pending-запроса также не возобновляет работу; физический Blocker остаётся до проверяемого устранения либо явного пересмотра его применимости к другому контракту.

MCP сам не запускает LLM и не контролирует внешние процессы. Начиная с alpha.4 Human View получает committed snapshots через SSE с восстановлением после разрыва; MCP get_updates остаётся scoped чтением, а техническая presence регистраций обновляется отдельно. Один проект; доступны отдельные зарегистрированные участники с HttpOnly-сессиями, без внешнего SSO/OAuth server и multi-tenancy. Для внешнего адреса нужен `OURO_PUBLIC_URL=https://…` и реальная human-авторизация; loopback demo не становится production identity через reverse proxy.

Трассировка тестов и наблюдавшиеся RED/GREEN: [журнал пакета](plans/agent-connect.md).

## Обнаружение предметного контракта

Пакет [OURO-ENG-000013](specs/domain-contract.md) добавил статические MCP resources, а [OURO-ENG-000014](specs/flow-runtime.md) — шестнадцатый tool `ouro.report_flow_step`. `ouro://protocol/manifest` содержит версию контракта и каталог, `ouro://protocol/schemas` — canonical bundle из 41 JSON Schema. После initialize проверьте capability `resources`, затем используйте `resources/list`/`resources/read`. HTTP и stdio дают тот же контракт; с прежним tools-only сервером discovery необязателен.

Версия предметного контракта `0.1.1` отделена от версии приложения и transport MCP. Не добавляйте `contractVersion` в прежние tool arguments: входы закрыты, версия объявлена в manifest. `tools/list` содержит input/output schemas всех 16 tools; выходная схема включает `ok:true` и `ok:false`, потому что SDK-клиент проверяет любое присутствующее structuredContent, включая `isError:true`. Canonical bundle использует Draft 2020-12, wire-схемы закреплённого SDK 1.32.2 — Draft 7.

`OUTPUT_CONTRACT_ERROR` с `error.details.outcomeUnknown:true` не означает, что команда не записалась. Сохраните прежние requestId и полное тело, включая expectedVersion, и выясняйте исход точным повтором; новый ID или подмена версии могут создать другую команду. Статические схемы не предоставляют прав или назначения. [Инструкция контракта и отдельной установки](protocol-guide.md) · [самостоятельный пакет](../packages/protocol/README.md).
