# OURO-ENG-000014 · Статусы проходов процессной схемы

Редакция 1 · 29.10.2026 · SDD до кода. База `70cb0fd`, отдельная ветка `feat/flow-runtime`, приложение alpha.13. Пользователь поручил следующий слой: состояния каждого шага, допустимые переходы и повторные проходы. Полноценный BPMN runner и запуск произвольного кода не входят в пакет.

## Совместимость и граница

При новом человеческом `startExecution` optional `flowTracking:'enforced'` включает последовательный учёт immutable Flow назначенной ревизии. Отсутствие поля сохраняет прежнее поведение. Уже существующие попытки не переводятся в новый режим и не получают придуманные проходы из старых Action. В UI выбор режима явный. Legacy Flow и hash сохранённых ревизий не меняются.

Enforced profile: один текущий проход; все исходы исключающие. Action/wait/question/blocker имеют ровно один выход, result — ноль. Condition требует явного edgeId и evidence, текст условия не исполняется. Каждый выход Fork имеет уникальный optionId; соответствующий вариант должен существовать в человеческом запросе. Неоднозначный legacy Flow остаётся читаемым, но его строгий запуск отклоняется с объяснением. Параллельные fork/join, выражения условий, таймеры и автоматический scheduler не добавляются.

Несколько входящих связей означают обычное слияние выбранного пути: каждый реальный переход создаёт новый проход; ожидания всех предшественников как у AND-join нет. Start узла wait даёт waiting до явного complete с evidence; для Question/Fork/Blocker waiting возникает при связанном запросе. Waiting не завершает шаг автоматически.

## Данные и состояния

`Execution.flowRuntime?` — проекция событий: `{version:1,state,currentRunId,runs,traversals}`. State = active/completed/failed/cancelled. Run = `{id,nodeId,visit,state,createdAt,startedAt?,finishedAt?,evidence?,reason?,retryOfRunId?}`. State прохода = ready/running/waiting/succeeded/failed/skipped/cancelled. Visit — последовательный номер посещения одного nodeId внутри execution. Traversal = `{id,edgeId,fromRunId,toRunId,at}`. Предел — 1000 проходов на попытку, без автоматических циклов.

У непосещённого узла показывается «Нет зарегистрированных проходов». Не выбранные ветви не создают фиктивных skipped-проходов: тот же узел может быть посещён позже через цикл. Текущий статус карточки относится к последнему проходу; инспектор позволяет выбрать точный прежний runId. Другая execution/revision не меняет его состояние.

Первый ready-проход entry создаётся атомарно с ExecutionCreated. Запуск execution и ACK остаются отдельными. `reportFlowStep {executionId,runId,phase:start|complete|fail,evidence?,edgeId?}` записывает явный факт. Start допускается только для текущего ready; complete/fail — для текущего начатого прохода. Complete/fail требуют evidence. Завершение и открытие следующего ready-прохода с traversal сохраняются одной транзакцией. Result завершает процесс, но не принимает DoD и не завершает execution автоматически.

Переход/старт требуют execution.running, актуальной ревизии, canRun, отсутствия stopRequested, человеческих и физических блокировок. Агент подтверждает agent-owned шаги. Для human/system action/wait/condition/result факты подтверждает человек с evidence; system здесь означает наблюдаемый системный шаг, а не наличие нового встроенного runner. Для Question/Fork агент может открыть человеческий шаг и сообщить его завершение только после требуемых человеческих фактов. Blocker сообщает назначенный агент.

Fail — наблюдение без перехода: текущий начатый running/waiting проход незавершённой execution может получить failure evidence также при паузе, запросе остановки или смене ревизии, как поздний Action. Проверяются actor/owner и исходный run. Это не снимает stopRequested/unknown-stop и не открывает преемника. Новые Flow-факты разрешены как первичные источники агентской сводки в прежних строгих пределах execution/revision/author.

Человеческий `retryFlowStep {executionId,runId,reason}` создаёт новый ready-run того же узла только после failed. Человеческий `skipFlowStep {executionId,runId,reason,evidence}` допускается только для ready action/wait с одним выходом, после общих guards. Нельзя переписать terminal run, пропустить Question/Fork/Blocker или автоматически объявить альтернативу выполненной.

## Запросы человеку и отчёты

В четыре report tools добавляется optional `flowStepRunId`. В enforced execution он обязателен для привязанных отчётов и новых действий/запросов: сервер проверяет execution, назначенную ревизию, node kind и текущий run. `flowNodeId` выводится из run; если передан, обязан совпасть. Для поздней фазы существующего actionId сохраняется исходный run. Action started/completed/failed остаётся фактом и сам не двигает курсор процесса. Непривязанные legacy факты не превращаются в проходы.

