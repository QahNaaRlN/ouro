# Подключить агента · 0.1.0-beta.1

Общий версионированный контракт Ouro позволяет любому совместимому MCP-агенту читать назначения, сообщать факты и запрашивать человека. Единый realtime-дашборд выбранного проекта показывает карту, Flow, агентов/попытки, внимание человека и события из этих сообщений. Поддерживаются tools и stdio либо Streamable HTTP с настраиваемым bearer-заголовком. Cursor, Claude Code и Claude Desktop имеют [готовые профили подключения](agent-clients-guide.md), ChatGPT — отдельный [пример Secure MCP Tunnel](chatgpt-guide.md); LLM и аккаунт провайдера остаются на стороне клиента. [SDD первоначального подключения](specs/agent-connect.md), [локальные проекты и дашборд](specs/project-workspace.md).

## Быстрый путь

1. `npm ci`, затем `npm run dev`; откройте <http://127.0.0.1:3000/projects>, добавьте существующую папку и откройте её дашборд.
2. Выберите профиль Cursor, Claude Code или Claude Desktop и нажмите **«Зарегистрировать агента»**, задав имя своего MCP-клиента. Сохраните одноразовый ключ в отдельный локальный файл вне Git/папки контекста; укажите его абсолютный путь в конфигурации stdio. Выданный MCP URL фиксирует выбранный projectId. Список/история не хранят значение ключа.
3. Скопируйте или скачайте JSON и добавьте запись в MCP-клиент, сохранив остальные настройки; включите сервер и его разрешения. Cursor использует `.cursor/mcp.json`, Claude Code — `.mcp.json` либо `--mcp-config`, Desktop — Developer → Edit Config с полным restart. Выданные `command`/`args` содержат абсолютные пути и работают из другой папки.
4. Выберите эту регистрацию, заполните задачу, название и проверяемые критерии; нажмите **«Начать работу»**. Спека, активная ревизия и queued-попытка создаются атомарно. До настоящего ACK видно **«Ожидает агента»**.
5. Дайте агенту инструкцию: «Прочитай `ouro.get_context`, найди назначенную попытку, подтверди запуск через `ouro.confirm_started`. Работай по её ревизии, сообщай факты через Ouro; вопросы и развилки передавай человеку».
6. Наблюдайте общий дашборд и ответьте на запросы человека. Применение решения, разрешение продолжения и ACK — отдельные действия. После результата человек проверяет и принимает DoD.

Без назначения агент получает пустой список и инструкцию ожидать. Ключ не даёт права самостоятельно назначить работу, активировать спеку, выбрать ответ или принять DoD.

Прежний Human View по `/` и `/api/mcp` сохраняет demo-проект: там регистрацию создают в **«Агенты»**, затем активируют ревизию и разрешают попытку. Новый project-specific URL не выбирается глобальной cookie. Подключение A остаётся в A при переключении браузера на B; другой проект требует своей регистрации и endpoint. [Папка, dashboard и ограничения](project-workspace-guide.md).

## Конфигурации

UI выдаёт JSON с реальными путями, project-specific URL и ссылкой на файл ключа. Значение одноразового ключа сохраняется отдельно. Ниже только шаблоны.

Профиль stdio для Cursor/Claude Code; у Desktop генератор сохраняет command/args/env без обязательного type. Здесь только шаблон — UI выдаёт реальные значения:

```json
{"mcpServers":{"ouro-PROJECT_ID":{"type":"stdio","command":"/absolute/path/to/node","args":["/absolute/path/to/ouro/packages/mcp/bin/ouro-mcp.mjs"],"env":{"OURO_URL":"http://127.0.0.1:3000/api/projects/PROJECT_ID/mcp","OURO_AGENT_TOKEN_FILE":"/absolute/path/to/local-agent-key.txt"}}}}
```

Можно задать `OURO_AGENT_TOKEN` вместо файла, но не оба одновременно. Bridge не открывает БД: все изменения идут через сервер Ouro. stdout содержит только MCP; диагностика stderr не печатает ключ. Удалённый endpoint требует HTTPS.

Для нового проекта используйте выданный registered-agent key. Legacy серверный env-token ограничен default-проектом. Не добавляйте projectId в tool arguments: scope проверяется по endpoint и ключу. Для прежнего demo URL остаётся `http://127.0.0.1:3000/api/mcp`.

Новые профили используют файл ключа и локальный stdio без Tunnel. Генератор `npm run --silent agent:config -- ...` печатает тот же JSON; для Claude Code отдельный `--entry` предназначен для `claude mcp add-json`, а полный wrapper — для `.mcp.json`/`--mcp-config`. Подробности, platform paths и объединение существующих настроек: [Cursor/Claude guide](agent-clients-guide.md).

