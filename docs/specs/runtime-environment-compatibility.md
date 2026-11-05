# REC — совместимость root environment files без Next runtime

Дата: 2026-11-04. Ветка `codex/runtime-environment-compatibility`, base `16943f52d03ad496c3e56ff1233be3f589c0d55d`. Статус: **DESIGN_ACCEPTED / IMPLEMENTED_LOCAL / TARGETED_QUALIFICATION**. Root принял SDD до source и выполнил source peer review до commit. [Журнал и точные результаты](../plans/runtime-environment-compatibility.md).

## Проблема и конечный контракт

README поддерживает optional настройки через установленную root `.env.local`. Old Next16.4.3 загружает root env files перед application/config imports; standalone service получает только process env. Удаление Next не должно молча удалять эту возможность. Узкий bootstrap adapter сохраняет подтверждённые parsing/load-order/expansion semantics, не вводит новую конфигурационную систему и не зависит в runtime от Next/`@next/env`.

Публичный bootstrap helper принимает только явный absolute installed root и явную production/development phase. Он изменяет environment текущего дочернего bootstrap процесса перед application imports и возвращает только безопасные filenames/diagnostics, без contents/values. Ранний Node24 gate выполняется **до** read/stat env files, parser dependency import и profile/runtime imports. Сам import helper не читает файлы. Все tests используют собственные synthetic directories и ограниченный process environment.

REC не меняет старые local-next/hosted-next/launch/packer, текущий production entry или DB/runtime config. Подключение к самостоятельному consumer build/start принадлежит SWD2. REC не читает реальный root `.env*` во время tests, не ищет parent/home/cwd файлы, не выводит values/raw lines, не экспортирует env в browser и не трогает global config. `.env.example` остаётся единственным допустимым env-подобным source файлом producer.

## Прочитанные первичные основания

| Источник | Наблюдение |
|---|---|
| Installed `next/dist/docs/01-app/02-guides/environment-variables.md`16.4.3 | Root files, process env first, production/development/test modes, expansion `$NAME` и escaped `\$`. |
| Installed `@next/env/dist/index.js` и package.json16.4.3 | Реальные parser engines: dotenv16.3.1 + dotenv-expand10.0.0; production choice зависит от phase, special test зависит от NODE_ENV. |
| Installed `next/dist/bin/next` и `next/dist/server/lib/start-server.js:280` | Build/start ставят NODE_ENV=production только если inherited значение пусто; inherited непустое сохраняется. Port options выбираются до env file loading; server записывает выбранный listener port в process.env.PORT до config/env imports. |
| Installed `next/dist/server/config.js` | loadEnvConfig вызывается до next config/application loading, development flag только для PHASE_DEVELOPMENT_SERVER. |
| `scripts/local-next.mjs` | OURO_LOCAL_DEMO=1 выставляется до imports и имеет process precedence над files. |
| `scripts/hosted-next.mjs` | Hosted validation читает process env **до** files; затем явно production/cloud/localDemo=0. Env file не может задним числом удовлетворить этот предварительный guard. |
| `scripts/launch.mjs` и README | ci+build+start — отдельные процессы root cwd; `.env.local` документирована. Build env не передаётся обратно в parent/start автоматически. |

## Матрица точной совместимости

Для production build/start с unset/пустым NODE_ENV child сначала получает production. Если inherited NODE_ENV=development, значение сохраняется, но phase production всё равно читает production files. При NODE_ENV=test выбирается test независимо от phase. Development phase нужна только как совместимый явный helper mode; миграция dev launcher не является текущим scope.

Порядок: существующие process keys (включая пустую строку) → `.env.MODE.local` → `.env.local` кроме MODE=test → `.env.MODE` → `.env`. Только эти имена в переданном установленном root; вложенный `src`, cwd, parent/home не проверяются. Дубли в одном файле, quotes/comments/CRLF/multiline, пустые values, `$NAME`, `${NAME}`, `${NAME:-fallback}`, escaped dollars и cross-file references сопоставляются actual old loader в новых subprocesses. Особые quirks inherited empty references не исправляются без доказательства изменения контракта. В dotenv-expand10 inherited value с `$` также раскрывается, если соответствующий key присутствует в текущем файле; process precedence не означает неизменность таких специальных строк.