`DecisionRequest.flowStepRunId` фиксируется сервером и сохраняется при уточнении/исправлении/замещении. Применяются только действующие решения соответствующего прохода: старый applied Fork не разрешает новый проход того же узла. Question требует положительного ответа и подтверждения применения; Fork — выбранного optionId, точного соответствия edgeId и применения; Blocker — подтверждённого устранения с evidence. Отзыв или отклонение не выдаёт разрешения. Enforced human step не ослабляется blockingScope:none.

Решение, применение и фактическое продолжение различаются: reportFlowStep complete требует отдельного человеческого resume и ACK агента. Начатый проход показывает waiting при связанном ожидании/подтверждённой паузе; возврат running выводится только из подтверждённых фактов и выполнения guards. StopRequested сам не подтверждает остановку.

Успешный `completeExecution` для enforced execution разрешён только после завершённого result. Неуспешное завершение/отмена execution закрывает авторизацию открытого прохода, не выдумывая локальный успех или физическую остановку. При новой ревизии прежние данные остаются на прежней ревизии; поздние Action принимаются по прежним правилам, но не открывают новые шаги.

## API и отображение

Добавляется один MCP tool `ouro.report_flow_step` с теми же requestId/expectedVersion и проверкой назначения, что у остальных мутаций. Human retry/skip доступны через человеческие команды. Все state-dependent проверки выполняются внутри доменной команды после поиска квитанции: точный повтор запроса после перехода возвращает прежнюю квитанцию, а не ошибку нового текущего run. Ни одно повторение не создаёт второй traversal.

Контракт `@ouro/protocol` получает совместимую версию 0.1.1: конкретные runtime DTO, новый tool, optional run linkage, JSON Schema и отдельная установка. Изменение не переписывает артефакт 0.1.0. HTTP/stdio discovery и response validation сохраняются. Новые события используют существующий append-only store/outbox/receipts; новая SQL-таблица не требуется.

Учебный локальный симулятор получает отдельные flow_start/flow_complete/flow_fail с точными executionId/runId и синтетическим simulation:// evidence. Он сохраняет прежнее ограничение доверенного локального оператора и не может подтверждать работу внешнего агента. Повтор использует исходные requestId/body/expectedVersion и исходный проход; человеческие решения не симулируются.

Core предоставляет read-only `buildFlowRuntimeView(state,executionId,runId?)`: для выбранного прохода сообщает состояние, available/blocked/taken/not_selected рёбра с причиной и разрешённые действия назначенного агента/человека. Источник guards общий с командами; отсутствие actor permission не обходится интерфейсом. MCP context отдаёт текущие runtime данные и доступность. UI отображает их в графе и таблице, отдельный inspector хранит выбранный runId при SSE. Клик по линии только открывает детали. Черновик и историческая схема не получают статусы текущей попытки.

## Приёмка до реализации

| ID | Проверяемый результат |
|---|---|
| FR01 | Старые попытки/receipts/hashes не меняются; legacy completion не создаёт runtime |
| FR02 | Opt-in требует Flow/profile; ready entry появляется один раз, до ACK начать шаг нельзя |
| FR03 | Старт/завершение вне очереди, чужой run, неверное ребро/owner, stop/freeze/dependency/revision guards дают отказ без записи |
| FR04 | Линейный процесс открывает только реального преемника; result не принимает DoD; premature execution success отклоняется |
| FR05 | Цикл создаёт отдельные runId/visit/traversal; прежний результат сохраняется, не выбранные пути не становятся skipped |
| FR06 | Question/Fork/Blocker сохраняют человеческую authority, applied/clearance и отдельный resume ACK; старый проход/lineage не разрешает новый |
| FR07 | Retry/skip сохраняют прежние runs, требуют человека/причины; skip не обходит человеческие/физические барьеры |
| FR08 | Late Action относится к исходному проходу, не продвигает runtime; смена action binding и произвольное заявление runId отвергаются |
| FR09 | Replay/reopen/исторический cursor и SQL receipt повтор дают те же runs/traversals; гонка создаёт один переход |
| FR10 | Настоящий SDK видит новый tool/DTO/resources; assigned scope, HTTP/stdio и post-commit unknown outcome не регрессируют |
| FR11 | Граф/таблица/инспектор показывают одинаковые статусы, выбранный старый run и focus не теряются при SSE; выбор/apply/traversal различимы |
| FR12 | Legacy/draft/unvisited не выдают evidence за исполнение; light/mobile/keyboard доступны; полный unit/typecheck/build/production E2E и standalone package gate успешны |

## Ориентиры

[W3C SCXML §3.5, §3.13 и алгоритм](https://www.w3.org/TR/scxml/) — события, guards, атомарная обработка перехода; [OMG BPMN 2.0.2](https://www.omg.org/spec/BPMN/2.0.2/PDF) — человеческая задача и исключающий выбор; [React Flow accessibility](https://reactflow.dev/learn/advanced-use/accessibility) — клавиатура/ARIA; [Fowler Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html) — неизменяемые факты и replay. Применение, реально прочитанные разделы и ограничения фиксируются в журнале и инструкции. Полная совместимость SCXML/BPMN не заявляется.
