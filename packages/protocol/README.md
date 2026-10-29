# @ouro/protocol · контракт 0.1.1

Переносимая библиотека предметных контрактов Ouro: Flow, проходы шагов, входы 16 MCP tools, SUCCESS-ответы и ошибки. Включает Zod-валидаторы, TypeScript declarations, 41 JSON Schema Draft2020-12, каталог версии, примеры и CLI.

Пакет работает отдельно от приложения Ouro. Runtime-зависимость — `zod`; Next.js, PostgreSQL, MCP SDK и браузер не нужны. Сам пакет не является MCP-сервером, не выдаёт полномочий и не исполняет задачи. Он также не генерирует план автоматически.

## Отдельная сборка из исходников

Нужны Git, Node.js 20.9+ и npm; рекомендуемая проверенная версия Node 24.19.0. Исходники находятся в ветке `feat/flow-runtime`:

```sh
git clone --branch feat/flow-runtime --single-branch https://github.com/QahNaaRlN/ouro.git
cd ouro/packages/protocol
npm ci
npm pack
```

`npm pack` сам собирает ESM, CommonJS, declarations и JSON-файлы. Получается **`ouro-protocol-0.1.1.tgz`**. Устанавливать зависимости корневого приложения для этого не требуется.

Перенесите tarball в другой проект:

```sh
npm install ./ouro-protocol-0.1.1.tgz
```

Публикация в npm registry не выполнялась. Имя `@ouro/protocol` используется в локальном пакете; команда `npm install @ouro/protocol` из публичного registry здесь не обещается. `private:true` не мешает установке `.tgz`.

## JavaScript и TypeScript

ES modules:

```ts
import {
  PROTOCOL_VERSION,
  assertProtocolVersion,
  validateFlowDefinition,
  validateToolBody,
  createSchemaBundle,
  type FlowDefinition,
} from '@ouro/protocol';

assertProtocolVersion('0.1.1');

const candidate: unknown = {
  entryNodeId: 'result',
  nodes: [{id:'result', kind:'result', title:'Предъявить результат', description:'', owner:'agent'}],
  edges: [],
};
validateFlowDefinition(candidate);
const flow: FlowDefinition = candidate;

const response = validateToolBody('ouro.get_updates', {ok:true, events:[], cursor:0});
const bundle = createSchemaBundle();
console.log(PROTOCOL_VERSION, flow, response, bundle.manifest.version);
```

CommonJS также собран и имеет отдельные declarations:

```js
const {validateFlowDefinition, PROTOCOL_VERSION} = require('@ouro/protocol');
```

Основные API:

| API | Поведение |
|---|---|
| `validateFlowDefinition(value)` | Проверяет сырое JS-значение, структуру и семантику Flow; при отказе бросает ошибку с `code:'VALIDATION_ERROR'` |
| `flowDefinitionSchema` | Конкретный ZodObject с описанием nodes/edges; `.parse`/`.safeParse` проверяют JSON и графовые условия |
| `validateEnforcedFlowDefinition(value)` / `enforcedFlowDefinitionSchema` | Дополнительно проверяют профиль последовательного учёта проходов, не меняя legacy Flow |
| `flowRuntimeSchema`, `flowStepRunSchema`, `flowTraversalSchema`, `flowRuntimeViewSchema` | Конкретные DTO проекции процесса, отдельных посещений, переходов и доступности действий |
| `FlowRuntime`, `FlowStepRun`, `FlowTraversal`, `FlowRuntimeView` | TypeScript-типы известных полей тех же DTO |
| `AGENT_TOOLS` | Строгие входные схемы и метаданные 16 tools, включая `ouro.report_flow_step` |
| `getToolOutputSchema(name)` | Возвращает wire ZodObject выбранного tool с SUCCESS/error-вариантами; неизвестное имя отклоняется |
| `getToolSuccessSchema(name)` | Возвращает отдельный SUCCESS-контракт выбранного tool |
| `agentErrorSchema` | Отдельная схема `{ok:false,error:{...}}` |
| `validateToolBody(name,body,isError)` | Проверяет SUCCESS или error body, сохраняет объявленные дополнительные JSON-поля; ошибка — ZodError |
| `protocolManifest` / `createSchemaBundle()` | Каталог версии/ограничений и canonical JSON Schema bundle |
| `assertProtocolVersion(version)` | Принимает только явно поддерживаемую версию; другая даёт `UNSUPPORTED_CONTRACT_VERSION` |

Для сырых JS-ответов используйте **`validateToolBody`**: он проверяет JSON-значения и descriptors, запрещает функции/getters/циклы и сохраняет исходные дополнительные поля, включая собственные `__proto__`, без изменения прототипов. Объект должен содержать JSON-данные, а не произвольные JS-экземпляры. Zod-схемы предназначены для проверки/экспорта; не используйте нормализованную копию из `.parse()` или `.safeParse().data` как средство пересылки неизвестных расширений. SDK Ouro возвращает исходный проверенный JSON.