Кандидаты parser dependencies — **exact dotenv16.3.1 и dotenv-expand10.0.0**, совпадающие с old bundled engine. До install сверяются официальные tag docs/source; более новые версии не берутся. Используются только parse/expand APIs, без library discovery/vault/config logging. Обёртка владеет конечным filename list, precedence и safe diagnostics. Отказ одного read/expand не раскрывает raw error/line/value; сохраняется наблюдаемое continue-to-next-file поведение там, где оно подтверждено fixture. Без новых Next internal cache/reload/control env semantics: ordinary consumer bootstrap однократный, development HMR не заявляется.

Root явно подтвердил исключение framework internals: `__NEXT_PROCESSED_ENV`, `__NEXT_PRIVATE*`, initialEnv/cache/reload/reset не входят в consumer contract и не переносятся. Adapter не подчиняет loading этим ключам; повторный bootstrap/reload/HMR не заявляется. Каждая обычная build/start стадия запускается в новом процессе. Exact pair добавляется в root dependency/lock без изменения остальных resolutions/integrities; это проверяется отдельно после npm.

Фиксированный root относится к discovery scope; новая общая filesystem sandbox/recovery policy не вводится молча. Helper повторяет old `statSync` file/FIFO check и follow-stat, без parent/home поиска. Полная cross-platform квалификация FIFO/symlink/permission topology не заявляется: доказаны synthetic read-failure continuation и отсутствие broader discovery. Неподдерживаемые filesystem формы не получают новых гарантий. Нет произвольного `.env.vault`, home expansion, configurable filename, secret manager или shell evaluation.

Local/hosted flags и bind/PORT — ответственность bootstrap, не parser. REC фиксирует существующий порядок, включая то, что port из `.env` не меняет уже выбранный old Next CLI listener: выбранный port уже записан в process.env.PORT и имеет process precedence. Consumer интеграция должна заранее заморозить CLI/process bind authority, записать выбранный PORT до loader и сохранить hosted pre-file validation. Открытие storage возможно только после полного env/config admission.

## TDD и квалификация

1. Synthetic baseline child загружает **установленный** @next/env16.4.3 только в test/characterization harness. Свежий child на case устраняет internal initialEnv/cache влияние. Никаких imports Next в production helper и никакого чтения реальных пользовательских env.
2. Сначала подтвердить baseline expected behavior и настоящую потерю file settings у candidate bootstrap без adapter. Missing dependency, недоступный server и ошибочная fixture не считаются domain RED.
3. Добавить новый helper и narrow caller fixture; differential проверки сравнивают только known synthetic keys/results, а stdout/stderr production helper не содержит synthetic secret marker или raw error. Отсутствующие/invalid env files не дают unbounded discovery.
4. Проверить unsupported Node до dependency resolution/env filesystem access; foreign cwd, root с пробелами/кириллицей/metacharacters, process flags/empty values, production/test cases и независимость build/start.
5. Root typecheck/affected launcher tests/conventions/diff и обязательный CI запуск новых cases. Actual consumer ci/build/start/runner относится к SWD2 и не объявляется выполненным REC.

Реализованы `scripts/runtime-environment.mjs` + typed `.d.mts`, `tests/runtime-environment.test.ts`, exact root dependencies/lock и SDD/journal. Прямые root imports используют только stdlib до admission; tests принимают old Next только как dev baseline. Application wrappers/service/DB/HTTP/UI/CSS не меняются. Новые tests попадают в существующий обязательный root `npm test` (`tests/*.test.ts`), отдельный optional/false CI gate не добавляется.

## Подтверждённый объём и оставшиеся gates

Локально получены meaningful RED → GREEN, семь differential cases и ещё отдельные failure/privacy/current-wrapper witnesses: REC12/12 PASS без skip, включая настоящий Node23.11 отказ до FS/parser. Root source peer принят. Exact-pair dependency install, typecheck и архитектурные guards перечислены с setup failures и финальными результатами в журнале; full CI не выполнялся этим агентом.

Подключение loader к новым consumer build/start/launcher, independent ZIP install и Windows/Linux consumer qualification остаются SWD2. Next-private cache/reload не переносится. При различии между guide и установленным loader первичен подтверждённый существующий путь запуска. Это техническая совместимость принятых D13/P5, повторное согласование архитектурных D01–D16 не требуется.
