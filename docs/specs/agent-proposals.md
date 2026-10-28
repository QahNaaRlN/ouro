# OURO-ENG-000009 · Reality → предложения подключённого агента

2026-10-28 UTC · SDD до реализации. Агент уже подключается настоящим MCP HTTP/stdio. Этот пакет добавляет источники и человеческое рассмотрение; отдельный встроенный LLM runner не предполагается.

## Поведение

Назначенный агент публикует сводку своего исполнения либо предложение новой спеки через `ouro.submit_proposal`. Вывод явно принадлежит этому агенту. Каждое наблюдение содержит точные ID исходных committed событий; интерпретация и ограничения показаны отдельно. Наличие ссылки не означает семантическую проверку вывода.

Человек рассматривает точную версию: отмечает сводку просмотренной, отклоняет с причиной или редактирует предложенное ожидание и создаёт обычную idea Spec. Активация, запуск, публикация Lesson и приёмка DoD отдельно. Неизменяемое происхождение новой спеки связывает её с точной версией предложения.

## Артефакты и команды

- Proposal: immutable project/spec/revision/execution/agent контекст, latestRevisionId; состояние pending/reviewed/dismissed/adopted строится из фактов.
- ProposalRevision: id, proposalId, revision, parentRevisionId?, sourceCursor, server-derived sourceEventIds, immutable content, submittedBy/createdAt.
- Content: kind reality_summary/spec_proposal; title; findings[{text,sourceEventIds}]; interpretation; limitations; draft:RevisionContent только для spec_proposal. Kind сохраняется при новой версии.
- `submitAgentProposal`: только назначенный agent (не service/human), paired proposalId/baseProposalRevisionId для новой версии собственного pending предложения. Контекст берётся из назначения сервером; поздняя r1-сводка не переносится на r2.
- `reviewAgentProposal {proposalId,proposalRevisionId,outcome:reviewed|dismissed,comment}`: человек и точная latest pending версия; reviewed только для сводки, dismissal для обоих видов.
- `adoptAgentSpecProposal {proposalId,proposalRevisionId,content,comment,sourceSpecId?}`: человек и точная pending версия. SpecCreated+AgentProposalAdopted(+явный derived_from) атомарны. Spec.origin agent_proposal указывает proposal/revision; author новой ревизии — человек. sourceSpecId, если выбран, только настоящая исходная спека.

Все команды используют requestId/expectedVersion и обычную SQL receipt/outbox атомарность. Review терминален для bounded пакета; дальнейшее уточнение после review — новое предложение. Ни исходный текст, ни прежнее решение не перезаписываются.

## Источники и ограничения

Строгие закрытые схемы в MCP и core; aggregate UTF-8 content<=192KiB, title1..200, findings1..12, text1..4000, IDs1..10 на observation, union1..50, interpretation1..8000, limitations1..4000. Draft obeys normal revision/Flow/DoD validation; вложенные authority/model/curated keys не допускаются.

Строки обязаны сохраняться в JSONB без замены Unicode: lone UTF-16 surrogate и NUL отклоняются как VALIDATION_ERROR до append. RequestId проверяется до receipt lookup, чтобы некорректный идентификатор не доходил до SQL text-параметра.

sourceCursor — safe integer от версии назначения до текущего committed cursor. Каждый ID существует в том же проекте и не позже sourceCursor. Citation predicate уже обычной get_updates visibility: только выбранное исполнение и его immutable spec/revision, setup этой ревизии и human RoadmapStateChanged. Чужое исполнение того же агента, sibling r2 и другой агент не становятся источником автоматически. Remediation не получает право приписывать себе факты parent agent.

Нужен хотя бы один реальный observation/lifecycle/decision факт; одного разрешения ExecutionCreated/setup недостаточно. GitHub service Action в этом исполнении допустим с исходной атрибуцией. Lesson/Proposal/technical shared draft не являются первичными facts для сводки. Сводка не ссылается сама на себя. Ошибка источника не раскрывает скрытое содержимое или идентичность автора.

Human adoption event несёт исходный execution context и destination IDs, но не тело новой неназначенной спеки. Agent response/get_updates/get_context никогда не возвращают полный ProjectState или чужую destination revision. Новая спека не означает новое назначение.

## UI

Раздел предложений показывает ответственного агента, исходные Human ID/rN/execution/cursor, версию и статус review; первичные цитаты раскрываются рядом с каждым observation. Simulation и GitHub verification сохраняют своё исходное значение. Нет confidence score или implied approval.

Форма принятия pinned к показанной версии и project version. Remote новая версия/review сохраняют текст/focus для сравнения и блокируют устаревшую запись; rebase явный. Предложенный Flow сохраняется и показывается; его можно редактировать существующим process editor после создания спеки. При потере ответа тело/requestId сохраняются, неуверенный результат сначала выясняется повтором. Выбор новой спеки — по точному ID SpecCreated из собственного receipt.

В пределах открытой страницы unresolved intent хранится выше панели, поэтому смена раздела или выбранного предложения не теряет исходный запрос. Полная перезагрузка не является обещанием локального autosave: сначала читается текущее terminal состояние предложения; домен запрещает повторную adoption отдельным новым запросом. Интерактивный переход из Spec.origin открывает точное предложение и его версию.

## Приёмка/TDD

P01 strict authority/schema, настоящий SDK discovery/call, revoked key и запрет human/service submission. P02 каждый source ID и окно, cross-execution/r2/circular sources, отсутствие утечки, допустимые глобальные cursor gaps. P03 immutable версии, pinned parent, терминальный review, late r1. P04 human review/adopt и разделение Lesson/DoD. P05 SQL receipt-before-version/reopen/outbox rollback, одна idea Spec с human-edited content и точным provenance, никакой activation. P06 HTTP+stdio SDK и отсутствие утечки destination body. P07 browser sources/edit/adopt/exactselection, lost-response retry, concurrent r2/review/focus, light/mobile. P08 README с инструкцией настоящему агенту и честными границами семантической проверки.

Ориентиры: официальные MCP tools/schema/output и уже применённые Event Sourcing/CQRS. Новые источники фиксируются после фактического чтения в журнале; наличие протокольного теста не выдаётся за проверку всех LLM.
