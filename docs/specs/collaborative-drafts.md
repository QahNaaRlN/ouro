# OURO-ENG-000008 · Совместные черновики и отдельные человеческие идентичности

SDD · 28.10.2026 UTC. Пакет следует после истории решений/исторической проекции/операторского восстановления и перед предложениями AI. Он готовится в изолированном worktree; тестируемая alpha.2 и её БД не меняются.

## Человеческая идентичность standalone

Доверенный локальный оператор или OURO_HUMAN_TOKEN регистрирует именованных участников проекта. Каждому сервер выдаёт отдельный криптографически случайный 256-bit ключ `ouro_human_…`: он показывается один раз, в БД только SHA-256. Ключ повторно обменивается на подписанную HttpOnly SameSite=Strict cookie до отзыва. Это локальная проектная авторизация: все участники имеют человеческие полномочия этого проекта, внешнее SSO/RBAC не заявляется.

Сервер выводит actor.id/name/project из реестра. Тело команды не задаёт идентичность. POST session принимает только credential в ограниченном JSON; ключ не попадает в URL, storage браузера, факты или журнал. Cookie содержит подписанные participantId/projectId/expires, сервер повторно проверяет действующий реестр при каждом запросе. Поддельная, истёкшая или отозванная participant-cookie не превращается в демо-сессию. Явный Authorization имеет приоритет и неверное значение не заменяется cookie. GET /api/session сохраняет действующую participant-сессию, возвращает её metadata; выход очищает cookie. После перезапуска серверный ephemeral signing key может потребовать повторного входа по ключу.

Человеческие маршруты project/events/inbox/commands/agents/simulator/stream/GitHub используют async participant auth. MCP остаётся агентским, webhook — HMAC. Реестр проверяется также внутри транзакции записи после project lock, включая публикацию и регистрацию/отзыв. Открытая SSE-сессия проверяет действительность перед следующими чтениями/снимками. Уже отправленные байты нельзя отозвать.

## Технический Yjs-документ

Черновик закреплён за specId и точной последней immutable baseRevisionId. В нём Y.Text для title/goal/constraints/assumptions/risks/inputs/comment и Y.Array критериев DoD с устойчивым id, Y.Text text и Boolean required. Flow сохраняется из базовой ревизии и в этом пакете доступен только для чтения. Изменение черновика не изменяет активную SpecRevision и не создаёт domain event/Action/DoD/дрейф.

SQL хранит immutable draft anchor и append-only update receipts; mutable head — только техническая проекция полного Yjs state. Update имеет updateId/clientId/bytes; повтор того же ID+hash возвращает исходный resultVersion, другой hash конфликтует. Семантический дубликат не увеличивает эффективную версию, но его receipt допустим. Hash полного encoded Y.Doc учитывает tombstones/delete set, отдельный contentHash вычисляется для видимого RevisionContent. Две параллельные записи объединяются настоящим Yjs под project/draft lock без expectedVersion проекта для клавиатурных updates.

Принимаются только строгие known-key JSON envelopes и корректный base64 Yjs <=128KiB. Временный Y.Doc после update проверяется до сохранения: фиксированные root keys/types, текст <=20000, DoD<=50, полный encoded state<=1MiB. Повреждённый update/unknown root/type replacement/переполнение отклоняются без head/receipt. Пустой/неполный черновик может редактироваться, но publish требует полного RevisionContent с непустыми title/goal/DoD и корректной Flow. Дубли DoD ID публикацию блокируют.

Доступные human endpoints: list/create/read draft, POST updates, POST publish. Обмен accepted head через ограниченный polling сохраняет same-page offline pending updates и переотправляет с теми же ID. Presence необязательна и не создаёт полномочий; UI показывает acknowledged/pending/offline состояния. Browser reload не обещает сохранность неотправленных updates: предупреждение перед уходом, SQL сохраняет все принятые.

## Публикация

Publish требует requestId, expectedVersion проекта, draftVersion, contentHash и baseLatestRevisionId. В одной SQL-транзакции: human active → immutable receipt/hash replay → scope/open head/version/hash → последняя immutable revision той же спеки равна закреплённой основе → обычный proposeRevision → journal/revision/outbox + exact publication receipt + head marker. Нельзя вызывать serialized executeCommand из serialized draft-транзакции: используется общий in-transaction commit helper. Любой отказ откатывает всё. Активация отдельно. Повтор потерянного ответа возвращает ровно тот же revisionId; прежний receipt не переписывается.

Опубликованный черновик read-only. Если вне него предложена r2, исходный shared draft сохраняется, publish блокируется: UI показывает основу и новую последнюю ревизию, предлагает экспорт и создание отдельного нового черновика. Автоматическая смена основы/скрытое слияние immutable ревизий не выполняется.

## Клиент и приёмка

Минимальные insert/delete по общему prefix/suffix вместо полной замены Y.Text. Перед remote apply фокус/selection сохраняются Yjs relative positions и восстанавливаются после React commit. Pending updates имеют стабильные ID между сетевыми повторами. При reconnect сначала merge серверного state, затем retry pending; server snapshots не стирают local edits. Два реальных cookie contexts должны показывать разных людей и создавать различимые actor IDs в публикациях.

AC C01 credentials/cookies/distinct identities/unknown keys/no invalid-cookie fallback. C02 revoke reads/writes/open stream/transaction race. C03 actual concurrent Y.Docs + DoD, SQL reopen, transport and semantic dedupe. C04 malformed/large/type/unknown root rollback; active revision/project cursor unaffected. C05 publish independent project/draft/hash/base guards, receipt and outbox rollback, exact idempotent revision, Flow preserved, no activation. C06 two-browser concurrent text/focus/caret/offline convergence, explicit late-publication conflict. C07 stale base retained/exportable, cross-scope/agent/revoked access rejected. C08 relevant regressions/typecheck/build.

Ориентиры: [Yjs document updates](https://docs.yjs.dev/api/document-updates), [relative positions](https://docs.yjs.dev/api/relative-positions), [shared text](https://docs.yjs.dev/api/shared-types/y.text), [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [Fowler Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html). Во время реализации фиксируется фактическое чтение источников и принятые компромиссы; наличие ссылки не означает полное соответствие стандарту.
