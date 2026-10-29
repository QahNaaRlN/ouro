# Ouro OS — дополненная техническая спецификация

Дата: 2026-10-28. Редакция архитектуры: `1.1.0-draft.1`. Текущий ограниченный прототип — `0.1.0-alpha.15`, состояние реализации актуализировано 29.10.2026. Реализованные пакеты и статус проверок: [roadmap.md](roadmap.md), [validation.md](validation.md); фактическое хранение и миграции: [implementation.md](implementation.md). [prototype-scope.md](prototype-scope.md) сохраняет историческую матрицу alpha.1.

## Подключение настольных MCP-клиентов · alpha.15

Cursor, Claude Code и Claude Desktop получают profile-specific stdio JSON от одного pure генератора, который разделяет server entry и mcpServers wrapper, проверяет абсолютные пути и соответствие project URL. HTTP/MCP/SQL остаются прежними, протокол0.1.2 не изменён. Literal credentials в экспорт не входят, клиентские конфигурационные файлы автоматически не переписываются. [SDD](specs/client-onboarding.md), [архитектура](implementation.md), [настройка](agent-clients-guide.md).

## Текущий пакет: живой дашборд локального проекта

`/projects` даёт выбрать любую существующую папку без обязательного Git и открыть её отдельный дашборд. Общий MCP-контракт обслуживает любого совместимого агента; ChatGPT — документированный пример. Ключ и URL подключения закреплены за проектом, browser switch их не меняет. Сервер разделяет события, cursors, registrations и receipts через явные project-scoped facades одного SQL owner. Каталог и неизменяемая файловая привязка добавлены миграцией006.

Человеческий запуск атомарно создаёт spec/revision/queued execution. Agent ACK и факты исполнения обновляют общий snapshot, а scoped SSE — граф, выбранный процесс, запросы решений и ленту дашборда. Новые read-only tools `ouro.list_workspace_files`/`ouro.read_workspace_file` дают файловый контекст только назначенному исполнению; записи файлов и shell tools нет. Переносимый контракт — `@ouro/protocol@0.1.2`, 18 tools/49 canonical схем. Полный контракт, границы operator-only режима и восстановления исходного intent: [SDD](specs/project-workspace.md), [архитектура](implementation.md), [инструкция](project-workspace-guide.md). Результаты общей проверки приводятся в [validation](validation.md) по факту завершения.

## 1. Границы системы

Human View — продуктовая поверхность для человека. Агенты передают факты и запросы через Execution Inbox/MCP. Сервер проверяет тип сообщения, контекст доступа и версию спеки; клиентский `actor.kind: human` не даёт человеческих полномочий.

Исходный технический ориентир включал Next.js 14, React Flow, Tailwind, Framer Motion, tRPC и PostgreSQL. В текущем прототипе используются Next.js 16 App Router/Route Handlers, React Flow/Dagre, CSS, TypeScript/Node.js, SQL-адаптер PGlite/pg, SSE и Yjs для технических черновиков. Проверенные версии находятся в package.json/package-lock.json и журналах пакетов. tRPC, PartyKit/Supabase и Redis не являются реализованными сервисами этого среза.

Предлагаемые границы пакетов:

| Пакет | Ответственность |
|---|---|
| `@ouro/core` | Схемы, доменные команды и события, идентификаторы, правила переходов и воспроизведение |
| `@ouro/view` | Human View, представления графа/истории, доступность, получение темы хоста |
| `@ouro/mcp` | Адаптер входящих сообщений агентов; не обходит серверные правила |

Самостоятельный `@ouro/protocol` версии `0.1.1` реализован в `packages/protocol`: Zod/runtime-контракты Flow и проходов, ESM/CommonJS и TypeScript declarations, canonical JSON Schema и CLI. Runtime зависит только от Zod; приложение использует публичный скомпилированный пакет через локальную file-зависимость. Npm hooks собирают его перед dev/build/typecheck/test. [Каталог форматов](../packages/protocol/schemas/manifest.json) и [инструкция](protocol-guide.md) являются текущей границей формата; проектный псевдокод не заменяет этот каталог.

