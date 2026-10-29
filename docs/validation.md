# Проверка прототипа

Текущий интегрированный срез — **`0.1.0-alpha.15`**, код `398d5db`: **344/344 unit/integration, 71/71 production E2E**, typecheck, production build и проверка49 canonical схем GREEN. Финальный Playwright gate:0 unexpected/flaky/skipped, workers1/retries0, новая БД и порт3357,176.46s. Новые2 client-onboarding сценария и все прежние69 выполнены вместе. Протокол остаётся `@ouro/protocol@0.1.2`,18 tools/49 схем; отдельная установка пакета не менялась и принята предыдущим gate. [Инструкция клиентов](agent-clients-guide.md), [SDD/RED/GREEN и реальный Claude Code](plans/client-onboarding.md).

Cursor/Claude Code/Desktop профили проверены по официальным документам и реальным SDK stdio subprocess: генератор выдал разные profile entry, по ним запущен bridge, прочитаны18 tools/resources, назначенный контекст и файл с hash, записан настоящий ACK тремя разными регистрациями. Browser проверил client selection, сохранение custom name, copy/download без token, экспорт после скрытия ключа без новой регистрации, invalid-path guards, A/B scope и mobile390 без overflow. CLI печатает wrapper либо single entry и не редактирует клиентские файлы.

Отдельно **настоящий официальный Claude Code2.1.312** получил сгенерированную entry в изолированном `CLAUDE_CONFIG_DIR`: `mcp list/get` показали Connected и presence в Ouro; чужой project URL и отозванный ключ дали семантический отказ. Аккаунт/login/LLM не использовались, пользовательские настройки не менялись. Cursor и Claude Desktop GUI/native OS отдельно не проверялись. [Точные этапы и ограничения](plans/client-onboarding.md#реальная-проверка-claude-code).

## Предыдущий интегрированный gate alpha.14

Срез **`0.1.0-alpha.14`**, предметный контракт **`@ouro/protocol@0.1.2`**. Функциональный код `f11d62e`, финальные browser checks `f0ab12a`: **336/336 unit/integration, 69/69 production E2E**, typecheck, production build, DB-check, 49 canonical JSON Schema и самостоятельная установка пакета **1/1** успешны. Финальный Playwright gate: 0 unexpected/flaky/skipped, workers1/retries0, отдельная новая БД и порт3355,180.35s. Все четыре новых browser-сценария входят в69. [SDD/RED/GREEN](plans/project-workspace.md), [дашборд и запуск](project-workspace-guide.md), [общий MCP-контракт](protocol-guide.md), [отдельная установка](../packages/protocol/README.md).

Реальный MCP SDK через scoped HTTP и stdio проверил контекст/файлы/ACK/вопрос/решение/применение/resume/результат. Browser подтвердил обновление одного документа без reload, A/B snapshot/SSE/key isolation, точное восстановление потерянного committed старта после A→B→A и сохранение исходных URL/actor/body/version/requestId. Стандартное source-backed предложение с Flow стало редактируемым человеческим draft, затем отдельно активировано и назначено в strict-режиме; подтверждены развилка, человеческий шаг с точным runId, переходы и итог без автоматической приёмки DoD. Desktop/mobile390, keyboard и отсутствие page overflow входят в проверки.

Независимое ревью и детерминированные regressions подтвердили missing/replaced-root guards, FIFO/hardlink/symlink boundaries, отказ при перемещении открытого подкаталога, сохранение legacy hashes/receipts, durable reopen и общий SQL owner. Пакет `.tgz` проверен в независимом consumer: ESM/CommonJS, types, CLI, schemas и runtime tree только protocol+Zod. В `artifacts/` собран `ouro-protocol-0.1.2.tgz`; registry-публикация не выполнялась. Реального ChatGPT account/tunnel подключения, native Meridian, Windows/macOS или внешнего PostgreSQL acceptance эти SDK/браузерные проверки не заменяют.

## Предыдущий интегрированный gate alpha.13

Срез **`0.1.0-alpha.13`**, предметный контракт **`@ouro/protocol@0.1.1`**. Функциональный код `a32e92d`, финальная мобильная правка `8e3e3c0`: **300/300 unit/integration, 65/65 production E2E**, typecheck, production build, 41 canonical JSON Schema и самостоятельная установка пакета **1/1** успешны. Browser gate: 0 unexpected/flaky/skipped; отдельная новая БД и порт 3354, около 2 мин 40 сек. Все шесть новых браузерных сценариев входят в 65. [SDD/RED/GREEN, источники и точные границы](plans/flow-runtime.md), [инструкция проходов](flow-runtime-guide.md), [отдельная установка](../packages/protocol/README.md).

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
