# SR · Журнал полного backend runtime

Дата: 2026-11-04. Ветка: `codex/service-runtime`. База transport story: `acb48a6`. Реализация разрешена; глобальное переключение рабочего backend не входит в этот worktree.

## До кода

SDD: [service-runtime](../specs/service-runtime.md). Изучены текущие 47 routes, SQL migrations 001–012, auth/workspace/store, GitHub HTTP/worker/client, finite MCP handler, SSE, verification process owner и accepted migration architecture. Next guides и auto-method implementation были прочитаны в предыдущем transport story; wrapper semantics сохраняются.

Исходные риски: `currentStore` скрыт в auth/workspace defaults; `store.close` ждёт SQL tail, но не весь observer/runtime work; worker не имеет stop/AbortSignal; verification scratch, migrations и MCP path используют cwd; HTTP socket close не означает завершение handler/query.

## Реализованная граница

- `apps/service/src/backend/routes.ts`: 47 явно именованных binders и 59 methods. Inline тела перенесены из прежних wrappers, общие HTTP factories переиспользуются. Next wrappers сохранены. Auth, workspace context, cookies, cloud MCP capabilities, default folder root и connection resources получают явные зависимости.
- `runtime/start-service.ts`: startup/migrations/readiness, один store/worker, stop admission, cancellation/drain и DB close. Listener различает sockets без HTTP request и действительно выполняющиеся handlers.
- `lib/store.ts`: общий ownership для Next-compatible callers и service; ожидание observer cycle/runtime operations/SQL tail. Сигнал отмены проходит до owned verification process и GitHub fetch.
- `lib/storage/profile-owner.ts`: Node SQLite только для mutex metadata, собственный application ID/marker, rollback DELETE и удерживаемый BEGIN EXCLUSIVE. Domain SQL migrations 001–012 и PGlite/PostgreSQL остаются прежними. Lock освобождается после PGlite.close.
- `lib/http.ts`: независимый безопасный reporter с code/operation/occurrence ID; raw exception не передаётся. Throw/reject reporter не изменяет ответ.
- `scripts/build.mjs`: ordinary Node ESM bundles, явные external packages, SQL/MCP resources, product metadata и build manifest. Next/tsx runtime не используются.

Root package/lock, root launch/Docker и 47 Next wrappers не изменяются. Рабочие DATABASE_URL/OURO_DATA_DIR, профили, SMTP/GitHub и пользовательские workspace не используются.

## RED → GREEN

| Проверка | RED | Исправление и GREEN |
|---|---|---|
| HTTP activation | Реальный TCP `/api/project` получал 404 вместо 200 | Все binders подключены к одному fixture owner; 200 и shared project SQL |
| Inventory | Пустая таблица показывала 0 вместо 47 | 47 patterns/59 methods; это inventory gate, отдельно от semantic RED |
| Handler drain | После disconnect stop завершался до завершения pending handler | Handler promise учитывается независимо от socket; stop ждёт release |
| SQL resources | Запуск вне repository cwd читал отсутствующий `cwd/db/migrations` | Явный migrationsDir; memory SQL startup вне cwd проходит |
| Worker cancellation | Abort owner не достигал upstream task, настоящий interval оставался активен | Signal проходит через worker/client; interval очищен, recovery timer остановлен |
| Runner shutdown | Новый тест против неизменённого HEAD store завершался STORE_CLOSED: SQL закрывался до pending runner result | Настоящий Playwright child abort/drain сохраняет error result до close; тот же тест GREEN |
| HTTP unknown error | Callback reporter не вызывался (0 вместо 1) | Безопасные metadata, raw secret отсутствует, throwing/rejecting reporter изолирован |
| Foreign mutex | Foreign file принимался вместо fail-closed | Foreign bytes/SQLite, empty marker и Windows junction отклонены без изменения target |
| Large denied body | Native TCP мог получать ECONNRESET при early auth rejection | Прямой Node→Web body bridge и bounded cleanup после выбранного результата; auth/body priority сохранён |
| MCP shutdown | Node close ожидал preconnect sockets с нулевыми bytes и без HTTP request | Idle preconnect закрываются отдельно; application drain остаётся обязательным, timeout не увеличен |