`packages/meridian` содержит закрытый parser изученного host DTO и статическую палитру; запись идёт через отдельный человеческий `/api/meridian/import`. Это Ouro-side адаптер, без нативного моста: [границы](meridian-guide.md), [host RFC](proposals/meridian-native-bridge.md). Домен не зависит от конкретного маршрутизатора, realtime-провайдера или оболочки Meridian.

## 2. Источники истины и хранение

Подробная модель: [статусы и история](status-methodology.md). Данные и контракты: [идентификаторы и схемы](ids-contracts.md).

- Авторитетные доменные события и ревизии — append-only. Прикладным ролям запрещены UPDATE/DELETE этих записей.
- Текущее состояние вычисляется из событий. Пересоздаваемые проекции допускают UPDATE технической ролью проектора. Это предложенное явное уточнение исходного «только INSERT», а не скрытое исключение.
- Содержание спеки меняется новой ревизией; activation — отдельное человеческое решение. Execution всегда хранит конкретный `specRevisionId`.
- Факты, решения и исполнение — разные сущности. У принятого события нет `pending/approved` статуса; состояние запроса и исход решения находятся в Decision Request/Decision.
- Исправления — новые корректирующие или компенсирующие события со ссылками на оригиналы.
- Доменные события, записи outbox и необходимые изменения в границах одной команды сохраняются одной транзакцией PostgreSQL. Только committed данные попадают в realtime.

Модель должна включать Project/Workspace, Roadmap, Spec/SpecRevision, типизированные связи, Execution, Reality Event, Decision Request/Decision, DoD/evidence, principals/agent instances и outbox. Строгие попытки дополнительно имеют FlowRuntime, FlowStepRun и FlowTraversal как проекцию immutable событий внутри execution; отдельные SQL-таблицы и новая миграция для alpha.13 не добавлены. Физическая нормализация, индексы и миграции уточняются при реализации; исходный SQL с тремя таблицами не считается полной схемой.

## 3. Команды и чтение

Четыре исходных отчётных MCP-инструмента сохраняются: `ouro.report_action`, `ouro.report_question`, `ouro.report_fork`, `ouro.report_blocker`. Они входят в текущий набор из 16 инструментов чтения, lifecycle, уточнений, предложений и нового `ouro.report_flow_step`: [подключение и полный сценарий](agent-quickstart.md), [каталог предметного контракта](../packages/protocol/schemas/manifest.json). Payload валидируется по типу, а не общим правилом «reason и два варианта нужны каждому сообщению».

- Action: факт выполненного действия и ссылки на результат; автоматическая фиксация истории, без запроса одобрения.
- Question: вопрос и контекст; человек отвечает либо отклоняет с причиной. Причина и альтернативы не навязываются обычному вопросу как у Fork.
- Fork: причина, контекст, минимум два различимых варианта; рекомендация может ссылаться только на существующий вариант. Выбор принадлежит человеку.
- Blocker: expected/actual, причина не короче 50 символов, влияние и предлагаемый путь устранения либо явное сообщение, что путь неизвестен. У Blocker не обязательно две альтернативы.

Доменные команды `resolveDecision`, `proposeRevision`, `activateRevision`, `acceptSpec` реализованы через серверный слой; Human View читает snapshot и committed SSE. `getRoadmap`, `getSpecDetail`, `getPendingDecisions`, `subscribeToProject/Spec` ниже обозначают проектные операции чтения, а не отдельные опубликованные RPC. Фактические маршруты находятся в [app/api](../app/api), MCP input/output — в [каталоге `@ouro/protocol`](../packages/protocol/schemas/manifest.json) и `tools/list`. Вместо исходного `approveEvent` используется типизированное решение запроса. API прототипа не объявлен стабильным production-контрактом.