Streamable HTTP с отдельным bearer остаётся доступным для клиентов с соответствующей поддержкой. Хранение/подстановка credential зависит от клиента; готовые профили этого пакета не вставляют значение ключа в JSON или argv. У Ouro нет собственного OAuth-сервера. [Официальные источники и выбранные границы](agent-clients-research.md).

## Инструменты

| Задача | Tool |
|---|---|
| Назначения, immutable ожидание, DoD, решения, guards и текущая версия | `ouro.get_context` |
| Разрешённые изменения после committed cursor | `ouro.get_updates` |
| Список/текст файлов назначенной папки, только чтение | `ouro.list_workspace_files`, `ouro.read_workspace_file` |
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

Отозванный ключ получает 401. Ответ агенту не содержит полного snapshot чужих работ. Старый HTTP Inbox сохранён для совместимости; новые папки-проекты используют `/api/projects/{projectId}/mcp`, demo — `/api/mcp`.

## Как читать папку проекта

Если `ouro.get_context` вернул workspace capability `readOnlyFiles:true`, передавайте назначенный executionId в `ouro.list_workspace_files` и `ouro.read_workspace_file`. Root сервер получает из сохранённой привязки; агент задаёт относительные пути вроде `README.md` или `src/main.ts`, с `/`.

Listing читает одну папку до 200 entries; продолжайте по nextCursor, пока он не null. Read возвращает text/sha256/size/modifiedAt для UTF-8 файла до 128 KiB. Абсолютные/traversal/drive/backslash пути, symlink, hard-linked файлы, известные credential paths, бинарные/не UTF-8 и oversize файлы недоступны. Чтение требует настоящее назначение этого проекта до filesystem IO; чужой executionId не подходит.

Эти tools дают текущий контекст без write/shell. Если у агента нет собственного инструмента выполнения требуемых изменений, он сообщает ограничение и запрашивает следующий шаг. Текст с hash не является подтверждением исполнения или приёмкой DoD. [Полная инструкция проекта](project-workspace-guide.md).

## Как работать по runId

При новой попытке человек может включить **«Строгий учёт проходов»**. До назначения убедитесь, что клиент поддерживает контракт 0.1.2 и `ouro.report_flow_step`; старому клиенту оставляйте legacy-попытку. Старые исполнения не получают проходы задним числом.

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

MCP сам не запускает LLM и не контролирует внешние процессы. Начиная с alpha.4 Human View получает committed snapshots через SSE с восстановлением после разрыва; MCP get_updates остаётся scoped чтением, а техническая presence регистраций обновляется отдельно. Проекты разделены endpoint и ключами; каталог папок доступен доверенному локальному оператору. В прежнем Human View доступны отдельные зарегистрированные участники с HttpOnly-сессиями, без внешнего SSO/OAuth server и production multi-tenancy. Для внешнего адреса нужен `OURO_PUBLIC_URL=https://…` и реальная human-авторизация; loopback demo не становится production identity через reverse proxy.

Трассировка тестов и наблюдавшиеся RED/GREEN: [журнал пакета](plans/agent-connect.md).

## Обнаружение предметного контракта

Пакет [OURO-ENG-000013](specs/domain-contract.md) добавил статические MCP resources, [OURO-ENG-000014](specs/flow-runtime.md) — `ouro.report_flow_step`, а [OURO-ENG-000015](specs/project-workspace.md) — два read-only workspace tools. Текущий набор содержит 18 инструментов. `ouro://protocol/manifest` содержит версию контракта и каталог, `ouro://protocol/schemas` — canonical bundle из 49 JSON Schema. После initialize проверьте capability `resources`, затем используйте `resources/list`/`resources/read`. HTTP и stdio дают тот же контракт; с прежним tools-only сервером discovery необязателен.

Версия предметного контракта `0.1.2` отделена от версии приложения и transport MCP. Не добавляйте `contractVersion` в прежние tool arguments: входы закрыты, версия объявлена в manifest. `tools/list` содержит input/output schemas всех 18 tools; выходная схема включает `ok:true` и `ok:false`, потому что SDK-клиент проверяет любое присутствующее structuredContent, включая `isError:true`. Canonical bundle использует Draft 2020-12, wire-схемы закреплённого SDK 1.32.2 — Draft 7.

`OUTPUT_CONTRACT_ERROR` с `error.details.outcomeUnknown:true` не означает, что команда не записалась. Сохраните прежние requestId и полное тело, включая expectedVersion, и выясняйте исход точным повтором; новый ID или подмена версии могут создать другую команду. Статические схемы не предоставляют прав или назначения. [Инструкция контракта и отдельной установки](protocol-guide.md) · [самостоятельный пакет](../packages/protocol/README.md).

Cursor/Claude Code имеют собственные edit/shell tools; read-only ограничение касается tools файлового контекста Ouro. Дашборд не перехватывает все действия IDE автоматически — агент явно сообщает наблюдаемые факты. Настройка клиента и модель остаются на стороне пользователя.
