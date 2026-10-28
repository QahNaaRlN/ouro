# OURO-ENG-000010 · Контекст Meridian → черновик Ouro

2026-10-28 UTC · SDD до кода. Пакет завершает доступную Ouro-сторону дорожной карты. Основание — реальные контракты desktop Meridian в snapshot `1d3a9f80b196498b5fe2d8a1357f2aaef2aa9c76`; нативный мост и SSO не считаются существующими.

## Результат и полномочия

Человек импортирует JSON `meridian-work-scope-view/v1`, видит выбранный workspace, repository, run и неизменяемые pins, проверяет источники и редактирует ожидание. Явная команда создаёт только черновик Spec с исходным документом и provenance. Активация, назначение и приёмка остаются отдельными командами Ouro. Импорт не разрешает host writer, не читает объявленные пути и не выполняет required_verification из документа.

Формат проверяется полностью, включая неизвестные поля, byte caps, u64-ревизии, согласованность subject/run/spec/context pins и безопасные относительные пути. `internal_pins:'verified'` сохраняется как утверждение исходного документа. Независимый статус импорта всегда `unverified_import`: совпадение схемы не доказывает подлинность документа или состояние настоящей БД Meridian.

## Контракт

- Чистый browser/server parser ограничивает исходные UTF-8 JSON bytes 512KiB, использует закрытый DTO с фактическими константами `ordinary_writer:false`, `actions_authorized:false`, `coverage` и `declared_scope.authority`. Проверяет вложенные IDs, scope, SHA256, positive u64 strings, caps и уникальность списков. Ошибка не делает fallback к частичному объекту.
- Начальный bounded пакет принимает scope snapshot; project session не обязателен и не подменяется придуманной активной сессией. Workspace/provider/project/repository берутся из проверенного snapshot и показываются человеку.
- Сервер повторно проверяет полный документ и вычисляет SHA256 исходных UTF-8 bytes. Только специальный human import endpoint может добавить доверенные серверные метаданные; обычная generic command не принимает forged origin/digest.
- Сохраняется неизменяемое происхождение новой Spec: kind meridian_import, contract/version, snapshot ID, document SHA256, project/repository/provider/workspace, subject/run/spec/context pins, transportVerification unverified_import. Полный исходный JSON сохраняется в append-only факте; digest можно воспроизвести.
- Контент черновика включает goal, initial/target context, constraints, required DoD с verification и исходными external criterion IDs в provenance. Mapping виден до записи; человек может изменить поля без подмены исходного документа. Непригодный для Spec контент явно отклоняется, не обрезается молча.
- Устойчивые requestId/body сохраняются при потере ответа. Receipt идёт до expectedVersion, SQL append/revision/outbox/receipt атомарны. Успех выбирает точный SpecCreated ID из receipt.
- Статические токены light/dark сверяются с реальным workbench-tokens.css; адаптер принимает только enum темы. Standalone использует явный выбор пользователя. Автоматическая синхронизация с несуществующим host connection не заявляется.

## Приёмка/TDD

1. Синтетический fixture, восстановленный из реальных host tests, проходит parser. Неизвестные вложенные поля, writable flags/version, UTF-8 overflow, control chars, u64 overflow и несогласованные pins отклоняются. Fixture явно не является live capture.
2. Путь остаётся данными: alias/dot segments/reserved names и duplicates отвергаются; никакого fs/network/eval по импортированному документу.
3. Human-only endpoint, agent denial, forged generic command/digest, current participant revocation проверяются на настоящем store. Импорт даёт idea без activeRevision/execution/DoD.
4. SQL reopen сохраняет source bytes/hash/provenance. Outbox failure откатывает черновик и receipt. Повтор после последующих команд возвращает тот же ID.
5. Browser file→preview→редактирование→черновик; invalid file не меняет cursor; lost response не создаёт дубликат; source pins и статус unverified видны в Spec. Light/mobile и существующие регрессии.
6. Нативная интеграция имеет отдельный конкретный RFC с Windows/WebView2 приёмкой. Node parser tests не считаются проверкой Tauri IPC/SSO.

## Прочитанные источники

- [WorkScope DTO/validators](https://github.com/QahNaaRlN/meridian/blob/1d3a9f80b196498b5fe2d8a1357f2aaef2aa9c76/meridian-desktop/ui/src/api/work-scope.ts) и [host tests](https://github.com/QahNaaRlN/meridian/blob/1d3a9f80b196498b5fe2d8a1357f2aaef2aa9c76/meridian-desktop/ui/src/api/work-scope.test.ts).
- [Project session](https://github.com/QahNaaRlN/meridian/blob/1d3a9f80b196498b5fe2d8a1357f2aaef2aa9c76/meridian-desktop/ui/src/api/project-session.ts), [native IPC](https://github.com/QahNaaRlN/meridian/blob/1d3a9f80b196498b5fe2d8a1357f2aaef2aa9c76/meridian-desktop/src/native.rs), [CSP](https://github.com/QahNaaRlN/meridian/blob/1d3a9f80b196498b5fe2d8a1357f2aaef2aa9c76/meridian-desktop/tauri.conf.json).
- [Theme tokens](https://github.com/QahNaaRlN/meridian/blob/1d3a9f80b196498b5fe2d8a1357f2aaef2aa9c76/meridian-desktop/ui/src/views/project-workbench/workbench-tokens.css), [capability](https://github.com/QahNaaRlN/meridian/blob/1d3a9f80b196498b5fe2d8a1357f2aaef2aa9c76/meridian-desktop/capabilities/owner-panel-read.json).
- [Team identity: not_started](https://github.com/QahNaaRlN/meridian/blob/1d3a9f80b196498b5fe2d8a1357f2aaef2aa9c76/governance/specifications/haee/team-identity-and-access.md). Внешняя identity не выдумывается.