MCP resources `ouro://protocol/manifest` и `ouro://protocol/schemas` доступны через HTTP и stdio, не добавляя tools или полномочий. Canonical bundle содержит 41 схему Draft 2020-12; закреплённый SDK 1.32.2 публикует wire-схемы Draft 7. Каждая `outputSchema` включает `ok:true` и `ok:false`: SDK-клиент валидирует любое присутствующее structuredContent, включая isError. DTO ответов сохраняют дополнительные JSON-поля через `validateToolBody`; inputs и Flow остаются закрытыми. Конверт события типизирован, payload/error details являются JSON-расширениями версии 0.1.1.

Форма ответа проверяется после выполнения команды. `OUTPUT_CONTRACT_ERROR` с `outcomeUnknown:true` означает неизвестный исход: прежние requestId/body сохраняются, повтор ищет исходную квитанцию. Нельзя считать такой ответ доказательством отсутствия commit или автоматически менять expectedVersion. Старые receipts не переписываются ради новой схемы. [Правила ошибок и совместимости](protocol-guide.md).

Команды получают `requestId` (ключ идемпотентности) и `expectedVersion`; в текущем прототипе это версия единого проектного потока под project lock, а не независимая версия каждой спеки. Повтор того же payload возвращает исходный результат; иной payload с тем же ключом — конфликт. Автор и права устанавливаются сервером. Сервер проверяет project/workspace scope, `specRevisionId`, тип решения и наличие выбранного option ID. Читаемый номер ревизии хранится отдельно как `revision`.

Целевая модель может разделять viewer, human editor и human decider. В текущем standalone-прототипе есть отдельные human credentials/сессии и отзыв участников; все допущенные люди имеют полномочия текущего проекта, тонкий RBAC и внешнее SSO не реализованы. Агент ограничен собственными назначенными execution и immutable ревизиями. [Граница участников](participants-guide.md). Сам факт HTTP-доступа не даёт права approve.

## 4. Применение решений и защита от гонок

У запроса есть `pending/resolved/withdrawn/superseded`; у решения — типизированный outcome. Выбор пути не переводит execution в `succeeded`.

Решение содержит конкретную ревизию и при необходимости директиву продолжения. Сервер проверяет остальные блокирующие запросы и ограничения; внешний агент подтверждает применение. Ouro не обещает физическую остановку стороннего агента только на основании записи события.

Одобрение плана устранения Blocker разрешает работу по этому плану; снятие препятствия требует отдельного факта с evidence. Отмена/отзыв запроса не разрешает продолжить запрещённый путь.

Для устранения открытого Blocker человек разрешает отдельную ограниченную remediation-попытку. Она может работать при целевом блокере, пока основное исполнение остаётся остановленным. Изменение активной ревизии или инвалидация запрещает новые старты на старом контракте и запрашивает остановку текущих попыток; фактическая остановка подтверждается отдельно. Фазы Action связывает стабильный `actionId`.

Конкурирующие решения защищены optimistic concurrency и уникальностью версии потока. Побеждает первая валидная транзакция; второй клиент получает конфликт и актуальное состояние. `hash(reason)` можно применять для подсказки о возможном дубле, но не как идентичность события.

## 5. Realtime и порядок

Истина — PostgreSQL; WebSocket/SSE доставляет изменения и может потерять соединение. Клиент дедуплицирует по `eventId`, хранит cursor, запрашивает пропуски и поддерживает восстановление снимком. Доставка проектируется как at-least-once.

Внутри агрегата порядок определяет `aggregateVersion`. Для восстановления проектной ленты нужен надёжный серверный cursor. Нельзя использовать клиентский timestamp или простой номер, зарезервированный до commit, как гарантию отсутствия пропусков: транзакции могут завершаться в другом порядке. Для MVP допустим проектный порядковый номер, присваиваемый при сериализованной записи под project lock до commit; иные механизмы должны обеспечивать такой же gap-safe replay. Порядок отображения времени и причинные ссылки хранятся отдельно.

Проекции имеют checkpoint; UI различает подтверждённые данные, локально отправленную команду и отставание/потерю связи. Перестройка layout не запускается на каждом heartbeat.

## 6. Графы и методология

Практики и проверенные источники: [исследование](graph-research.md).

