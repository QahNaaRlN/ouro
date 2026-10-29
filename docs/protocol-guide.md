# Предметный контракт Ouro · 0.1.2

Контракт стандартизирует данные общения Ouro и любого совместимого MCP-агента: схемы процесса и проходов, workspace context, входы 18 tools, успешные ответы и ошибки. На этих данных единый realtime-дашборд показывает выбранный проект, roadmap/Flow, агентов/попытки, внимание человека и события. ChatGPT — пример клиента общего контракта. Версия `0.1.2` отделена от приложения `0.1.0-beta.1`, transport MCP и `schemaVersion:1` событий. Текущая ветка — `main`; первоначальный контракт 0.1.0 и его проверки сохранены в [журнале alpha.12](plans/domain-contract.md).

Исходники и самостоятельная инструкция находятся в [packages/protocol](../packages/protocol/README.md). Пакет `@ouro/protocol` содержит ESM/CommonJS, соответствующие TypeScript declarations, JSON Schema, примеры и CLI. Его runtime-зависимость — Zod. Для использования пакета не нужны Next.js, PostgreSQL, браузер или MCP SDK.

Это библиотека контрактов, а не отдельный сервер или исполнитель. Установка пакета не запускает Ouro, не выдаёт ключ агента и не создаёт назначение. Подключение к работающему Ouro описано в [инструкции агента](agent-quickstart.md).

## Что описано

| Область | Объём версии 0.1.2 |
|---|---|
| Flow | `entryNodeId`, конкретные nodes/edges, типы шагов, исполнители, ограничения и семантический валидатор |
| Учёт проходов | `FlowRuntime`, `FlowStepRun`, `FlowTraversal`, `FlowRuntimeView` и валидатор поддерживаемого enforced-профиля |
| Входы MCP | Прежние 16 tools, включая `ouro.report_flow_step`, и новые read-only `ouro.list_workspace_files` / `ouro.read_workspace_file`; legacy-вызовы сохранены |
| Workspace | Metadata проекта без host root, список одной папки и текст файла с hash/size/modifiedAt; scope задаётся endpoint и credential |
| Ответы MCP | Контекст, updates, результаты команд и предложений; опубликованная `outputSchema` включает успешный и error-вариант |
| Ошибки | `{ok:false,error:{...}}`, в том числе явный неизвестный исход после ошибки построения ответа |
| Общие DTO | Исполнение, ревизия, запрос/решение, предложение, разрешения и конверт события |
| Расширения | `DomainEvent.payload` и error `details` — объявленные JSON-данные; полного типизированного каталога всех event payload пока нет |

Canonical каталог содержит 49 JSON Schema. Входы и wire-ответы каждого из 18 tools публикуются также через `tools/list`.

Схема плана, факты выполнения, решение человека и подтверждение применения остаются отдельными сущностями. Flow необязателен в прежних ревизиях: наличие контракта не заполняет пустую схему автоматически и не меняет правила активации старых спек.

## Запуск приложения и сборка пакета

Полный репозиторий этой реализации находится в ветке `main`:

```sh
git clone --branch main --single-branch https://github.com/QahNaaRlN/ouro.git
cd ouro
npm ci
npm run dev
```

Корневой проект использует публичный скомпилированный `@ouro/protocol` через локальную file-зависимость. Npm hooks собирают его перед dev, build, typecheck и тестами. Отдельно доступны:

```sh
npm run protocol:build
npm run protocol:check
npm run protocol:pack
```

`protocol:pack` создаёт `artifacts/ouro-protocol-0.1.2.tgz`. Чтобы собрать только библиотеку без зависимостей приложения, перейдите в `packages/protocol`, выполните `npm ci`, затем `npm pack`. Подробные API, примеры ESM/CommonJS и команды повторной самостоятельной сборки приведены в [README пакета](../packages/protocol/README.md).

Для установки готового архива в другой проект:

```sh
npm install ./ouro-protocol-0.1.2.tgz
npm exec --offline -- ouro-protocol manifest
npm exec --offline -- ouro-protocol validate-flow flow.json
npm exec --offline -- ouro-protocol validate-response ouro.get_updates response.json
```

`flow.json` и `response.json` — файлы проверяемых данных. [Корректный пример Flow](../packages/protocol/examples/flow-valid.json), [некорректный пример](../packages/protocol/examples/flow-invalid.json) и [пример updates](../packages/protocol/examples/updates-success.json) включены в архив. CLI ничего не записывает в Ouro. Код завершения 0 означает успех проверки, 1 — ошибку данных/чтения, 2 — неправильную команду.