Первый approval review ownership-команды завершился по deadline до запуска; это **NOT_RUN**, не domain RED. Единственный повтор был разрешён и исполнился. Первый crash probe дал readiness timeout и отдельно не считается доказательством crash semantics. Финальный killed-child contention/restart проверен на ordinary Node artifact. Временная копия HEAD store для runner RED удалена.

## Воспроизводимые команды и факты

В локальных командах PATH указывает только для процесса на переданный `node-v24.19.0-win-x64`; системный Node не менялся. Полный prefix executable — `D:/PersonalProjects/ouro-worktrees/react-vite-foundation/.operations/runtime/node-v24.19.0-win-x64/node.exe`, npm CLI из того же runtime.

| Gate | Фактический результат |
|---|---|
| Root `npm ci --include=dev` | PASS |
| `npm run protocol:build` | PASS, 71 schemas |
| Service `npm ci --offline --no-audit --no-fund` | PASS, 130 packages; allow-scripts настройки не расширялись |
| Service `npm run typecheck` / `npm run build` | PASS |
| `npm --prefix apps/service test` | После startup/body review **37/37 PASS**, без force-exit и без SKIP |
| Existing targeted auth/store/SSE/GitHub/hosted/verification suite | 48/48 PASS |
| Full root `npm test` | **552 tests: 539 PASS, 13 SKIP, 0 FAIL**; существующие platform/external gates не повышались в PASS |
| Root `npm run build` | PASS, Next 16.4.3 compiled, все 47 API routes сохранены |
| Root `node node_modules/typescript/bin/tsc --noEmit` | PASS после production build |
| `npm run check:conventions` | PASS, `codex/service-runtime` |
| `git diff --check` | PASS |
| AST scan 17 новых TS files | 0 AnyKeyword, 0 обычных комментариев; новые описания — JSDoc |
| Protected source diff | Root app/47 wrappers, package/lock, core/protocol/collaboration, launch/Docker — без изменений |

Тесты сервиса проверяют все 47 routes и 59 methods через TCP: auto OPTIONS/HEAD/405, negative auth/content-type priority, unknown API, SQL command replay/conflict, participant revoke, реальные account cookies и logout, оба MCP endpoint, cloud capability filtering, SSE SQL updates, chunked webhook HMAC и реальные 2 MiB caps webhook/Meridian. Built artifact запускается вне source cwd на temp file-backed PGlite, сохраняет immutable receipt после restart; скопированный stdio bridge реально запускается и соединяется с тем же service через MCP SDK. Listener startup failure освобождает storage, повторный runtime становится ready на том же fixture.

Первый ограниченный Next build получил filesystem EPERM при создании `.next/server/app/api/auth`, до compiler qualification. После проверки абсолютного `.next` path и повторного разрешённого запуска build/typecheck/conventions прошли. Это environment failure, не domain RED. Generated protocol outputs имели нулевой semantic diff; восстановлены только эти build side effects, исходные protocol files не менялись.

Ignored evidence: `.operations/service-runtime-red.log`, `service-runtime-lifecycle-red.log`, `service-worker-red.log`, `service-runner-red.log`, `service-runner-green.log`, `service-errors-red.log`, `service-ownership-red.log`, `service-ownership-green.log`, `service-full-green.log`, `service-existing-regressions.log`, `service-root-full-tests.log`. Эти логи не заменяют committed tests и не публикуются как user-profile данные.

## OS mutex и конкретная crash граница