- Roadmap dependencies: направление `A → B` означает «B требует A»; циклы обязательных зависимостей отклоняются с объяснением пути цикла.
- `derived_from`, `replaces`, `relates_to` — отдельные типы связей, не превращаются автоматически в зависимости.
- Схема процесса может включать возвраты. Фактическая история повторов использует разные execution/event IDs и причинные связи.
- Timeline сортируется по определённому серверному порядку; события связываются с ревизией, исполнением, запросом и решением.
- Для начального layout подходит Dagre; ELK рассматривается при сложных портах и вложенных группах. Выбор — проектная рекомендация, не доказанный результат бенчмарка Ouro.

### Строгий последовательный runtime · alpha.13

Новая человеческая `startExecution` может указать `flowTracking:'enforced'`; `validateEnforcedFlowDefinition` проверяет поддерживаемый профиль без изменения legacy Flow. ExecutionCreated сразу содержит один ready-run входа. `Execution.flowRuntime` имеет state active/completed/failed/cancelled, currentRunId, runs и traversals. FlowStepRun имеет собственные id/nodeId/visit и state ready/running/waiting/succeeded/failed/skipped/cancelled; FlowTraversal связывает fromRunId, toRunId и edgeId. Повтор/цикл создаёт новое посещение, human retry дополнительно хранит retryOfRunId.

Один текущий run означает исключающий выбор исхода. Несколько входов — слияние без ожидания всех ветвей; параллельных tokens/join, таймеров, интерпретатора выражений и встроенного runner нет. Action/wait/question/blocker имеют один выход, result — ноль, Fork — до десяти уникальных optionId, Blocker — owner agent. Condition требует явного edgeId/evidence. Лимит — 1000 проходов на execution.

`ouro.report_flow_step` принимает executionId/runId, phase start/complete/fail, requestId/expectedVersion, evidence и при complete edgeId. Start/complete/retry/skip проверяют running execution, активную ревизию, owner и canRun. Fail фиксирует текущий начатый running/waiting-run правильным автором с evidence и при паузе/stop request/смене ревизии незавершённой execution; он не открывает преемника и не меняет stop-флаги. Complete, traversal и следующий ready-run фиксируются атомарно. Retry/skip — человеческие команды; skip ограничен ready action/wait с одним исходом. Result завершает runtime, но итог execution и приёмка DoD отдельны.

Новые отчёты enforced-попытки требуют flowStepRunId; поздняя фаза actionId сохраняет исходную привязку. Внеплановый Question/Fork/Blocker на текущем начатом run получает серверный flowInterrupt при несовпадении типа и отсутствующем flowNodeId. Все актуальные запросы сохраняют человеческие решение, применение/clearance, отдельный resume и ACK. Отозванный interrupt-Question/Fork допускает продолжение после resume/ACK; плановый узел требует положительного запроса, отзыв Blocker не снимает физическую помеху. Interrupt-Fork не выбирает ребро схемы.

`buildFlowRuntimeView` выводит guards из того же доменного ядра. В контексте агент получает `work[].flowProgress`, UI — доступность с причинами и edge states possible/available/blocked/taken/not_selected. Выбранный исторический runId сохраняется при SSE. Неуспех runtime основной незавершённой попытки активной ревизии даёт Spec.blocked до допустимого retry. Закрытие авторизации run исходом execution не доказывает физической остановки. [Нормативный SDD](specs/flow-runtime.md), [инструкция](flow-runtime-guide.md), [SCXML/BPMN и ограничения](flow-runtime-research.md).

## 7. Идентичность, версии и Meridian

Читаемый `humanId` — постоянный номер спеки в проекте; канонический `spec.id` — UUID, отображаемый как Agent ID. Версия содержания хранится отдельной ревизией. ID автора и экземпляра агента не смешиваются с ID спеки.

