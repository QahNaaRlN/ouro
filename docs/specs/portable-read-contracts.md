# Переносимые типы чтения

Дата: 2026-11-04. Ветка: `codex/portable-read-contracts`. Основание: P1, D11/D14 и запрет browser → server, включая type-only imports.

## Область

Убрать пять точных исключений UI → `lib/projects`, `lib/participant-registry`, `lib/collaborative-drafts`, `lib/store`. Декларации публичных данных получают чистого владельца; серверные модули сохраняют прежние type exports через aliases/re-exports. Новые копии интерфейсов и расширение allowlist не допускаются.

Project access, participant registration и workspace binding/recovery — переносимые wire DTO протокола без исполнения или секретов. Collaborative draft DTO принадлежит чистому пакету collaboration, который уже зависит от `RevisionContent` ядра. SQL query/connection, mailer, password, filesystem probes, cookie и полномочия остаются на сервере. Доменный core не получает зависимость от UI или transport.

Сохраняются все имена/поля/optional/null/union существующих публичных типов, JSON/MCP ответы, схемы, protocol version, роли, права и сериализация. Runtime platform получает чистую union, эквивалентную установленному `NodeJS.Platform`; Node global в browser-контракт не переносится. Это type-only перенос, не внедрение новой проверки входных данных.

## Проверка

1. Пять запрещённых импортов отсутствуют, baseline уменьшается с 16 до 11 точных framework edges; новый импорт server types снова отклоняется существующими отрицательными AST fixtures.
2. Root/web/service строгие типы подтверждают совместимость старых exports и новых потребителей. Pure contracts не импортируют server/browser runtime.
3. Canonical protocol schemas и независимая установка protocol package сохраняют прежний результат. Production Vite build не включает server-only dependencies.
4. Существующие auth/project/collaboration/binding recovery regressions проверяют прежнюю семантику затронутых модулей. Новые тесты, повторяющие aliases, не требуются.

Физический перенос UI в hFSD, новый runtime, pnpm/cutover и полный Tailwind rewrite выполняются отдельными историями. Установочный контракт ZIP не меняется в этом срезе.
