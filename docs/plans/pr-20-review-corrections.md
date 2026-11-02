# PR #20 · журнал исправлений ревью

02.11.2026 · база `438f86b8fc05dcbec22cc6ebdbaf2ab293078da8`, ветка `fix/pr-20-review`, дерево `D:\PersonalProjects\ouro-worktrees\pr-20-fixes`. [Критерии](../specs/pr-20-review-corrections.md).

**R01–R08 реализованы и проверены в указанной ниже области.** Пользователь принял семь дефектов и условный риск доверия XFF. Версии приложения и протокола не повышались. Ниже зафиксирована локальная квалификация перед отправкой исправлений в PR #20. Push разрешён отдельным прямым поручением пользователя 02.11.2026; merge и release не выполняются. Прежние checkout и пользовательские БД сохранены.

## RED → GREEN

| Критерии | Реальный RED до исправления | Реализация и GREEN |
|---|---|---|
| R01 | Браузер в двух вкладках получил 200 на запись, но ответ содержал project B вместо показанного A. | Пин проекта живёт в browser page, не в общем cookie. Все legacy project fetch используют явный header, SSE — query; Request/body/signal/author/requestId сохраняются. [Новый E2E](../../e2e/project-tab-isolation.spec.ts) 1/1 и [проверка HTTP-семантики](../../tests/client-project.test.ts) 1/1. |
| R02 | Legacy operator читал hosted-проект без membership. | Owner shortcut ограничен demo/local-folder; hosted требует членства. Проверены запрет чтения/записи и прежний local-folder сценарий. |
| R03 | Создание регистрации через настоящий agents API выдавало URL с 404. | Scoped MCP route разрешает любой существующий проект через forProject, сохраняя auth и folder binding. [HTTP/stdio SDK регрессии](../../tests/hosted-mcp-regression.test.ts) 2/2: чужой/неизвестный проект, отзыв ключа, legacy/folder совместимость. |
| R04 | Повторное принятие приглашения возвращало ALREADY_MEMBER. При расширении регрессии обнаружен ещё один RED: старый pending code мог восстановить доступ после отзыва. | Новый grant сохраняет прежние факты; [migration 009](../../db/migrations/009_membership_regrants.sql) поддерживает уникальную активную проекцию и погашает старые приглашения. Три цикла, конкурентные accept, DB duplicate guard, old 001–008 upgrade/reopen и неизменность истории проверены. |
| R05 | Последний действующий Owner мог понизить себя при наличии отключённого второго Owner. | Подсчёт учитывает account revocation; демотирование и отзыв последнего действующего Owner отклоняются. [R04/R05 SQL tests](../../tests/project-review-regressions.test.ts) 4/4. |
| R06 | После истечения первого окна проходило 15 reset-запросов подряд при лимите 5. | Просроченный bucket заменяется новым; проверены три окна reset и invitation. |
| R07 | Код A принимался после успешного reset через B; неизвестный код запускал Argon2. | Выдача и использование кода сериализованы account row lock; все прежние коды/сессии погашаются атомарно. Предварительная и финальная проверки, новый код после reset и принудительный rollback проверены. [Access/recovery tests](../../tests/access-recovery-regressions.test.ts) 4/4. |
| R08 | Разные XFF обходили login, reset request и reset confirm: 0/3 регрессий прошли до изменения. | HTTP больше не использует XFF как authority для лимита. Login/reset request ограничены по нормализованному email, confirm — по hash кода и действующему аккаунту. Независимый второй аккаунт и одинаковые ответы для отсутствующего аккаунта сохранены. [HTTP tests](../../tests/auth-proxy-regressions.test.ts) 3/3. |

Первоначальные targeted проверки выполнялись на Node 24.22.1. Общий итог ниже получен на **точном Node 24.19.0 / npm 11.17.0**, Windows, Chromium 156.0.8078.4. Официальный Node ZIP сохранён только в ignored `.ouro/fix-20/runtime`, SHA-256 проверен по официальному SHASUMS256. Глобальная установка Node не менялась.

