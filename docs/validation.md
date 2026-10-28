# Проверка прототипа

Текущий интегрированный срез `0.1.0-alpha.11`: 245/245 unit/integration, 57/57 production E2E, typecheck и production build успешны. Трассировка SDD/RED/GREEN и границы каждого пакета: [alpha.2 MCP](plans/agent-connect.md#итоговая-проверка-28102026), [alpha.3 Flow](plans/flow-visualization.md), [alpha.4 realtime](plans/live-updates.md), [alpha.5 GitHub](plans/github-evidence.md), [alpha.6 уроки](plans/lessons.md), [alpha.7 показатели](plans/drift-metric.md), [alpha.8 история и восстановление](plans/methodology-recovery.md), [alpha.9 совместные черновики и участники](plans/collaborative-drafts.md), [alpha.10 предложения агента](plans/agent-proposals.md), [alpha.11 Meridian import](plans/meridian-context.md).

Далее сохранён исторический отчёт `0.1.0-alpha.1` от 28.10.2026. Его версии зависимостей, результаты 24/24 и 4/4, а также ограничения относятся к исходному срезу и не заменяют последующие журналы.

Проверено на Node.js 24.19.0, Next.js 16.4.3, React 19.3.1, PGlite 0.3.16 / PostgreSQL 17.5, системном Chromium.

| Проверка | Результат |
|---|---|
| `npm run typecheck` | Успешно |
| `npm test` | 24/24: домен, auth, независимые регрессии, настоящее SQL-хранение |
| `npm run db:check` | Миграция, replay, запреты UPDATE/DELETE/TRUNCATE |
| `npm run test:e2e` | 4/4 Playwright: граф/таблица/тема/mobile; полный human→Question→DoD; HTTP-конфликты/cursor; Blocker/remediation |
| `npm run build` | Успешная production-сборка |
| Production browser smoke | Нет JS page errors; 6 roadmap-узлов; 35 событий/11 явных причинных связей; экран источников |
| `git diff --check` | Успешно |

SQL-тесты проверяют durable reopen, canonical idempotency, повтор после последующих записей, конфликт изменённого тела, гонку двух команд, rollback при сбое outbox и неизменяемость. Домен проверяет обязательное human decision, несколько блокировок, старые ревизии, late Action, приёмку по каждому DoD, supersede и guards remediation.

Не проверялись: внешний PostgreSQL, screen reader и полный WCAG-аудит, большие графы, production SSO/RBAC/tenancy, реальный внешний runner, полный MCP transport, контракт встраивания Meridian. Эти ограничения не маскируются учебными `simulation://` результатами.
