# SWD1 · Собранные Vite UI и service на одном origin

Дата: 2026-11-04. Ветка `codex/service-web-delivery`, immutable epic base `529e221cb090d593b6ad055fb73594d6cdeb5c9e`. Root принял разделение SWD1/SWD2 до source work. Статус: **DESIGN_ACCEPTED / IMPLEMENTED_LOCAL / PARTIAL_WINDOWS_QUALIFICATION**. Фактическое Windows HTML TCP integrity ограничение не скрыто; обязательный Linux CI gate ещё не выполнен в этой рабочей копии. Основания: accepted D13/D14/D16, P5 и Node runtime contract. [Журнал](../plans/service-web-delivery.md).

## Результат SWD1

Один ordinary Node child из настоящего `apps/service/dist/main.mjs` обслуживает API и настоящие `apps/web/dist` assets на одном loopback origin. Browser не обращается к Next, Vite dev/preview server или proxy. Квалифицируются существующие navigation/cookie assertions и joint SQL/SSE/MCP/restart behavior на собственном file profile из foreign cwd. Это bounded integration/build/test story, не новый production entry/cutover.

**Не входят:** production `scripts/launch.mjs`, `scripts/pack-release.mjs`, root launch/start scripts, Docker, published ZIP/release, dev pnpm/Turbo/lock changes, независимый consumer install, Next removal, hFSD/UI/Tailwind changes, native host acceptance и любые рабочие profiles/DB. Новая story не получает права подключаться к inherited external PostgreSQL, GitHub, SMTP или production credentials.

## Прочитанный baseline

| Файл | Подтверждённый контракт |
| --- | --- |
| `docs/proposals/react-vite-migration/decisions.md`, D13 | Dev pnpm workspaces и consumer npm install — разные деревья. Допустим самостоятельный release source tree с собственным npm lock; конкурирующие locks одного install tree запрещены. |
| `docs/proposals/react-vite-migration/migration-plan.md`, P5 | Consumer `npm run launch`, install/fresh build/start, readiness и ownership должны быть квалифицированы отдельно. Пакуются source/build resources, SQL, protocol; пути независимы от cwd. |
| `scripts/launch.mjs` | Stdlib-only entry проверяет Node до установки, выполняет `npm ci --include=dev` → fresh production build → npm start; URL выводится после Next-specific `Ready in`. Корень вычисляется от entry. На Windows отмена пока сразу taskkill owned tree. |
| `tests/release-launch.test.ts` | Phases/argv/cwd/data sentinel, production NODE_ENV, failure exit codes, readiness ordering, runtime gate и bounded cancellation имеют regression tests. |
| `scripts/pack-release.mjs`, `tests/release-package.test.ts` | Пакуется immutable committed Git source tree, не checkout/runtime data; аудит private paths/symlinks, optional protocol tgz, version/provenance/hash и nonoverwrite outputs. |
| `apps/service/scripts/build.mjs` | Node ESM bundle externalizes packages; explicit wrapper/runtime gate, migrations, MCP bridge, Playwright preload, package version и build manifest. |
| `apps/service/src/main.ts`, `resources/main-cli.mjs` | Entry gate Node24.19+ stable major24 предшествует application import. CLI использует абсолютные built resource paths, explicit profile; печатает structured readiness, принимает owned `ouro:shutdown` IPC/disconnect. |
| `apps/service/src/runtime/{configuration,start-service,static-handler}.ts` | `OURO_STATIC_ROOT` optional, foreign cwd допустим; один store owner; health/readiness после startup, graceful HTTP/worker/background drain перед DB close. Static UI whitelist, API/asset/traversal refusal и HEAD headers уже реализованы. |
| `apps/service/tests/service-{artifact,runner-artifact,node-contract,static,runtime-lifecycle}.test.ts` | Existing service qualification покрывает real artifact/foreign cwd/resources/receipt restart/MCP/runner/gates/ownership, но dependency resolution пока идёт в source install. |
| `apps/web/playwright.config.ts`, `tests/navigation.spec.ts` | Current six assertions выполняются на Vite preview → Next API proxy. Это не доказательство service+Vite delivery. |

SWD1 использует source-installed external dependencies. Запуск bundle из чужого cwd **не равен** независимой установке consumer tree; статус такой установки остаётся **NOT_QUALIFIED** до SWD2.

