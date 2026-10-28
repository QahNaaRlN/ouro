# Прототип 0.1.0-alpha.1: соответствие ТЗ/ТС

Это историческая матрица базового среза. В `0.1.0-alpha.2` добавлены настоящие MCP HTTP/stdio, отдельные регистрации/ключи и назначение внешних агентов. Актуальный ограниченный пакет: [SDD](specs/agent-connect.md), [инструкция](agent-quickstart.md), [TDD-свидетельства](plans/agent-connect.md). Упоминания отсутствующего MCP ниже описывают именно alpha.1.

Это проверяемый срез, не приёмка полного продукта. Команды запуска — в [README](../README.md).

| Требование | Реализация | Проверка |
|---|---|---|
| Roadmap → Spec → Reality | React Flow DAG / таблица; ожидание и ревизии; журнал и явный причинный граф | Браузер + core |
| Human Question/Fork/Blocker | Доверенный server actor, типизированные outcomes, отдельная отсрочка | core/auth |
| Action — факт без approval | Событие без DecisionRequest | core |
| Решение ≠ исполнение ≠ DoD | Разрешение/ACK, результат, evidence и human acceptance | core + E2E |
| Blocker approve не снимает препятствие | Отдельная remediation и evidence устранения | core/review |
| ID и ревизии | UUID + Human ID, immutable snapshot, activation/supersede | core/review |
| Неизменяемость | SQL triggers на UPDATE/DELETE/TRUNCATE событий/ревизий/receipts | storage |
| Повторы/гонки | Canonical hash, receipt до expectedVersion, project lock | storage |
| Восстановление | Replay и committed cursor; polling 3 секунды, индикация разрыва | storage/браузер |
| DAG | Проверка достижимости до записи, типизированные связи | core |
| Доступность | Таблица, подписи, focus/dialog trap, reduced motion | Частичный браузерный контроль, не WCAG-аудит |
| Литература | Первоисточники, ADR, экран источников | [Исследование](methodology-research.md) |

## Решения и следующие этапы

- Next Route Handlers вместо отдельного tRPC transport; домен отделён от HTTP. Первая версия API ещё не объявлена стабильной.
- Проект — один агрегат с глобальной версией и SQL lock. Это обеспечивает курсор/конкурентную корректность, ограничивая throughput; independent aggregate streams отложены.
- PGlite по умолчанию и `pg` для `DATABASE_URL`; внешний сервер отдельно не проверен. PGlite — один процесс на каталог.
- Истина — события; текущие сущности replay-проекция. Identity/revisions хранятся отдельными append-only таблицами. Полная нормализованная многоарендная схема и checkpoint-проекторы — следующий этап.
- Симулятор не меняет код и не использует LLM. `simulation://` явно обозначает синтетическое evidence.
- Именованные inbox-инструменты — mapping и HTTP endpoint, не MCP Streamable HTTP/session negotiation. Live runner, broker realtime, Meridian SDK/SSO/RBAC не реализованы.
- Один проект и локальный человек. Production tenancy, эксплуатационный аудит и масштабные графы требуют самостоятельной реализации/проверки.

Выпуск release/tag и публичное развёртывание не выполнялись. Исторические ТЗ/ТС сохранены; эта таблица отделяет сделанное от следующих этапов.
