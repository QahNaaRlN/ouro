# Ouro service runtime

Отдельный Node/TypeScript runtime содержит все 47 исходных API patterns и 59 явных методов. Существующие Web factories используют явные store/auth/environment dependencies; Hono остаётся внутри HTTP adapter. Next wrappers пока сохраняются для прежнего рабочего owner. Глобальное переключение, launcher и Docker выполняет интегратор отдельно. Это ограниченная runtime qualification, а не завершённый P2 или browser/native parity.

## Проверки и build

Требуется Node **24.19.0**. Из корня:

```sh
npm ci
npm run protocol:build
npm --prefix apps/service ci
npm --prefix apps/service run typecheck
npm --prefix apps/service run build
npm --prefix apps/service test
```

Dependencies закреплены отдельным lockfile; runtime pins взяты из текущего root lock без обновления PGlite. CI обязательно устанавливает пакет, проверяет strict TypeScript, собирает artifact и выполняет TCP/lifecycle tests. Root Next tsconfig исключает `apps/service`.

Build создаёт `dist/main.mjs`, `dist/index.mjs`, `dist/resources/migrations`, `dist/resources/mcp/bin/ouro-mcp.mjs`, package metadata и build manifest. Это Node ESM bundles с external packages; Next и tsx runtime не нужны. Требуются установленные runtime dependencies и portable protocol. Одного `.mjs` без dependencies/resources недостаточно.

## Запуск и authority

`node /absolute/path/apps/service/dist/main.mjs` работает вне source cwd. Storage выбирается явно: `OURO_DATA_DIR` — абсолютный fixture/profile path либо `memory://`; PostgreSQL — `DATABASE_URL`. Без выбранного storage runtime не стартует. В этом story разрешены только изолированные fixtures.

- Default bind — `127.0.0.1`; `PORT` default 3000, 0 допустим для fixtures.
- Внешний bind требует явных `OURO_SERVICE_HOST`, cloud mode, точного HTTPS `OURO_PUBLIC_URL` и PostgreSQL. Cloud запрещает local demo/shared human/agent tokens.
- SQL/MCP paths вычисляются от artifact resources; data/static/verification paths задаются конфигурацией, не cwd.
- `OURO_STATIC_ROOT` опционален. SPA fallback ограничен GET/HEAD HTML navigation на `/`, `/projects`, `/projects/help`, `/projects/:id`, `/projects/:id/members`. API, неизвестные assets, `/assets/*`, traversal и другие методы не получают index.
- `OURO_SERVICE_READY` печатается после migrations и запуска owners; `/api/health` проверяет настоящую БД.
- SIGINT/SIGTERM и принадлежащий parent IPC message `ouro:shutdown` запускают один идемпотентный stop. IPC существует только у child с настоящим Node IPC channel; это не HTTP/native capability. Разрыв parent IPC также останавливает child.

## Владение и остановка

Storage adapter удерживает `BEGIN EXCLUSIVE` в rollback-mode служебном SQLite mutex рядом с embedded dataDir. Это OS file lock одного процесса; предметные события/receipts остаются в PGlite/PostgreSQL. Windows Node 24.19 проверен реальными contention и killed-child restart. Linux требует отдельного CI evidence.

Marker имеет собственный application ID и точную служебную схему. Foreign bytes/SQLite, symlinks/junctions и пустой/незавершённый marker отклоняются без перезаписи. Mutex-файл сохраняется после close; OS lock освобождается после **PGlite.close**. Параллельный процесс не удаляет marker.

Crash после readiness проверен. Crash до первого COMMIT marker может оставить пустой/неполный файл: автоматическая recovery этой неоднозначности **не квалифицирована**, startup fail-closed. Нужны остановка owners и отдельная явная операторская recovery, а не автоматическое удаление файла.

Stop снимает readiness/admission, отменяет streams/tasks и worker/runner signals, останавливает timers, ждёт handlers, observer/runtime operations и SQL tail, затем закрывает БД и освобождает mutex. Закрытый socket не считается завершённым query. Неотменяемое Promise приводит к bounded timeout; принудительная отмена произвольного ресурса не обещается.

Неиспользованное body ограниченно дочитывается после response finish/close отдельным owner; ранний 403/415 не ждёт cleanup deadline или завершения upload. Handler/SQL и body cleanup учитываются отдельно. Auth/content-type/error priority остаётся у application handler; body caps не назначаются всем routes перед auth. Background jobs начинаются после response finish, durable enqueue остаётся до ответа. Reporter получает безопасные metadata; throw/reject reporter не меняет HTTP result.

Startup cleanup независимо пытается остановить HTTP, worker и store background. БД закрывается только после подтверждённого drain всех владельцев. Иначе `StartupCleanupIncompleteError` сохраняет исходную cause и фиксированные статусы cleanup; CLI печатает безопасный `OURO_SERVICE_STARTUP_CLEANUP_INCOMPLETE`, не raw exceptions. Неполная cleanup не объявляет ownership освобождённым.

## Граница квалификации

Проверены real TCP negotiation всех 47 routes/59 методов, SQL replay, cookies/revocation, оба MCP endpoint, progressive SSE, byte-exact webhook HMAC, handler/worker drain, startup failure, file-profile restart и ordinary Node artifact вне source cwd. Исторические transport checks сохранены.

**NOT_QUALIFIED:** packaged runner dependency resolution из scratch вне install root (отдельный preload story), URI parity trailing/repeated slashes и backslash с Next, PostgreSQL service profile, Linux OS mutex, TLS deployment, все browser сценарии, live cutover, consumer packaging, load/backpressure stress и Meridian host. Existing source-runner regression/cancellation не заменяет packaged-runner qualification.

Контракты: [SR SDD](../../docs/specs/service-runtime.md), [журнал SR](../../docs/plans/service-runtime.md); история transport: [SQ](../../docs/specs/service-qualification.md).
