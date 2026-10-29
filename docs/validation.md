# Проверка прототипа

Текущий интегрированный срез — **`0.1.0-alpha.13`**, предметный контракт **`@ouro/protocol@0.1.1`**. Функциональный код `a32e92d`, финальная мобильная правка `8e3e3c0`: **300/300 unit/integration, 65/65 production E2E**, typecheck, production build, 41 canonical JSON Schema и самостоятельная установка пакета **1/1** успешны. Browser gate: 0 unexpected/flaky/skipped; отдельная новая БД и порт 3354, около 2 мин 40 сек. Все шесть новых браузерных сценариев входят в 65. [SDD/RED/GREEN, источники и точные границы](plans/flow-runtime.md), [инструкция проходов](flow-runtime-guide.md), [отдельная установка](../packages/protocol/README.md).

Проверены порядок и права переходов, циклы с разными runId, human decisions/apply/resume ACK, late Action, retry/skip, interrupts, неизменность старых snapshots/receipts, SQL race/reopen, HTTP/stdio и неизвестный исход после commit. Browser восстанавливает потерянный human skip после навигации точным повтором без второго перехода. Самостоятельный consumer использует ESM/CommonJS, types и CLI; runtime npm tree содержит только protocol и Zod, права дистрибутива 0644/0755.

Финальный просмотр на 390 px выявил сжатую колонку, несмотря на отсутствие page overflow. После исправления повторены build и **весь** production gate. Мобильный regression проверяет читаемую колонку, локальную прокрутку клавиатурой и открытие инспектора; отдельный strict smoke — 200 px title column, 0 page errors/overflow, cursor 59→59. Техническая HTTP fixture создала шесть проходов и четыре перехода, сохранила ошибку второго посещения и оставила DoD непринятым. Это техническая приёмка API/UI, не реальное LLM-исполнение или native Meridian acceptance.

## Предыдущий интегрированный gate alpha.12

Срез **`0.1.0-alpha.12`**, предметный контракт **`@ouro/protocol@0.1.0`**, код `dc0676e`: **266/266 unit/integration, 59/59 production E2E**, typecheck, production build и `protocol:check` для 34 canonical JSON-схем успешны. Отдельная приёмка самостоятельного пакета — **1/1**: копия исходников со своим `npm ci` → обычный `npm pack` → установка в пустой consumer, ESM/CommonJS, TypeScript declarations и CLI; runtime-дерево содержит только protocol и Zod. Проверены читаемые файловые права 0644 и исполняемый CLI 0755. [SDD/RED/GREEN и доказательства этого среза](plans/domain-contract.md).

Полный production Playwright: 59 expected, 0 unexpected/flaky/skipped, около 2 мин. Реальный Next HTTP + официальный SDK подтвердили 15 tools и 15 output schemas с двумя ветвями, конкретный Flow, оба статических ресурса и bundle из 34 схем версии 0.1.0. Обычный FORBIDDEN-ответ принят клиентом после `tools/list`. Browser smoke на 390 px в светлой теме: 0 page errors, без горизонтального overflow, SSE подключён, cursor 35→35. Это standalone Ouro-проверка, не native Meridian acceptance.

## Предыдущие gates

Исправление перехода из дорожной карты в процесс: **2/2 новых и 10/10 затронутых прежних browser-сценариев**, typecheck и production build успешны. Клик/Enter/пробел открывают точную активную ревизию, отсутствие flow показано явно; навигация не меняет историю. [SDD/RED/GREEN и границы проверки](plans/roadmap-process-navigation.md).

Gate подготовки локальной сборки `0.1.0-alpha.11` до этого UI-fix: **247/247 unit/integration и 57/57 dev E2E**, typecheck, DB-check и production build успешны. Чистый клон с GitHub проверен через dev → остановка → build/start с сохранением точной записи и без ошибок браузера. [SDD/RED/GREEN и подробности локального пакета](plans/local-start.md).

Предшествующий общий gate `0.1.0-alpha.11`: 245/245 unit/integration, 57/57 production E2E, typecheck и production build успешны. Трассировка SDD/RED/GREEN и границы каждого пакета: [alpha.2 MCP](plans/agent-connect.md#итоговая-проверка-28102026), [alpha.3 Flow](plans/flow-visualization.md), [alpha.4 realtime](plans/live-updates.md), [alpha.5 GitHub](plans/github-evidence.md), [alpha.6 уроки](plans/lessons.md), [alpha.7 показатели](plans/drift-metric.md), [alpha.8 история и восстановление](plans/methodology-recovery.md), [alpha.9 совместные черновики и участники](plans/collaborative-drafts.md), [alpha.10 предложения агента](plans/agent-proposals.md), [alpha.11 Meridian import](plans/meridian-context.md).

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
