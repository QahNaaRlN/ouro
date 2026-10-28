# Проверка прототипа · 28.10.2026

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