Пакет не публиковался в npm registry: самостоятельная установка здесь означает установку `.tgz`. Наличие имени `@ouro/protocol` не обещает, что `npm install @ouro/protocol` сможет получить эту версию из публичного registry.

## Discovery через MCP

После обычного initialize проверьте capability `resources`. Сервер Ouro публикует два статических ресурса:

| URI | Содержание |
|---|---|
| `ouro://protocol/manifest` | Имя и версия контракта, диалект, `$id` схем, имена файлов, инструменты и границы совместимости |
| `ouro://protocol/schemas` | Canonical bundle со схемами и manifest той же версии |

Используйте `resources/list` и `resources/read`; это не новые tools. HTTP и stdio предоставляют одинаковый каталог. Stdio bridge проксирует ресурсы, когда удалённый сервер объявляет соответствующую capability. Если старый сервер поддерживает только tools, bridge сохраняет прежнее tools-only поведение.

Ресурсы не содержат данных проекта и не дают дополнительных полномочий. Рабочий контекст агент по-прежнему читает через `ouro.get_context`, а изменения — через `ouro.get_updates`. Для фактов и вопросов нужно настоящее назначение на immutable ревизию.

Новый клиент сравнивает `manifest.version` с явно поддерживаемыми версиями и выбирает указанную схему. В этом артефакте поддерживается точная версия `0.1.2`; автоматического согласования другой версии 0.x нет. Не добавляйте поле `contractVersion` в прежние тела tool-запросов: версия объявлена отдельно, а входы остаются закрытыми и отклоняют неизвестные поля.

## Два представления JSON Schema

Canonical файлы пакета используют **Draft 2020-12**. Их `$schema` равен `https://json-schema.org/draft/2020-12/schema`; стабильный `$id` имеет вид `urn:ouro:protocol:0.1.2:flow`. URN — идентификатор, а не адрес сетевого сервиса. Файлы из `schemas/` можно перенести в проект на другом языке и зарегистрировать в локальном JSON Schema-валидаторе по их `$id`.

Закреплённый MCP SDK 1.32.2 экспортирует input/output schemas в `tools/list` как **Draft 7**. Это представления одних исходных определений в разных диалектах. Проверяйте объявленный диалект; не подменяйте wire-схему другой только потому, что обе относятся к версии контракта 0.1.2.

`outputSchema` каждого tool включает `ok:true` и `ok:false`. Это важно для настоящего SDK-клиента: он проверяет любое присутствующее `structuredContent`, даже при `isError:true`. Отдельные `contextOutputSchema`, `updatesOutputSchema`, `mutationOutputSchema`, `proposalMutationOutputSchema` описывают успешные ответы; `agentErrorSchema` — ошибки. Для прикладной проверки обоих вариантов используйте `validateToolBody(name, body, isError)`.

Если в ответе нет `structuredContent`, это отдельная MCP/transport-ошибка, а не предметный успешный ответ Ouro. Её обработка не должна объявлять команду невыполненной без дополнительного подтверждения.

## Структура и семантика

Flow задаёт узлы `action`, `condition`, `question`, `fork`, `blocker`, `wait`, `result` и исполнителей `human`, `agent`, `system`. Формат и размеры видны в JSON Schema. Переносимый валидатор дополнительно проверяет уникальность ID, существование связей, достижимость каждого узла и результата, различимые подписанные исходы и принадлежность question/fork человеку. Циклы повторения допустимы при наличии выхода к результату.

JSON Schema-валидатор другого языка не заменяет эти проверки. Он также не устанавливает подлинность evidence, право запуска, существование назначения или применимость решения. На сервере остаются actor/scope, guards исполнения, source ownership, project version и идемпотентность. Неизвестный event payload нельзя интерпретировать как новое разрешение на работу только на основании корректного конверта.

Исторические текстовые ограничения Flow измеряются в UTF-16 code units, а JSON Schema считает Unicode code points. Для символов вне BMP одной проверки `maxLength` недостаточно: нужен переносимый валидатор или эквивалентная семантическая проверка. NUL и непарные surrogate запрещены. Для сырых JavaScript-объектов используйте `validateFlowDefinition`: он проверяет и prototype; обычный JSON не содержит таких prototype-расширений.