## Конкретная композиция и ownership

Test-only Playwright configuration поднимает ordinary service child непосредственно из pinned Node, а не npm/Next/Vite server. В environment передаются только ограниченные OS variables и явные fixture `PORT`, `OURO_SERVICE_HOST=127.0.0.1`, `OURO_LOCAL_DEMO=1`, absolute `OURO_DATA_DIR`, verification scratch и `OURO_STATIC_ROOT=absolute apps/web/dist`. Inherited DATABASE_URL, tokens/SMTP/GitHub и NODE_OPTIONS/NODE_PATH не становятся authority теста.

Global setup владеет child IPC и возвращает teardown: сначала `ouro:shutdown`, затем bounded wait подтверждённого child close. В Windows не полагаться только на Playwright webServer force termination как доказательство graceful DB close. При deadline допустимо завершить только свой child/tree для очистки fixture; это явный failed/incomplete shutdown, не successful drain. Never kill by port/name. Cleanup temporary dirs допустим только после проверки абсолютного owned temp parent и завершения всех своих children; чужие paths не удаляются.

Readiness принимается от собственного child, затем проверяется `/api/health` и built UI. Чужой процесс на нужном port не удовлетворяет readiness. Сервис стартует с cwd отдельного temporary directory; resource paths задаются от artifacts/config. Actual external dependencies остаются в текущем service/root install — ограничение отмечается в evidence.

Joint TCP fixture дополнительно владеет file PGlite profile и создаваемой test workspace folder. Он последовательно запускает/останавливает тот же artifact/profile, а не открывает SQL вторым процессом. Test client не берёт production singleton. Immutable request ID/body сохраняются для exact replay после restart; shutdown не становится retry или подтверждением UNKNOWN.

## Наблюдаемые критерии

| ID | Критерий |
| --- | --- |
| SWD01 | Все исходные6 navigation/cookie cases проходят против единственного service origin и actual built Vite. Assertion bodies не упрощаются; слово proxy в общем test title можно заменить нейтральным названием. Нет Next/Vite listener в этой конфигурации. |
| SWD02 | UI GET/HEAD `/`, `/projects`, `/projects/help`, `/projects/:id`, `/projects/:id/members`; actual JS/CSS/fonts MIME/body/HEAD/no-cache подтверждены. Unknown `/api`, missing assets любого extension/extensionless, methods/Accept mismatch и raw encoded traversal не возвращают successful SPA index. |
| SWD03 | Real file-profile create → project command → progressive SSE snapshot/ID/cursor → MCP read используют один service owner. HTTP response status проверяется до payload assertions; API operations проходят current auth, не test-only bypass. |
| SWD04 | Owned graceful IPC stop закрывает stream/HTTP и процесс; тот же profile повторно открывается, сохранённые project/spec/receipt читаются, exact request replay не пишет второй факт. Foreign cwd и resource/MCP paths доказаны. |
| SWD05 | Startup до readiness невозможен без built UI/resource root; setup/dependency/build failures не объявляются domain RED. Existing Node pre-import gate и service artifact/ownership/resource regressions сохраняются. |
| SWD06 | CI явно устанавливает и строит service+web до новых artifact tests; новый actual-service browser gate обязателен. Старый Next/browser qualification пока остаётся отдельным compatibility gate. |

Strict HTML TCP integrity имеет самостоятельный обязательный test на **всех** платформах: exact body bytes и HEAD Content-Length должны соответствовать built index. Никакого Windows-wide skip, удаления injected строк или изменения production headers ради локального filter нет. Windows наблюдение AdGuard фиксируется как FAIL/NOT_QUALIFIED отдельно от UI composition/refs/MIME/HEAD semantics. Direct handler/Web pipeline проверяются до TCP; JS/CSS/font byte equality — через TCP. Linux CI обязан выполнить тот же strict test и подтвердить actual bytes, а не унаследовать Windows environment exception.

## Footprint и проверки

Ожидаемый footprint: test-only `apps/web/playwright.service.config.ts` + owned setup/teardown, существующий `apps/web/tests/navigation.spec.ts` без изменения assertion bodies, новые service artifact integration tests/helpers, необходимые TS config/CI ordering и эти docs. Production static/lifecycle код меняется только при подтверждённом regression с отдельным RED и root review; заранее таких изменений не планируется.

