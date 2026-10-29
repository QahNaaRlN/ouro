# OURO-ENG-000013 · переносимый предметный контракт Ouro

29.10.2026 · SDD до реализации. Пользователь согласовал первый ограниченный пакет: полный Flow-контракт, схемы ответов MCP и документацию для отдельной установки.

## Границы

Пакет `packages/protocol`, локальное имя `@ouro/protocol`, версия контракта `0.1.0`. Это библиотека контрактов и валидаторов с JSON Schema, не самостоятельный MCP-сервер. Runtime зависит только от Zod; отсутствуют зависимости от Next.js, SQL, UI, `core` или MCP SDK. Установка из проверенного `npm pack` tarball; публикация в npm registry не выполняется. Версия контракта независима от версии приложения и согласованной transport-версии MCP.

В этом пакете формализуются Flow, входы существующих15 tools и их ответы. Общие DTO контекста/исполнения/запросов/предложений описаны явно. `DomainEvent` имеет типизированный конверт; `payload` и расширяемые error details являются явно объявленными JSON-данными. Полный каталог всех типизированных event payload, пакетные roadmap proposals, новый оркестратор и требование Flow для всех существующих спек — последующие этапы.

## Критерии приёмки

1. Agent-visible `draft.flow` содержит конкретные схемы entry/nodes/edges, типы шагов, исполнителей, связи, размеры и запрет неизвестных полей. Внешняя схема больше не `{}`. Те же структурные определения используются core, proposal parser и MCP.
2. Переносимый валидатор сохраняет действующие правила: уникальные ID, существующие ссылки, human question/fork, достижимость всех узлов и результата, подписанные альтернативы, допустимые повторы с выходом, Unicode/NUL и ограничения размеров. Старые валидные Flow не становятся недопустимыми из-за произвольного ужесточения.
3. Все15 tools объявляют конкретные SUCCESS `outputSchema`; ошибки отдельно описаны `error`-схемой и сохраняют `isError:true`. Внешняя валидация независимым JSON Schema-валидатором подтверждает примеры входов/ответов. Входы закрыты; расширяемые DTO ответов сохраняют неизвестные дополнительные JSON-поля, а Flow остаётся закрытым.
4. Ответы реально проверяются общим контрактом. Ошибка построения/валидации ответа после commit не означает отсутствие записи: безопасная ошибка явно сообщает неизвестный исход, требует сохранить прежние requestId/body; повтор возвращает прежнюю квитанцию и не добавляет второй факт. Старые SQL receipts без новых полей не переписываются и продолжают работать.
5. MCP resources публикуют статические `ouro://protocol/manifest` и `ouro://protocol/schemas`; HTTP и stdio дают одинаковые версии/схемы. Число tools остаётся15. Discoverability не выдаёт данные проекта или новые права.
6. Canonical JSON Schema bundle использует Draft2020-12 и стабильные URN `$id`. MCP SDK wire-dialect проверяется отдельно (закреплённый SDK экспортирует Draft7); документация не смешивает их. Версия/manifest/JSON не расходятся с исходными определениями, legacy tools не требуют нового поля версии в каждом запросе.
7. Собранный `.tgz` устанавливается в пустой независимый проект. Проверены JS import, TypeScript declarations, CLI валидации, корректный Flow и отклонение неверного, JSON-файлы/manifest и отсутствие скрытых файлов/секретов приложения в tarball. CJS/ESM поддержка описана по факту; registry availability не заявляется.
8. README пакета содержит установку, сборку, API/CLI, примеры JSON, ошибки, семантические ограничения и правила версий. Репозиторий содержит SDD/TDD, ориентиры и инструкцию повторной отдельной сборки. Пользовательские данные и старые immutable ревизии не изменяются.

## Принятые интерфейсы модулей

- `packages/protocol/src/flow.ts`: `flowDefinitionSchema`, `validateFlowDefinition`, Flow-типы; самостоятельная семантическая проверка.
- `packages/protocol/src/inputs.ts`: структурные proposal schemas, `submitProposalInputSchema`, `agentProposalContentSchema`, `proposalRevisionContentSchema`.
- `packages/protocol/src/tools.ts`: существующие `AGENT_TOOLS`/`AgentToolDefinition` и их input schemas без зависимостей от приложения.
- `packages/protocol/src/outputs.ts`: SUCCESS schemas context/updates/mutation/proposal mutation, `agentErrorSchema`, `getToolOutputSchema(name)`, `validateToolBody(name,body,isError)`; моделирование DTO и JSON extension fields.
- `packages/protocol/src/index.ts`, `manifest.ts`, schema exporter и CLI собираются отдельно; package version0.1.0 — один источник версии контракта.
- MCP integration добавляет outputSchema, resources и stdio forwarding, не меняя полномочия агента и базовые тела запросов.

## Ориентиры

Прочитаны [JSON Schema Core2020-12](https://json-schema.org/draft/2020-12/json-schema-core) (`$schema`/`$id`), [MCP Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) (input/output schemas) и установленный SDK1.32.2 (реальная конвертация dialect/output validation/resources). Текущая runtime-совместимость проверяется по закреплённому SDK, не обещается поддержка всех новых transport-возможностей спецификации2026. [Node ESM](https://nodejs.org/api/esm.html) — переносимые module/file URL и отдельный пакет.