## CLI

После установки tarball:

```sh
npx ouro-protocol manifest
npx ouro-protocol validate-flow flow.json
npx ouro-protocol validate-response ouro.get_updates response.json
```

Коды завершения:0 — данные соответствуют выбранному контракту;1 — отказ валидации, JSON или чтения;2 — неверное использование CLI. Проверка ничего не записывает в Ouro и не запускает агента.

В `examples/` есть `flow-valid.json` с человеческим выбором, `flow-invalid.json` с ошибочной ссылкой и `updates-success.json`. Это учебные данные, не события настоящего исполнения.

## JSON Schema для других языков

В `schemas/manifest.json` перечислены стабильные URN `$id` и имена файлов. `schemas/bundle.json` содержит весь каталог с версиями. Например:

- `flow.schema.json` — Flow;
- `enforced-flow.schema.json` — структура строгого Flow; дополнительные графовые правила проверяет `validateEnforcedFlowDefinition`;
- `flow-runtime.schema.json`, `flow-step-run.schema.json`, `flow-traversal.schema.json`, `flow-runtime-view.schema.json` — учёт проходов и доступность;
- `input-ouro.submit_proposal.schema.json` — предложение подключённого агента;
- `output-ouro.get_context.schema.json` — ответ с назначенным контекстом;
- `error.schema.json` — тело ошибки.

Canonical dialect — `https://json-schema.org/draft/2020-12/schema`. `$id` имеет вид `urn:ouro:protocol:0.1.1:flow`; это идентификатор, а не адрес сетевого сервиса. Файлы можно использовать независимо от JavaScript/npm в совместимом JSON Schema-валидаторе. Он проверит структуру; правила следующего раздела нужно реализовать дополнительно или вызвать переносимый JS-валидатор.

## Семантика Flow и границы проверки

Узлы: `action`, `condition`, `question`, `fork`, `blocker`, `wait`, `result`. Исполнители: `human`, `agent`, `system`. Question/Fork принадлежат человеку. Схема содержит entryNodeId,1–100 узлов и0–200 связей с существующими source/target.

Семантическая проверка требует уникальные ID, достижимость каждого узла от entry, путь от каждого узла к result и различимые подписанные исходы condition/fork. Повторные циклы допустимы, если есть путь к результату. Result не имеет исходящих связей. Позиции карточек не являются частью этого контракта.

Исторические текстовые ограничения считаются в **UTF-16 code units**, как JS `string.length`. JSON Schema считает Unicode code points, поэтому одного `maxLength` недостаточно для astral-символов. Валидатор сохраняет прежние границы, запрещает NUL и непарные surrogate. На сырых JS-объектах он также отклоняет необычные prototypes; JSON-данные такого prototype не содержат. ZodObject нормализует JS records при разборе, поэтому для raw JS-проверки используйте `validateFlowDefinition`, а не только `.parse`.

Входы и Flow закрыты: неизвестные поля отклоняются. DTO ответов допускают дополнительные **JSON**-поля, не отбрасывая их. Известные поля wire-конверта зарезервированы и сохраняют объявленный тип в обеих ветвях; дополнительные поля не должны переопределять их другим типом. Конверт события описан явно, но `payload` и error `details` являются JSON-расширениями. Это не полный типизированный каталог всех доменных event payload.

Проверка структуры не устанавливает права, существование реального назначения или истинность evidence. В приложении сервер дополнительно проверяет actor/scope, immutable ревизию, lifecycle, human decisions, source ownership, project version и идемпотентность. Схема плана, факты исполнения, человеческая приёмка и разрешение запуска остаются раздельными.

## Подключение через MCP

Сервер сохраняет прежние 15 tools и добавляет `ouro.report_flow_step`. Legacy-аргументы остаются допустимыми. Агент может дополнительно прочитать:

- `ouro://protocol/manifest` — версия и список схем;
- `ouro://protocol/schemas` — canonical bundle.

Ресурсы статические, без данных проекта. Они доступны через HTTP и stdio при поддержке resources сервером; старые tools-only клиенты продолжают работать. `ouro.get_context` остаётся первым чтением назначенной работы.

## Последовательный учёт проходов

Человек включает режим только при новом `startExecution` с `flowTracking:'enforced'`. Старые попытки остаются legacy; их Action не превращаются в проходы. Профиль требует ровно один выход action/wait/question/blocker, ноль выходов result, отдельные optionId каждого выхода Fork (до десяти), agent-owned Blocker. Несколько входов — слияние выбранного пути, без ожидания всех предшественников. Циклы допустимы; каждое посещение получает новый runId/visit, всего до 1000 проходов. Текст condition не исполняется, выбор edgeId и evidence явные.

В контексте `execution.flowRuntime` содержит историю runs/traversals, а `work[].flowProgress` — текущий проход, доступные действия агента/человека и состояния рёбер с причинами. `currentRunId` становится null после завершённого result или отмены. `ready/running/waiting/succeeded/failed/skipped/cancelled` описывают конкретное посещение узла; `not_selected` не создаёт фиктивный skipped-проход альтернативы. Схемы проверяют DTO, а не доказательство разрешённого перехода.