Входы и Flow закрыты. DTO ответов допускают дополнительные JSON-поля; `validateToolBody` проверяет и сохраняет исходные поля, включая собственные ключи `__proto__`, без смены прототипов. Произвольные функции, getters, `undefined`, `NaN`, циклы и другие не-JSON значения не являются допустимыми расширениями. Нормализованная копия Zod `.parse()` не предназначена для пересылки неизвестных расширений.

## Профиль и состояния проходов

| Публичный API | Что проверяет |
|---|---|
| `validateFlowDefinition(value)` / `flowDefinitionSchema` | Общую legacy-структуру и семантику схемы |
| `validateEnforcedFlowDefinition(value)` / `enforcedFlowDefinitionSchema` | Дополнительно поддерживаемый профиль строгого последовательного учёта |
| `flowRuntimeSchema`, `flowStepRunSchema`, `flowTraversalSchema`, `flowRuntimeViewSchema` | Формат runtime, одного посещения, реального перехода и read-only представления доступности |
| `FlowRuntime`, `FlowStepRun`, `FlowTraversal`, `FlowRuntimeView` | TypeScript-типы известных полей этих DTO |

Профиль имеет один текущий run и исключающий выбор одного исхода. У action/wait/question/blocker ровно один выход, у result — ни одного; condition требует явного edgeId и evidence без вычисления выражения. У Fork до десяти выходов с уникальными optionId, соответствующими человеческому выбору; Blocker принадлежит agent. Несколько входов означают слияние выбранного пути, без параллельного join. Цикл создаёт новые runId/visit, до 1000 проходов на execution. Эти семантические условия не заменяются одной структурной проверкой JSON Schema.

Человек включает режим только для новой попытки через `startExecution` с `flowTracking:'enforced'`. История находится в `work[].execution.flowRuntime`, а `work[].flowProgress` показывает текущий run, действия и рёбра с причинами. После отдельного `ouro.confirm_started` назначенный агент сообщает `ouro.report_flow_step` с executionId, runId, phase `start|complete|fail`, requestId и expectedVersion. Complete/fail требуют evidence; start у wait даёт waiting до явного complete. Human/system-шаги подтверждает человек, retry/skip тоже разрешает человек. Завершение result не завершает execution и не принимает DoD.

У новых Action/Question/Fork/Blocker в enforced-попытке обязателен flowStepRunId. Плановый flowNodeId сервер выводит из run; переданный ID должен совпасть. Поздняя фаза существующего actionId сохраняет исходный run и не продвигает процесс. Внеплановый вопрос, выбор или блокер во время начатого run передаётся без flowNodeId при несовпадении типа: сервер ставит flowInterrupt, не меняя immutable план. Решение, применение/устранение, разрешение продолжить и ACK остаются отдельными фактами; interrupt-Fork не выбирает ребро схемы. [Полный сценарий и восстановление](flow-runtime-guide.md), [исследованные ориентиры](flow-runtime-research.md).

Схема DTO не доказывает, что команда разрешена: actor, owner, текущая ревизия, выбранный run, lifecycle и человеческие guards повторно проверяются сервером. Библиотека не исполняет процесс и не назначает работу.

## Проект и read-only контекст папки

Для папки-проекта MCP endpoint — `/api/projects/{projectId}/mcp`; регистрация и ключ относятся к тому же проекту. Stdio bridge получает этот адрес в OURO_URL, ключ читает из OURO_AGENT_TOKEN_FILE. Переключение Human View не меняет подключение агента, а projectId в tool arguments не добавляется. Legacy `/api/mcp` сохраняет default-проект; прежний env-token не даёт доступ к новым проектам. [Настройка любого MCP-клиента](agent-quickstart.md), [пример ChatGPT через Tunnel](chatgpt-guide.md).

`ouro.get_context` может содержать `workspace:{name,projectId,bindingId,folderName,capabilities:{readOnlyFiles:true}}`. Абсолютный путь корня остаётся в человеческом UI. Файловый вызов требует назначение на executionId выбранного проекта; сервер получает binding самостоятельно до filesystem IO.