Порядок: подготовить неизменные dependencies и actual artifacts; зафиксировать observable composition baseline; новые domain assertions → meaningful RED при реальном дефекте → минимальная правка → GREEN. Не выдавать missing file/import/server/dependency за RED и не отключать auth/body/lifecycle assertions ради зелёного результата. Для qualification-only additions к уже реализованной capability не создавать искусственный product bug.

Проверки: existing six browser cases через новый config; real TCP joint fixture с persisted profile/restart/SSE/MCP; negative static/API/HEAD matrix; affected service static/artifact/node-contract/lifecycle tests, service/web types/builds, architecture/migration/style guards. Full CI/Linux/whole P5 остаются отдельными статусами. Оригинальные profiles/releases/production не открываются.

## Следующий самостоятельный SWD2 consumer story

Root отдельно подтвердил: будущая поставка сохраняет **`npm run launch` и `npm ci` + fresh build**. Prebuilt assets могут дополнять source release, но не молча заменяют build на hash verification. SWD1 не меняет preparation contract и не заявляет consumer compatibility.

Предлагаемое independent consumer tree (пока design, не создано):

```text
ouro-VERSION/
  package.json                     # отдельный consumer manifest, Node24 engine
  package-lock.json                # единственный npm lock этого install tree
  scripts/launch.mjs               # stdlib gate → ci --include=dev → fresh build → owned service
  scripts/runtime-node.mjs
  scripts/build-consumer.mjs
  apps/web/{src,index.html,vite.config.ts,tsconfig.json,...}
  apps/service/{src,resources,scripts,tsconfig.json,...}
  app/{page.tsx,projects/layout.tsx,tailwind.css,theme.css,globals.css,...}
  components/                      # audited canonical source closure для fresh Vite build
  packages/{client,frontend,core,collaboration,meridian/context,...}
  lib/                             # audited backend/pure source closure, без runtime data
  db/migrations/
  packages/mcp/bin/ouro-mcp.mjs
  vendor/ouro-protocol-VERSION.tgz # exact canonical portable contract artifact
  delivery-manifest.json           # exact commit, inputs/resources и checksums
  README.md
```

Точный source closure подтверждается реальными esbuild/Vite/typecheck inputs и private-path audit; не копируется случайный checkout или node_modules. Source helpers, SQL/MCP/preload и product package anchor сохраняют installed-relative paths. Consumer `node_modules` создаётся собственным npm ci из одного lock; nested app metadata не являются вторыми install roots/locks. Dev pnpm tree/lock и Turbo graph развиваются отдельно. Original source ZIP/pack-release contract сохраняется до отдельного P5 integration decision; consumer asset получает собственные provenance/audit tests.

Consumer deps/tooling выбираются из уже квалифицированных service/web/root versions, без opportunistic upgrades: Node24.19+, Vite/React/TanStack/frontend packages и backend external packages (PGlite/pg/Zod/MCP/argon2/mail/Yjs/lib0/Playwright) плюс exact protocol tgz и fresh build tooling. Один корректный React runtime в browser bundle; dev nested installs не копируются. Conflicting versions/closure/lock должны быть доказаны clean independent npm ci/build, не объявлены решёнными этой схемой.

Future launcher вычисляет release root/profile от installed entry/config, не cwd; сохраняет literal argv, production NODE_ENV tooling, phase exit codes, `.ouro` data и explicit profile. Readiness меняется с Next regex на собственный service signal + health/UI proof. Normal stop сначала graceful IPC/drain, затем bounded owned-tree fallback с честным incomplete status; нужны actual Windows child tests. Одновременный запуск install/build поверх активного consumer tree и profile reuse требуют отдельного tested ownership contract, не одного HTTP port probe. Existing DB/backup/restore/old release reverse path проверяются на закрытой isolated copy, без shared live PGlite.

SWD2 будет иметь новый SDD/root review до source/packaging и собственный clean install/foreign cwd/Node gate/ZIP/restart/runner/protocol qualification. Browser binaries для локального verification runner и его package resolution не считаются установленными только из-за CLI dependency; их capability/setup проверяются отдельно. Native/production deployment/Next removal из consumer PASS не следуют.