Назначенный агент отправляет `ouro.report_flow_step` с `executionId`, `runId`, `phase:'start'|'complete'|'fail'`, `requestId` и `expectedVersion`; `evidence` обязателен для complete/fail по доменным guards, `edgeId` обязателен для выбора condition. У start wait состояние waiting до явного complete. Human/system action/wait/condition/result подтверждает человек через человеческий API. Retry/skip также требуют человека; MCP tool для обхода этих полномочий нет.

Четыре `ouro.report_action/question/fork/blocker` принимают optional `flowStepRunId`; в enforced он требуется для нового отчёта. `flowNodeId` можно опустить: сервер выведет его из прохода. Поздняя фаза Action сохраняет исходный run и сама не продвигает процесс. Внеплановый Question/Fork/Blocker на начатом проходе сохраняет серверный `flowInterrupt:true`, если flowNodeId не передан и тип не совпадает с плановым узлом. Передавать flowInterrupt во входах нельзя. Человеческое решение, применение/устранение, разрешение продолжить и ACK агента остаются отдельными фактами. Interrupt-Fork не выбирает ребро диаграммы. Отзыв внепланового Question/Fork допускает продолжение после отдельного resume/ACK; отзыв Blocker не устраняет физическую помеху.

Переход создаёт завершение, traversal и следующий ready-run атомарно. Сохраните точное тело и requestId: повтор после смены текущего run возвращает исходную SQL-квитанцию. Result не завершает execution и не принимает DoD; эти действия остаются отдельными. Лимит/отказ, пауза, зависимость, смена ревизии и stopRequested проверяются сервером. Fail фиксирует наблюдение начатого прохода и при остановке/смене ревизии, не разрешая новый шаг.

Полная [инструкция по runtime](https://github.com/QahNaaRlN/ouro/blob/feat/flow-runtime/docs/flow-runtime-guide.md) и [SDD](https://github.com/QahNaaRlN/ouro/blob/feat/flow-runtime/docs/specs/flow-runtime.md) находятся в репозитории; пакет самостоятельно предоставляет контракты и валидаторы, без event store или runner.

Закреплённый MCP SDK1.32.2 публикует tool input/output schemas в **Draft7**. Canonical пакет использует **Draft2020-12**. Это два проверенных представления тех же определений; dialect нельзя угадывать по версии приложения. MCP `outputSchema` описывает SUCCESS и error `structuredContent` через явные discriminator/required-ветви. Tool errors сохраняют `isError:true` и отдельно проверяются `agentErrorSchema`. Это необходимо: server SDK пропускает output validation для isError, а client валидирует любое присутствующее structuredContent даже при isError.

Если сервер вернул `OUTPUT_CONTRACT_ERROR` с `error.details.outcomeUnknown:true`, результат записи неизвестен: сохраните исходные `requestId` и тело. Повторяйте тот же запрос для получения прежней квитанции. Новое имя запроса не доказывает отсутствие первой записи. Ошибка валидации ответа после commit не откатывает уже совершённое действие.

## Версии и совместимость

Версия библиотеки/контракта 0.1.1 независима от версии приложения, transport MCP и `schemaVersion:1` доменных событий. В этом артефакте поддерживается только точная 0.1.1; автоматический выбор другой 0.x не выполняется. Клиент сравнивает manifest и использует схему объявленной версии. Версия 0.1.1 совместимо добавляет opt-in tracking и сохраняет legacy-вызовы; старый артефакт 0.1.0 не переписывается. Старый сервер без discovery нового tool не приобретает эту возможность.

До1.0 несовместимое изменение требует новой MINOR-версии, совместимая правка — PATCH. Новые обязательные поля, изменение смысловых guards и изменения закрытой Flow-структуры могут быть несовместимыми даже при добавлении необязательного поля. Дополнительные поля расширяемых DTO допустимы; новые возможности старого сервера нельзя предполагать без discovery. Опубликованный артефакт существующей версии не редактируется молча. Существующие ревизии/receipts приложение не переписывает ради нового описания.

## Проверка и повторная сборка

В исходной папке пакета:

```sh
npm ci
npm run build
npm run check
npm pack
```

`check` сверяет JSON с исходными схемами. В полном репозитории `npm run protocol:test-package` копирует исходники в независимую папку, устанавливает собственные зависимости, собирает tarball и проверяет его установку в чистый consumer. Для использования готового `.tgz` TypeScript-компилятор не требуется.

Применены [JSON Schema Core2020-12](https://json-schema.org/draft/2020-12/json-schema-core), [MCP Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) и [Node ESM](https://nodejs.org/api/esm.html). Поведение transport проверяется по реально закреплённому SDK; библиотека не объявляет поддержку всех возможностей новейшей спецификации MCP.