В exact Windows Node 24.19 доступен встроенный SQLite 3.53.3; API имеет статус release candidate, без experimental flag: [Node 24.19 SQLite](https://nodejs.org/download/release/v24.19.0/docs/api/sqlite.html). Механизм опирается на [rollback-mode file locking SQLite](https://www.sqlite.org/lockingv3.html), а не PID reclaim или удаление чужого файла. Версия PGlite не обновлялась: service pin 0.3.16 взят из существующего root lock.

Реально проверены разные Node processes: второй owner отвергнут; child после readiness аварийно завершён; обычный новый startup получает тот же fixture и health=200. Также проверены same-process contention, повторный release, foreign files/SQLite, empty marker, Windows junction и migration failure с последующим повторным владением.

Mutex располагается **рядом** с dataDir, не внутри него: эксперимент с размещением служебной SQLite внутри нового PGlite dataDir нарушал init. Сам mutex-файл после release сохраняется; не удалять его при активных процессах. Crash до завершения первого marker COMMIT может оставить неинициализированный файл: startup отвергает его без перезаписи, автоматическая recovery этой стадии **NOT_QUALIFIED**. Нужна отдельная явная операторская recovery после подтверждённой остановки owners. Никакого generic lock deletion/reclaim API не добавлено.

## Незакрытые gates

- **NOT_QUALIFIED — packaged runner resolution:** source Playwright cancellation и SQL ordering проверены, но bare CJS/ESM/TS imports из scratch вне install root и наследование в packaged worker требуют отдельного квалифицированного preload story. Junction, NODE_PATH и пользовательский NODE_OPTIONS не добавлялись.
- PostgreSQL profile именно нового service, Linux mutex/CI, TLS/reverse proxy deployment, полный browser parity, consumer packaging, live cutover, нагрузка и Meridian host остаются отдельными результатами.
- Atomic publication нового marker через initialized temp + exclusive hardlink — предложенное отдельное улучшение. В этой истории не добавлялись overwrite/reclaim/copy fallback и не заявлялся PASS crash-before-publication.
- Simulator сохраняет исходное несоответствие: selected project используется для auth/actor, а прежние default `getProject/executeCommand` относятся к default project. Оно не исправлялось скрыто при extraction.

Результат этого story не означает завершение полного P2, production acceptance или native acceptance. После интеграционного review owner создаёт отдельную зависимую историю packaged runner.

## Startup/body cleanup review

Root review подтвердил два дополнительных cleanup случая. Sequential startup cleanup после rejection worker пропускал HTTP и маскировал исходную ошибку: meaningful RED зафиксирован в `service-review-red.log`. Теперь worker/HTTP/store-background остановки выполняются независимо через allSettled; closeStore вызывается только при подтверждённом drain всех имеющихся владельцев. Неполный результат имеет фиксированные статусы и исходную cause, raw cleanup errors не публикуются. Настоящий file-profile test подтверждает сохранённый mutex при skipped DB.close. Targeted cleanup: 9/9 PASS.

Raw TCP prefix с большим Content-Length без завершения upload показал другой meaningful RED: early403 ожидал 500ms body-cleanup deadline. ECONNRESET в этом prefix probe не наблюдался. Bounded unused-body cleanup перенесён на response finish/close, отделён от handler/SQL lifetime и остаётся в drain. Проверки ранних403/415 выполняются с `Connection: close` и `keep-alive`, тело не завершается; timeout не увеличивался. Логи: `service-partial-upload-red.log`, `service-partial-upload-green.log`.

Полный уже отправляемый body с клиентским Connection:close не даёт универсальной гарантии доставки отказа. Контрольный native Node HTTP probe: 1 корректный403 /29 ECONNRESET из30. Actual production Next16.4.3 на собственном loopback/temp fixture: 6 корректных403 /14 ECONNRESET из20. Поэтому full-upload401/413 проверяются в browser/SDK keep-alive режиме; expected statuses и body budgets сохранены. Старый pre-response drain случайно стабилизировал этот close race ценой500ms блокировки. Лог actualNext: `service-next-refusal-baseline.log`. Это не обещание доставить ответ после закрытия клиентом соединения.

Alias review: direct PGlite0.3.16 на Windows отвергает final-component junction и для fresh, и для initialized dataDir (ExitStatus1). Это не регрессия нашего guard; новая поддержка final alias не добавлена. Parent-directory junction vendor принимает, текущий guard конечного dataDir его не запрещает. Baseline evidence: `service-alias-baseline.log`, `service-parent-alias-baseline.log`; Linux не повышается в PASS.

Дополнительный **NOT_QUALIFIED URI parity gate**: Next trailing-slash308, repeated-slash и backslash normalization требуют отдельной истории перед cutover. Методный47/59 gate не подтверждает полный HTTP/URI parity. Hono internal auto cleanup не отключался без доказанного отдельного дефекта.

Финальный post-review повтор: service typecheck/build PASS, полный service suite **37/37 PASS** (`service-review-final-green.log`). Sync-throw cleanup дополнительно3/3 PASS. Общий root code после прежних552 checks не менялся; post-review изменения ограничены service/tests/docs. До интеграции root app/core/protocol/package/launcher/Docker остаются без diff.
