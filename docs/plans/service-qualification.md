# SQ · Журнал квалификации HTTP adapter

Дата: 2026-11-04. Ветка: `codex/service-qualification`. Контракт: [service-qualification.md](../specs/service-qualification.md).

## Граница выполнения

Это первый отдельный backend story. Рабочие маршруты, профили БД, launcher, UI и Meridian не переключаются. Root package не меняется. Исполнитель не выполняет commit/push/merge.

## Исходное чтение

- CONTRIBUTING, AGENTS и принятый пакет миграции прочитаны.
- Инвентарь: 47 route.ts / 59 явных method exports (34 POST, 21 GET, 3 DELETE, 1 PATCH); четыре MCP handlers намеренно отвечают 405.
- Готовые Web factories: auth, project, participant, collaboration, GitHub, Meridian import, SSE, project MCP, health.
- Next-specific server hooks: два `after()` wrapper и запуск GitHub recovery worker из instrumentation; текущие worker/store timers требуют отдельного server lifecycle при полном выделении.
- Обычный body limit 256000 bytes; webhook/import 2 MiB; login/logout выдаёт три Set-Cookie; SSE — отдельный progressive response, MCP — finite stateless JSON.

## Установка и runtime

Использован явно переданный Node `v24.19.0`, не системный runtime:

```powershell
$runtimeDir = 'D:\PersonalProjects\ouro-worktrees\react-vite-foundation\.operations\runtime\node-v24.19.0-win-x64'
$env:PATH = $runtimeDir + ';' + $env:PATH
```

Exact metadata проверены в npm registry: `hono@4.13.16`, `@hono/node-server@2.1.6`. Node adapter требует Node >=20 и peer Hono `^4 || ^5.0.0-0`; данный runtime соответствует. Отдельный package-lock закрепляет также TypeScript 5.9.3, tsx 4.20.6 и @types/node 24.10.0.

Первые npm metadata calls в обычной ограниченной среде завершились `ENOTFOUND registry.npmjs.org`; обычный TCP запуск не мог соединиться со своим loopback listener (`EACCES`). Это инфраструктурные результаты, не TDD RED. Для установки и настоящих TCP-проверок использован разрешённый запуск с необходимым доступом. Root `npm ci` выполнен без изменения package/lockfile; service `npm install`, затем повторный clean `npm ci --offline` прошли в собственном каталоге. Предупреждение npm о policy install script esbuild не помешало работе установленных platform binaries; blanket-разрешение scripts не добавлялось.

## TDD и результаты

| Этап | Состояние | Основание |
|---|---|---|
| SDD до source | DONE | Контракт создан до adapter/tests |
| Dependency qualification | PASS в границах story | Exact metadata, отдельный lockfile, повторный clean install |
| Meaningful RED | CONFIRMED | 9 тестов: 4 PASS / 5 assertion/lifecycle FAIL на минимальном adapter |
| Cancellation regression RED | CONFIRMED | Реальная task с interval не очищалась: stop завершался ошибкой deadline |
| Method edge RED | CONFIRMED | GET:undefined ошибочно включался в OPTIONS Allow |
| GREEN | PASS | 14/14 реальных TCP/lifecycle тестов, без force-exit |
| Собственный strict typecheck/build | PASS | Оба отдельных package scripts завершились exit 0 |
| Root TypeScript | PASS | `npm run typecheck`, включая действующий protocol prebuild |
| Существующие factory regressions | PASS | 22/22 auth/proxy/SSE/GitHub tests, включая memory SQL и настоящий HTTP |
| Source/conventions audit | PASS | 9 новых TS-файлов: AST не содержит any, обычных line/block comments; git diff --check и check:conventions прошли |
| Полная extraction 47 routes / production cutover | NOT_STARTED | Вне этого story |
| Native integration/acceptance | NOT_STARTED | Вне этого story |

## Наблюдаемый RED и исправление

Первый meaningful RED получен после успешной загрузки всех модулей и установления реальных TCP-соединений:

| Проверка | Исходный результат | Требуемый результат |
|---|---|---|
| OPTIONS | 404 | 204 + отсортированный Allow |
| Chunked oversized body | 200, application handler вызван | 413 до application handler |
| Handler exception | Plain-text 500 и стандартный вывод Hono | Безопасный JSON 500 и самостоятельный reporter |
| Deferred callback | Запуск до завершения progressive response | Запуск только после Node finish |
| Повторный stop | ERR_SERVER_NOT_RUNNING | Идемпотентное завершение |