Лимит одного аккаунта теперь общий для его устройств; разные аккаунты не смешиваются. Достоверность proxy headers не предполагается. Существующие optional rateKey arguments оставлены для совместимости, но больше не меняют ключ лимита.

## Итоговые проверки

| Проверка | Результат |
|---|---|
| Полный unit/integration | **397 total: 391 PASS, 0 FAIL, 6 platform SKIP**, 341.279 с. Новые регрессии без пропусков; новых skip не добавлено. |
| Полный production E2E | **84/84 PASS**, 0 unexpected/flaky/skipped, один worker, retries 0; около 4.6 мин, отдельная БД и порт 3376. |
| TypeScript | PASS после уточнения SDK output types в новом тесте; последующая production-сборка также выполнила typecheck. |
| Production build | PASS, обычный runtime без test-only Wasm flag. |
| DB-check | PASS: migrations, append-only guards, durable replay 35 событий. Дополнительно новая миграция проверена на историческом fixture и повторном открытии. |
| Canonical protocol schemas | **49/49 PASS**, protocol 0.1.2. |
| Repository conventions | PASS, ветка `fix/pr-20-review`. |
| Локальные ссылки / git diff --check | PASS. |
| Самостоятельная установка protocol package | **FAIL на native Windows до consumer install**: архивный bin mode 0644 вместо ожидаемого 0755. Та же ошибка подтверждена на исходном head с теми же Node/npm; source протокола, упаковщик и сам тест этим пакетом не менялись. |

Общий release gate **не объявляется полностью GREEN** из-за последней строки и платформенных пропусков. В consumer-тесте не выполнены последующие ESM/CommonJS/types/CLI assertions: ранний отказ прав доступа нельзя считать их проверкой. Прежний Linux CI head `438f86b` consumer 1/1 — исторический результат, а не новое подтверждение исправлений. Повтор этого неизменённого packaging gate на POSIX/Linux остаётся открытым; локальный WSL недоступен и не перенастраивался. [Ограничение Windows chmod](https://nodejs.org/docs/latest-v24.x/api/fs.html#fschmodpath-mode-callback).

Первый общий unit-прогон завершился 384 PASS / 7 FAIL / 6 SKIP. Разобраны и исправлены тестовые предпосылки: два ожидания миграций теперь включают 009; сценарий проверки симулятора использует настоящего Owner вместо прежнего обхода membership; три directory alias на Windows используют реальные junction без новых skip. Для packaging tests в PATH подключён уже установленный Git unzip. После этого полный набор повторён с результатом выше. Неуспешные промежуточные прогоны не считаются GREEN.

## Миграция и границы

Миграция 009 не переписывает grants, revocations, role changes или domain history. Старый UNIQUE(project,user) заменён уникальностью активной derived projection; исторические grants остаются раздельными. Принятие и отзыв используют порядок блокировок project → invitation, старые pending приглашения погашаются отдельными фактами. Проверены file-backed PGlite, повторные/конкурентные вызовы сервиса и SQL uniqueness. Настоящий параллельный multi-process внешний PostgreSQL здесь не квалифицировался.

Независимые чтения клиентского scope helper, reset/authorization и MCP изменений не выявили оставшихся блокеров принятого ревью. Автоматически сгенерированные protocol files возвращены к исходному содержанию, схемы и версия не менялись. Браузерный сервер принадлежал только проверке; пользовательские установки, реальные SMTP, credentials и production данные не использовались.

Локальные журналы: `.ouro/fix-20/r01-red.log`, `r01-green.log`, `r03-red.log`, `r03-green.log`, `membership-red.log`, `membership-stale-red.log`, `membership-green.log`, `access-recovery-red.log`, `access-recovery-green.log`, `r08-red.log`, `unit-node24.19.log`, `unit-final-node24.19.log`, `build-node24.19.log`, `production-browser-node24.19.log`, `protocol-check-node24.19.log`, `protocol-consumer-node24.19.log`. Baseline consumer failure сохранён в соседнем review worktree: `.ouro/review-20/protocol-baseline-node24.19.log`.