SemVer применяется к релизам проекта и публичным пакетам/контрактам; до 1.0 действует локальная политика: breaking change увеличивает MINOR, совместимое изменение — PATCH. После 1.0 — стандартные MAJOR/MINOR/PATCH. Первый срез `0.1.0-alpha.1` сохранён в истории, текущая сборка — `0.1.0-alpha.15`; production-релиз не выпущен. `@ouro/protocol` имеет независимую версию `0.1.2` и поддерживает точное явно объявленное значение. Opt-in runtime сохраняет legacy-вызовы; артефакт 0.1.0 и старые receipts не переписываются. Ревизия спеки, `schemaVersion:1` событий и transport-версия MCP не подменяются версией продукта или пакета.

Для Meridian нужны устойчивые project/spec/revision IDs, переносимый envelope событий, отдельные адаптеры идентичностей и запуска, тема из токенов хоста и независимые от оболочки доменные правила. При экспорте можно использовать CloudEvents 1.0.2: его `specversion: "1.0"` обозначает версию формата CloudEvents, не версию Ouro и не schemaVersion payload. Внутренний формат не объявляется автоматически полностью CloudEvents-совместимым.

Изучены закреплённые desktop DTO, native IPC/capability, project/workspace pins и палитра Meridian. Ouro проверяет форму и согласованность импортированного документа, сохраняет точный raw JSON/hash и provenance, но не подтверждает подлинность источника. Host embedding, отдельное хранилище credentials, SSO и Windows/WebView2 приёмка остаются нативным пакетом по [RFC](proposals/meridian-native-bridge.md).

## 8. Валидация реализации и границы

Gate alpha.15 / OURO-ENG-000016:344/344 unit/integration,71/71 production E2E без unexpected/flaky/skipped, typecheck/build и49 схем GREEN. Сгенерированные профили проверены SDK; официальный Claude Code2.1.312 действительно подтвердил Connected в изолированном health-check без аккаунта/LLM. [Подробности и границы](plans/client-onboarding.md).

Итоговый gate alpha.14 / OURO-ENG-000015:336/336 unit/integration,69/69 production E2E без unexpected/flaky/skipped, typecheck/build/DB-check,49 схем и standalone package1/1 GREEN. Приняты scoped catalog/store/MCP/SSE, полный человеческий lifecycle и standard proposal→draft→strict execution без автоприёмки. [Точные результаты и границы](validation.md), [SDD/RED/GREEN](plans/project-workspace.md).

Обязательные сценарии: ручной ответ на Question; Fork с выбранным option ID; одобрение Blocker без преждевременного снятия; конфликт двух решений; идемпотентный повтор; смена ревизии без изменения прошлого; пересборка проекций; reconnect без потери событий; проверка project scope; подтверждение внешнего применения отдельно от записи решения; отсутствие циклов roadmap; доступное отображение статуса без анимации.

Пакеты alpha.1–12 прошли зафиксированные TypeScript-, SQL/domain-, browser- и production build проверки: [текущий индекс](validation.md). Общий alpha.12 gate: 266/266 unit/integration, 59/59 production E2E, typecheck, production build и проверка 34 JSON-схем; самостоятельная установка tarball проверена отдельно, 1/1. SDD и RED/GREEN следы связаны с каждым пунктом [дорожной карты](roadmap.md). Сводки и предложения подаёт подключённый внешний MCP-агент; встроенного LLM runner и batch tool для всей дорожной карты нет. Ouro-side Meridian импорт проверен отдельно от не выполненного native host/Windows пакета. Внешний PostgreSQL, production OAuth/SSO/RBAC/tenancy и масштабная эксплуатация отдельно не приняты.

Итоговый gate alpha.13 / OURO-ENG-000014: 300/300 unit/integration без пропусков, 65/65 production E2E без unexpected/flaky/skipped, typecheck, production build, проверка 41 JSON Schema и самостоятельная установка пакета 1/1 (ESM/CommonJS, types, CLI и права файлов). Финальные E2E выполнены на production-сборке замороженного кода `8e3e3c0` с отдельной новой БД; все шесть новых browser-сценариев входят в эти 65. Собственные RED/GREEN, SQL/SDK/browser-сценарии и границы приёмки фиксируются в [журнале runtime](plans/flow-runtime.md) и [текущем индексе](validation.md); исторические числа alpha.12 не являются результатом новой версии.
