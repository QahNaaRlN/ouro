# OURO-ENG-000013 · Ouro как multiproject control plane

01.11.2026 · статус: **accepted / not_started**. Владелец выбрал целевую модель «один Ouro, много проектов» после обсуждения агентской работы и realtime.

## Цель

Ouro является универсальным control plane агентской разработки для любых проектов. Grace — один из подключаемых проектов; домен Ouro, API, хранение и интерфейс не содержат Grace-специфичных правил.

Один hosted Ouro предоставляет общий dashboard, реестр участников и реестр агентов. Спецификации, назначения, события и доказательства изолируются по проекту.

Человеческие identity, вход по email + password, приглашения и роли определяются принятым пакетом [OURO-ENG-000014](multi-user-auth.md). Общий экземпляр не означает общую учетную запись.

## Целевой контур

1. `Project` — первоклассная сущность с собственными roadmap, спецификациями, ревизиями, исполнениями, черновиками, уроками, GitHub bindings и историей.
2. Участники и логические агенты имеют стабильные identity в общем реестре. Членство человека и назначение агента определяют доступ к конкретному проекту; регистрация сама по себе не раскрывает проектные данные.
3. Агенты подключаются через scoped MCP. Они читают только назначенные исполнения, подтверждают lifecycle, сообщают структурированные факты/вопросы/результаты и предлагают source-backed изменения. Проект и ревизия связываются сервером с назначением; клиентский `actor` или `projectId` не повышает полномочия.
4. Человек сохраняет отдельные полномочия на создание/активацию ожиданий, назначение работы, разрешение запросов и приёмку DoD. Произвольный CRUD и прямой доступ агента к PostgreSQL не добавляются.
5. Все проектные записи, foreign keys, команды, receipts и read-модели имеют проверяемую project scope. Источники, evidence, proposal и событие одного проекта не могут быть присоединены к другому.
6. У каждого проекта независимые version/cursor и авторитетная append-only история. Idempotency и optimistic concurrency не допускают коллизий между проектами.
7. Human View имеет явный выбор проекта. SSE доставляет committed snapshots только выбранного доступного проекта с монотонным cursor и существующим recovery; полный multiproject snapshot агенту или браузеру не требуется. WebSocket для статусных обновлений не вводится.
8. PostgreSQL остается источником истины. Один экземпляр Node.js и одна БД допустимы при соблюдении project isolation; публичная регистрация, внешний SSO и multi-tenancy с изоляцией организаций остаются отдельными решениями.
9. Grace и другие репозитории являются внешними целями работы. Ouro не получает доступ к их производственным БД и не становится зависимостью их runtime.

## Миграция текущего однопроектного состояния

Существующий проект становится первой записью реестра. Сохраняются ID, event versions, revision hashes, command receipts, participant/agent registrations и вся история. До завершения отдельного migration/replay gate текущий hosted Ouro остается однопроектным по OURO-ENG-000012.

Новая модель не задерживает текущий private hosting cutover и не разрешает частичный перевод production без проверок изоляции.

## Критерии приёмки

| ID | Наблюдаемое поведение | Исполняемая проверка |
|---|---|---|
| MP01 | Можно создать два проекта с независимыми roadmap, cursor и историей | domain + SQL integration |
| MP02 | Один агент может иметь назначения в двух проектах; каждое чтение/запись остается в scope назначения | MCP SDK isolation |
| MP03 | Чужие projectId, executionId, source/event ID и receipts отклоняются без утечки содержимого | negative integration |
| MP04 | Одинаковые requestId в разных проектах не конфликтуют; повтор внутри проекта сохраняет исходный receipt | idempotency integration |
| MP05 | UI переключает проекты; SSE/reconnect не смешивает snapshots и cursor | browser + stream integration |
| MP06 | GitHub bindings, drafts, lessons, proposals и metric scope изолированы по проекту | feature integration |
| MP07 | Перенос существующего проекта сохраняет replay, hashes, registrations и receipts | migration rehearsal |
| MP08 | Существующие unit/integration, typecheck, build и E2E остаются зелеными | regression gate |

## Этапы

1. Project registry, membership и миграция текущего состояния.
2. Project-scoped core commands, receipts, history и PostgreSQL constraints.
3. MCP/UI/SSE/GitHub isolation и project selector.
4. Migration rehearsal, multiproject E2E и regression gate.