Для намеренно неполного исходного lifecycle этот RED запуск использовал `--test-force-exit`. GREEN и все последующие lifecycle проверки завершались самостоятельно. Ошибка подготовки ESM/CommonJS bridge до этого прогона не считается RED: существующие root factories загружаются в tests через typed createRequire, root module contract не изменён.

По независимому review добавлен AbortSignal фоновой задачи. Отдельный meaningful RED с настоящим interval показал `Service shutdown deadline exceeded`; после исправления задача очищает interval по abort до завершения stop. Task, игнорирующая abort и никогда не завершающая Promise, отдельно проверена как bounded failure. Её принудительное уничтожение не заявляется.

Самопроверка нашла OPTIONS edge с `GET: undefined`: исходный Allow был `GET, OPTIONS, POST`, ожидаемый — `OPTIONS, POST`. После фикса учитываются только реальные handlers, как в установленном Next.

Локальные подробные выводы сохранены в игнорируемом `.operations`, не включаются в исходную поставку:

- `service-qualification-red.log`;
- `service-qualification-cancel-red.log`;
- `service-qualification-method-red.log`;
- `service-qualification-green.log`;
- `service-factory-regression.log`.

## Повторяемые команды

Команды ниже выполнялись переданным Node/npm с process-local PATH выше:

```sh
npm ci --no-audit --no-fund
npm run protocol:build
npm --prefix apps/service install --no-audit --no-fund
npm --prefix apps/service ci --offline --no-audit --no-fund
npm --prefix apps/service test
npm --prefix apps/service run typecheck
npm --prefix apps/service run build
npm run typecheck
```

Регрессии существующих factories:

```sh
node node_modules/tsx/dist/cli.mjs --no-wasm-code-gc --test --test-concurrency=1 tests/user-auth-http.test.ts tests/project-stream.test.ts tests/github-http.test.ts tests/auth-proxy-regressions.test.ts
```

Воспроизводимая установка другим checkout использует `ci` и committed service lockfile; `install` выше — фактическое первоначальное создание этого lockfile. Protocol generator после prebuild оставил только нормализацию LF/CRLF, смысловой diff проверен нулевым; его tracked outputs возвращены к исходному виду. Protocol/core/auth/route исходники не изменены.

## CI и project boundary

По поручению root `apps/service` исключён из root Next tsconfig. Собственные tests лежат внутри `apps/service/tests`; строгая проверка не отключена, а выполняется отдельным package script. В `checks` добавлены безусловные service install, TCP tests, typecheck и build. Root package не получает Hono, текущий Next runtime не подключает новый adapter. Результат удалённого CI здесь не заявляется: workflow подготовлен, но публикация/PR выполняется root отдельно.

## Точный результат и оставшаяся работа

Story готов к review: реализация transport foundation и её локальная квалификация выполнены. Проверены реальные factories auth (три cookies, session/logout, origin), webhook (byte-exact HMAC) и SSE (progressive frames, disconnect/stop cleanup), разные body budgets, методы, safe reporting, after-finish task ownership, capacity, cooperative abort и deadline failure.

Это **ограниченный fixture transport PASS**, а не полный допуск нового backend к рабочему трафику. TLS handshake/reverse proxy, все 47 маршрутов, PostgreSQL, SQL migrations/ownership, durable worker/lease recovery, verification child processes, нагрузочный backpressure и native/WebView2 остаются вне результата.

`maxBodyBytes` применяется до handler. При полной extraction нужно сохранить заданный существующими helpers порядок auth/content-type/body checks и приоритет ошибок, а не назначить transport cap всем маршрутам автоматически.

Перед подключением storage owner P2 должен учитывать незавершённые application handlers/queries отдельно от sockets и task callbacks: disconnect/abort не доказывает завершения SQL. DB.close выполняется только после соответствующего drain либо явного завершения по согласованному deadline. Существующий GitHub kick ещё не принимает signal; полная worker cancellation не доказана этим story.

Рабочие профили и реальный PGlite не открывались; старый Next остаётся их единственным владельцем. Полная замена собственных CSS на Tailwind 4 остаётся обязательным отдельным объёмом UI-эпика. Commit/push/merge и пользовательская приёмка story исполнителем не выполнялись.
