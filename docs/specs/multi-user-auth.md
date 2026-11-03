# OURO-ENG-000014 · Многопользовательские identity и project authorization

> Актуализация03.11.2026. Аккаунты, сессии, приглашения, членство и проверки project authorization реализованы цепочкой `9a2ef60`…`918aadd`; PR20 интегрирован в dev после успешных checks/browser [CI41628008213](https://github.com/QahNaaRlN/ouro/actions/runs/41628008213). Это реализация и контролируемая проверка, не подтверждение работы публичного hosted-сервиса, внешней почты или аккаунтов коллег. Локальная поставка beta.3 проверяется отдельно. Исходная отметка not_started и описание прежней границы ниже сохранены как история принятия требований.

01.11.2026 · статус: **accepted / not_started**. Владелец выбрал email + password для первой многопользовательской версии и утвердил необходимость отдельных учетных записей коллег.

## Цель

Один hosted Ouro обслуживает несколько независимых пользователей и проектов без общей учетной записи. Аутентификация устанавливает человеческую identity; авторизация отдельно проверяет текущее членство и роль в конкретном проекте.

Пакет расширяет [OURO-ENG-000013](multi-project-control-plane.md). До его реализации hosted Ouro остается однопроектным и не предназначен для совместного использования коллегами с разграничением доступа.

## Модель

- `UserAccount`: глобальная человеческая identity с нормализованным email, password credential, статусом email verification и стабильным user ID.
- `ProjectMembership`: связь user ↔ project с ролью Owner, Contributor или Viewer. Пользователь видит проект только при активном членстве.
- `ProjectInvitation`: приглашение на конкретный email, project и роль; одноразовое, с истечением и отзывом.
- `UserSession`: отдельная opaque-сессия с expiration и revocation. Аутентифицированный principal при каждом чтении/записи связывается с актуальными memberships.
- `AgentRegistration` остается отдельным типом identity. Назначение агента в project не создает человеческую учетную запись и не наследует роли человека.

Создатель проекта становится Owner. Owner управляет настройками, участниками, приглашениями и agent registrations. Contributor работает со спецификациями, назначениями, решениями и приёмкой. Viewer получает read-only доступ. Последнего активного Owner нельзя удалить или понизить без передачи владения.

## Контракт аутентификации

1. Публичная самостоятельная регистрация отсутствует. Начальный Owner создается доверенной bootstrap-операцией; остальные пользователи появляются через приглашение.
2. Приглашение нового пользователя ведет на установку пароля и подтверждение email. Существующий пользователь с подтвержденным email принимает приглашение после входа. Роль и проект определяются серверным invitation, а не телом запроса.
3. Пароли хранятся только как versioned Argon2id hashes с уникальной солью. Пароль, invitation token, session token и reset token не попадают в Git, журналы, URL, project events или ответы API.
4. SMTP используется для verification, приглашений и password reset. Секреты SMTP задаются только серверным окружением/secret file. Ошибка доставки не создает видимую активную membership до завершения требуемой verification.
5. Сессии используют случайные opaque tokens, серверное хранение hash, HttpOnly + Secure + SameSite=Strict cookies и точный `OURO_PUBLIC_URL`. Login/reset меняет session token; password reset и отзыв пользователя закрывают его существующие сессии.
6. Mutations сохраняют существующие Host/Origin/CSRF-защиты. Login, invitation и password reset имеют rate limits и одинаковые внешние ответы, не раскрывающие наличие аккаунта.
7. Audit/event provenance содержит реальный user ID и project ID. Два человека не могут получить общий actor; participant key не является многопользовательским решением.

## Контракт авторизации

1. Каждый project API, command, SSE snapshot/reconnect и read model проверяет активное membership и требуемую роль на сервере. Скрытие кнопки не считается проверкой.
2. Запись повторно проверяет principal и membership в той же транзакции, которая изменяет состояние. Отзыв membership/понижение роли действует на последующие запросы и SSE re-authentication без restart.
3. Все project-owned строки и foreign keys сохраняют project scope. Нельзя использовать чужие execution, event, source, proposal, receipt, draft или GitHub binding через подмену ID.
4. Agent MCP использует отдельные scoped assignments и не получает human session, membership или право управления участниками. Human bearer/cookie не становится agent credential.
5. Instance operator управляет инфраструктурой и bootstrap, но не получает неявный доступ к содержимому всех проектов как domain Owner.
6. Изменение ролей и членства создает проверяемые administrative facts с actor/project/target. Последний Owner защищен серверным guard.

## Миграция существующего состояния

Текущий проект получает явно выбранного начального Owner. Существующие participant records не превращаются автоматически в несколько email identities: соответствие задает оператор, неизвестные записи сохраняются как historical actors без нового доступа. Старые agent registrations, events, receipts и hashes сохраняются.

До успешного migration/replay и authorization gate передача hosted-доступа коллегам откладывается.

## Критерии приёмки

| ID | Наблюдаемое поведение | Исполняемая проверка |
|---|---|---|
| AA01 | Два пользователя имеют независимые verified accounts и сессии; действия различаются по user ID | auth integration |
| AA02 | Приглашение одноразовое, project/role-scoped, истекает и отзывается; публичной регистрации нет | invitation integration |
| AA03 | Пароль/session/reset/invite tokens отсутствуют в ответах, журналах и project history | security tests + log capture |
| AA04 | Owner/Contributor/Viewer соблюдают permission matrix на UI и серверных API | role matrix integration |
| AA05 | Без membership project list/API/SSE возвращают отказ без содержимого проекта | cross-user isolation |
| AA06 | Отзыв membership и password reset немедленно закрывают доступ; захваченный principal не сохраняет полномочия | revocation + SQL reopen |
| AA07 | Подмена projectId, actor, role, invitation или foreign source не меняет историю | negative integration |
| AA08 | Последний Owner не может быть удален/понижен без передачи владения | domain guard |
| AA09 | Agent assignment сохраняет прежние scoped MCP-полномочия и не получает human authority | MCP SDK isolation |
| AA10 | Password reset, login и invitation ограничены rate limits и не раскрывают account existence | HTTP security integration |
| AA11 | Миграция текущего проекта сохраняет replay, receipts, hashes и historical actors | migration rehearsal |
| AA12 | Существующие unit/integration, typecheck, build и E2E остаются зелеными | regression gate |

## Этапы

1. UserAccount, password credentials, verified email и opaque sessions.
2. Invitations, SMTP, reset и security/rate-limit boundaries.
3. ProjectMembership, role guards и миграция текущего Owner.
4. Project-scoped API/SSE/MCP checks, revocation, migration rehearsal и full E2E.