| API / tool | Формат |
|---|---|
| `workspaceMetadataSchema` / `WorkspaceMetadata` | Metadata и capability рабочего контекста |
| `workspaceFileEntrySchema` / `WorkspaceFileEntry` | name, относительный path, kind file/directory, необязательный size |
| `workspaceFileListSchema` / `WorkspaceFileList` | projectId, executionId, bindingId, path, entries, nextCursor, truncated |
| `workspaceFileSchema` / `WorkspaceFile` | projectId, executionId, bindingId, path, text, sha256, size, modifiedAt |
| `ouro.list_workspace_files` | executionId, необязательные path/cursor; одна папка, до 200 entries, без рекурсии |
| `ouro.read_workspace_file` | executionId и path; UTF-8 до 128 KiB, hash и метаданные прочитанных байтов |

Экспортируются `listWorkspaceFilesInputSchema`, `readWorkspaceFileInputSchema`, `workspaceFileListOutputSchema` и `workspaceFileOutputSchema`. Успешные tool-ответы добавляют `ok:true` к соответствующему DTO; wire output также включает общую error-ветвь. Проверка JSON Schema не подтверждает существование папки, назначение, право чтения или неизменность файла.

Агентские пути относительны и используют `/`. Traversal, absolute/drive/backslash paths, внутренние symlink, hard-linked файлы, известные credential paths, бинарные/не UTF-8 и oversize файлы отклоняются. Binding перепроверяется при доступе. Прочитанный текст — текущий контекст с hash, а не immutable содержимое ревизии и не доказательство работы агента. Файловых write/shell tools нет. [Сценарий и точные границы](project-workspace-guide.md).

## Ошибки и неизвестный исход записи

Например, команда могла успешно попасть в SQL, а построение её ответа — завершиться ошибкой. Тогда сервер возвращает предметную ошибку `OUTPUT_CONTRACT_ERROR` с `error.details.outcomeUnknown:true`. Это не откат и не доказательство отсутствия команды.

При таком ответе, сетевом разрыве или последующем отказе доступа:

1. Сохраните исходные `requestId` и полное неизменное тело, включая `expectedVersion`.
2. Повтор для выяснения результата отправляйте с тем же автором, ID и телом. Нельзя автоматически заменить версию или создать новую команду.
3. Подтверждённая квитанция возвращает прежний результат; повтор не должен добавлять второе событие.

`retryable:false` в error body не доказывает отсутствие commit. Это не разрешение сформировать новый requestId. При обычном подтверждённом конфликте прочитайте контекст и применяйте действующие правила осмысленного нового запроса; неопределённый исход сначала нужно выяснить.

## Совместимость и дальнейшие этапы

Версия 0.1.1 добавила `ouro.report_flow_step` и необязательные run linkage поля; 0.1.2 сохраняет эти 16 tools и добавляет два read-only инструмента папки и workspace DTO. Прежние имена/legacy-вызовы, immutable receipts и hashes ревизий сохраняются. Новые отчёты enforced-попытки требуют flowStepRunId по серверным guards; клиент должен явно поддерживать этот режим. Workspace access требует project-bound endpoint и назначение, а не нового поля projectId во всех запросах. Старые артефакты 0.1.0/0.1.1 не заменяются содержимым 0.1.2. Discovery необязателен для прежних tools-only клиентов; старый сервер не приобретает новые tools через установку библиотеки.

До 1.0 несовместимое изменение требует новой MINOR-версии, совместимая правка — PATCH. Новое обязательное поле, изменение guards, новый enum или изменение закрытого Flow могут потребовать новой несовместимой версии. Расширяемые DTO поддерживают дополнительные JSON-поля; новый смысл поля или новые полномочия из этого не следуют. Установленный артефакт определённой версии нельзя молча заменять другим содержимым.

Полностью типизированные event payload и пакетное построение всей дорожной карты остаются отдельными этапами. По уточнённому приоритету сначала реализуется локальный вход и единый живой дашборд для любых MCP-агентов. Версия 0.1.2 не добавляет batch tool, не генерирует Flow за агента и не меняет правила активации старых спек.

Проверки пакета выполняются через `npm run protocol:check` и `npm run protocol:test-package`; результаты 0.1.2 и RED/GREEN фиксируются в [журнале проектов/дашборда](plans/project-workspace.md). Первоначальные [SDD 0.1.0](specs/domain-contract.md), [журнал alpha.12](plans/domain-contract.md), [runtime alpha.13](plans/flow-runtime.md) и [исследование контракта](protocol-research.md) сохранены как история. [Новые источники и решения](project-workspace-research.md) описаны отдельно.
