# SWD2 — самостоятельная исходная поставка web + service

Дата: 2026-11-04. Ветка `codex/consumer-source-delivery`, исходный commit SWD1 `16943f52d03ad496c3e56ff1233be3f589c0d55d`; принятая REC dependency `a10cc386c8f71142448383d8bf379cb721f0ae5c`. Статус: **SOURCE_BUILD_IMPLEMENTED_LOCAL / PARTIAL_WINDOWS_QUALIFICATION / GENERATION_PROTOCOL_NOT_IMPLEMENTED**. Root принял structural producer design и generation direction для дальнейшей детализации; end-user launcher/ZIP/cutover не заявляются. Основание: принятые D13/D14/D16 и P5. [Журнал и точные evidence boundaries](../plans/consumer-source-delivery.md).

## Наблюдаемый результат и границы

Отдельный новый source ZIP устанавливается независимо от репозитория разработки и запускает собранные React/Vite и Node service на одном origin. `npm run launch` по-прежнему выполняет `npm ci --include=dev`, затем **свежую сборку**, затем сервер. `npm start` остаётся сокращённым запуском уже подготовленного дерева. Node24 проверяется стандартной библиотекой до чтения env, сторонних imports, установки и открытия профиля. Предварительно собранные файлы не заменяют сборку из поставленных исходников.

В этом story не заменяются старый source ZIP, `scripts/pack-release.mjs`, production launcher, Docker или рабочий релиз. Не удаляется Next из дерева разработки, не меняются предметные схемы/контракты, browser transport или Native scope. Dev pnpm и его lockfile вводятся отдельной историей после consumer proof. SWD1 является same-origin qualification; Windows strict HTML TCP integrity там **FAIL / NOT_QUALIFIED** из-за наблюдаемого host transformation, а Linux exact gate обязателен. Этот статус не повышается документом SWD2.

## Один dependency graph и отдельные generation install trees

Ниже — конкретный пересмотр по предложению root, принятый как направление для дальнейшей детализации, **до launcher source**. Он заменяет прежнюю идею `npm ci` поверх одного installed tree и parent-only preparation mutex. Финальная operator-edit/pointer/lifetime реализация ещё отсутствует.

```text
ouro-VERSION/
  package.json                          # stdlib command envelope; NO dependencies / install lock
  scripts/{launch,start,build,runtime-node,runtime-environment}.mjs
  packages/mcp/bin/ouro-mcp.mjs          # stable stdlib forwarding entry для issued configs
  source/
    package.json + package-lock.json    # единственный canonical consumer dependency graph
    apps/web/{src,index.html,vite.config.ts,tsconfig.json,package.json}
    apps/service/{src,resources,scripts,tsconfig.json,package.json}
    app/ + components/ + public/        # конечное замыкание Vite inputs
    lib/ + packages/{client,frontend,core,collaboration,meridian}/
    db/migrations/ + packages/mcp/bin/ouro-mcp.mjs
    vendor/ouro-protocol-VERSION.tgz    # exact canonical portable artifact
    postcss.config.mjs + delivery-manifest.json
  .ouro/postgres/                       # стабильный local profile; runtime-only, не архив
  .ouro-runtime/generations/GENERATION/ # unique atomic-mkdir install tree; runtime-only
    package.json + package-lock.json    # exact canonical graph copy; здесь ci/node_modules/build
    ...source snapshot... + node_modules/ + apps/{web,service}/dist/
  .ouro-runtime/records/GENERATION.json  # completion metadata вне writable install tree
  .ouro-runtime/last-built.json          # bounded atomic pointer; не auth/readiness authority
  README.md + .env.example               # реальные operator env/keys не копируются в source/gen
```

Outer package даёт прежние npm commands, но не содержит dependencies/lock и не запускает install у себя. `source/package.json` + lock — blueprint одного графа, в source не устанавливаются dependencies. Каждая preparation копирует этот граф в новый generation и выполняет один root install именно там. Это разные независимые install trees, а не конкурирующие npm/pnpm locks одного дерева. Nested app metadata сохраняют module/resource anchors; их locks и `node_modules` в consumer не входят и отдельные install не запускаются.

Consumer graph фиксирует qualified versions из существующих root/web/service locks. В частности, service сохраняет Hono4.13.16 / node-server2.1.6, а не более раннюю root SDK-hoisted пару. React/ReactDOM19.3.1, Vite7.3.7, TS5.9.3, esbuild0.28.2, Playwright1.64.1 и остальные фактические версии сверяются до фиксации lock; opportunistic upgrades отсутствуют. Различающиеся existing TypeScript helper/types versions разрешаются явно и проходят совместную сборку, без заявления о неизменности ранее разных графов.

`@ouro/protocol` устанавливается только из exact bundled tgz, без directory link в source checkout. Consumer не зависит от Next или `@next/env`. Fresh Vite build использует существующие узкие navigation aliases и один React runtime; service build остаётся Node ESM bundle с явными externals, SQL/MCP/preload resources. Generation `apps/service/dist` сохраняет форму artifact resource paths. Source closure — явный консервативный конечный набор согласованных roots/files с назначением и build/runtime evidence, а не обещание минимального набора каждого import или копирование всего checkout.

## Producer graph и provenance

Первый source slice: `scripts/consumer-delivery/committed-source.mjs` + typed declaration и `tests/consumer-source.test.ts`. Он разрешает immutable commit, отключает Git replacement objects, аудирует **всё** tracked tree до выбора closure, затем читает выбранные canonical blob bytes через bounded Git batch. Проверяются original spelling/type **каждого prefix**, включая directory-case aliases и file/directory conflicts, без запрета Unicode. Consumer/protocol/delivery/qualification inventories разделены; runtime/private/mode/path failures имеют фиксированные diagnostic codes без raw Git stderr. Dirty/untracked checkout не используется. Сам по себе inventory не доказывает build sufficiency: дополнительно реализован независимый source-build/runtime harness, ZIP/launcher остаются вне этого среза. Негативные committed-tree fixtures сначала показывали behavioral RED, не missing dependency.

После independent source-build proof замораживаются generated data `release/consumer/dependencies.json`, `package-lock.template.json` и `registry-provenance.json`. Они не являются вторым install root: нет package.json/scripts/node_modules, template не запускается npm напрямую. Registry resolutions/integrities берутся из проверенного единого lock и не пересчитываются producer. Конечная подстановка ограничена product version (top/root), local protocol filename (root dependency + package resolved), protocol package version и actual artifact SRI. Protocol dependency/bin/engine contract хранится отдельно и не заменяется произвольной metadata. Whole template/hash и конечные slot counts валидируются при последующем materialization; launcher source от этого не включается.

Reproducible SOURCE_BUILD срез: `materialize-build-tree.mjs` получает consumer/protocol/delivery inputs из **того же** immutable Git commit; в новом собственном sibling producer stage выполняет protocol ci с ignore-scripts и direct canonical pack entry. Внешний произвольный tgz не принимается. Existing bounded `protocolMetadata` переиспользуется named export без изменения старого packer body. Только после проверки actual archive/SRI и fixed dependency slots материализуется новый отдельный source output, без node_modules/dist/private env/profile. `build-consumer.mjs.template` копируется в scripts и проверяется уже в целевом installed context; template не является действующим entry репозитория. Build gate/typechecks/web/service/resource input manifests выполняются перед completion.

`qualify-consumer-source.mjs`/отдельный обязательный CI job воспроизводят ci с **NODE_ENV=production + include=dev**, свежие combined/web/service typechecks + Vite/service build, source-input gates, bare protocol ESM/CJS/types/CLI, actual runtime/runner и неизменённые шесть browser assertions **без root install**, с собственными output/profile/foreign cwd. Новый CI job проверяет отсутствие source node_modules; он не наследует source dependency fallback. Chromium install разрешён только явным CI-only flag, локальный run использует существующий cache и не меняет host settings. Unit integration создаёт temporary Git fixture из canonical source blobs и конечного списка owner delivery files до local commit; production materializer читает только этот committed fixture tree. Fixture commit отделяется от origin source commit в evidence. Старый source ZIP/launcher и `.env.local` рабочего приложения не читаются и не меняются.

Локально повторяемый harness подтвердил все функциональные phases, точные JS/CSS/woff2 bytes и GET/HEAD length/cache, runner3 и unchanged browser6, но strict HTML byte/HEAD gate **FAIL** (672 expected /1161 received) и overall **PARTIAL_HTML_INTEGRITY_FAILED**, exit1. Production `NODE_ENV` устанавливается в самом child environment для ci/build; ambient authority при этом не переносится. Gate не пропущен и не фильтрует injected bytes. Linux CI обязан выполнить ту же strict проверку; локальный PASS остальных phases не является full CI или P5 acceptance. Квалификация устанавливает dependencies в своём verification tree; это дерево с node_modules/profile не является source release input. Будущий archive producer обязан брать новый чистый materialization output, не упаковывать verification tree или его parent. SOURCE_BUILD output не является готовым end-user release.

1. Разрешить ref один раз в полный commit, прочитать `git ls-tree -rz` и blob bytes. Запретить private/runtime paths, ссылки и неподдерживаемые modes; `.env*` кроме `.env.example`, credentials, profiles и dependencies никогда не пакуются. Dirty/untracked checkout не является источником.
2. В отдельном временном producer install tree извлечь **тот же** committed `packages/protocol` с его собственным canonical lock. Выполнить собственные ci/build/pack и проверить portable artifact. Его dependencies не копируются в consumer. Это отдельная сборочная стадия, не второй install root consumer.
3. Сформировать конечное source closure и consumer scripts/metadata из тех же committed blobs. Заморозить registry lock resolutions/integrities; конечная подстановка local protocol path/version/SRI допускается только в явно перечисленных полях. Любое другое изменение шаблона lock отклоняется. Детерминированность protocol bytes между Windows/Linux ещё подлежит проверке; она не предполагается.
4. Упаковать с manifest: полный commit, каждый source blob/path/hash, generated metadata/template hashes, exact protocol artifact/hash, версии Node/npm и task contract. Existing different output не перезаписывать. Private-path audit применяется и к generated/archive contents.
5. Независимо распаковать ZIP вне source/install roots и доказать npm ci/build/start. Никаких source node_modules, symlink/junction, NODE_PATH или пользовательского NODE_OPTIONS как resolution fallback.

## Consumer commands и generation isolation

`stdlib Node gate → installed-root discovery → atomic mkdir unique generation → canonical source snapshot → npm ci --include=dev В ЭТОМ generation → fresh web + service build → BUILT publication → owned service child + stable profile → structured readiness + /api/health + UI probe → IPC graceful drain → bounded owned fallback`.

Gate применяется ко всем outer build/start/MCP entry до env/dependency reads. npm вызывается через validated npm CLI с literal argv, `shell:false`; release root определяется от entry, cwd может быть произвольным и содержать пробелы/кириллицу/metacharacters. Ни `ci`, ни build никогда не применяются повторно к готовому, работающему или UNKNOWN generation. После смерти parent npm orphan может продолжать mutation только своего старого generation; следующий запуск создаёт другой каталог и старый не удаляет/не переиспользует.

| Command | Предлагаемый конечный контракт |
|---|---|
| `npm run launch -- --port N` | Всегда новый generation, настоящий ci с dev tools и fresh build, затем запуск именно этого BUILT generation. Default port3000 сохраняет explicit launcher precedence. |
| `npm run build` | Новый generation с ci+fresh build, публикация BUILT без сервера. Это явная адаптация direct build для dependency-free envelope; сборка работающего дерева не выполняется. |
| `npm start -- --port N` | Только последний завершённый BUILT generation; ci/build отсутствуют. При отсутствии/повреждении pointer/artifact — безопасный отказ с инструкцией build/launch, без auto fallback к UNKNOWN. Inherited process PORT выбирается до env files, как old direct start. |
| `npm run mcp` и прежний absolute `packages/mcp/bin/ouro-mcp.mjs` | Stable stdlib forwarding entry выбирает валидированный BUILT artifact внутри этого envelope и запускает тот же canonical bridge. stdout зарезервирован MCP; credential/file/URL/project semantics не меняются. |

`last-built` описывает только завершённую сборку, не запущенный сервер и не владение profile. Completion records находятся **вне** writable generation и публикуются только владельцем preparation после подтверждённого завершения build child. Генерация пути — bounded UUID basename; любые pointer path traversal/foreign root/symlink/invalid manifest/stage отклоняются. Pointer публикуется только после проверки обязательных artifacts; частичная запись не может стать BUILT. Предлагается complete own temp + atomic publication в owned metadata namespace; точные primitives Windows/Linux и concurrent builds проверяются до принятия. Publication failure оставляет прежний valid pointer и явную ошибку, без fallback к частичному record. Краткий parent-owned publication mutex допустим только для самой metadata operation без mutating children; он не выдаётся за install-tree lifetime protection. Старые незавершённые records остаются историей незавершённой preparation, а не автоматически доверенным stale owner. За record не стоит авторизация.

Сервис запускается напрямую pinned-compatible Node с IPC. Сначала структурный READY собственного child, затем health и HTML-navigation readiness. Занятый порт с чужим сервером не становится успехом. Остановка сначала отправляет `ouro:shutdown`, ждёт подтверждённого HTTP/SQL/worker drain и завершения child. По deadline разрешён fallback только к собственному tree; незавершённый drain не сообщается как успешный. SIGINT/SIGTERM, preparation failures и повторная остановка имеют явные exit outcomes. Windows требует настоящих child-process checks.

Runtime profile authority остаётся у actual service и existing OS profile mutex. Если сервис пережил parent, новый generation можно независимо подготовить, но второй embedded store не открывается до освобождения прежнего owner; launcher не удаляет mutex и не убивает найденный по порту чужой процесс. IPC disconnect инициирует existing graceful service stop; строгая гарантия уничтожения произвольного process tree из этого не следует. Именно generation isolation устраняет shared install mutation race, а не предположение, что все grandchildren умерли.

Default local profile явно installed-root `.ouro/postgres`, env files и внешние agent key files остаются в outer envelope. Absolute `OURO_DATA_DIR`/`DATABASE_URL` сохраняют operator authority. Relative local profile path разрешается относительно installed root, в соответствии с прежним release cwd; runtime получает absolute path. Service child **cwd=outer installed root**, чтобы сохранить default `resolveWorkspaceFolder(value??process.cwd())`; SQL/static/package/MCP/preload resources внедряются явно из generation artifact. Verification scratch остаётся вне generation рядом со stable profile или по explicit config. Не происходит поиска старых профилей, seed/reset, переноса/удаления пользовательских файлов или shared live PGlite. Backup/reverse-path proof — только закрытая собственная fixture copy и sentinel.

Stable outer MCP wrapper не читает `.env.local` и не добавляет ambient credentials: прежний bridge принимает process env и explicit token-file, включая исходную caller cwd семантику relative token-file. Backend получает explicit `mcpPath=outer/packages/mcp/bin/ouro-mcp.mjs` при config issuance; не выдаёт пользователю generation-specific absolute path. Consumer composition может переиспользовать уже экспортированные `runtimeConfiguration`/`startService`, без копирования routes/domain lifecycle. Missing BUILT artifact даёт fixed stderr diagnostic, без imports произвольного path или recovery credential fallback.

## Данные, source snapshot и очистка

Producer manifest перечисляет source closure и provenance. При preparation копируются только эти исходники/resources и canonical manifest/lock/tgz; `.env*`, keys, `.ouro`, user project folders, node_modules и чужие generation не копируются. Новая generation строится из одного завершённого source snapshot. Изменённые operator source files требуют явной политики: предложение сохранять bytes перечисленных installed files с новым effective input hash, не подменять их Git checkout и не добавлять arbitrary newly discovered paths. Результат fresh build и соответствие shipped manifest различаются в record. Root проверит эту политику до реализации; скрытая перепаковка user files запрещена.

Изоляция путей — не OS sandbox для произвольного malicious package/script: обещание относится к finite qualified npm/build graph и его явным output paths. Common npm cache не становится вторым application install tree и не считается user profile. Lifecycle scripts и native worker output paths аудируются; preparation не получает ненужную SQL/credential authority только ради ci. Runtime env/config загружаются отдельно после Node gate перед соответствующим build/start admission; synthetic fixtures доказывают отсутствие env/keys/profile copy и изменения только своего generation.

В первой версии **автоматического GC нет**. В частности, UNKNOWN/uncompleted generations и потенциальные surviving children не определяются по PID/возрасту и не удаляются при restart. Полностью известные failed generations также можно оставить до отдельной явной cleanup policy. Накопление disk usage является честным tradeoff; parent crash не оправдывает unsafe recursive cleanup. Релизные source/пользовательские файлы cleanup не затрагивает. Atomic allocation/pointer/own fixture cleanup path guards проверяются отдельно; shared working data не участвуют.

## Обязательная env compatibility зависимость

README обещает root `.env.local`; Next загружает её, current standalone service пока не загружает. Принятый отдельный [REC](runtime-environment-compatibility.md), включённый в эту ветку без production entry changes, сохраняет наблюдаемый production build/start порядок, inherited precedence, expansion и escaped dollars без Next runtime dependency. Включение REC выполняется до application/config imports, но **после Node gate**. Чтение только фиксированных env filenames установленного root; producer private env не читает/не пакует. Local/hosted wrapper flags и pre-file hosted validation не сливаются в новую конфигурационную систему. Build и start — разные процессы и независимо загружают актуальные файлы, как прежний launch. Выбранный bind port записывается до env loading; Next internal cache/processed controls не переносятся.

## Квалификация

| Gate | Нужное доказательство |
|---|---|
| Immutable producer | Dirty/untracked/private payload не входит; wrong ref/link/mode/private archive/mismatched protocol/tampered metadata отклоняются; existing different output сохраняется. |
| Independent install | Реальный извлечённый consumer, один npm ci, нет source dependency fallback/вложенных locks; отдельный перенос дерева в foreign cwd. |
| Preparation | Первый и повторный launch действительно делают ci с dev tools и fresh web/service build, включая inherited NODE_ENV=production; build failure не открывает профиль. |
| Node admission | Неподдерживаемый Node отклоняется раньше env read/parser/dependency import/ci/profile side effect; missing dependencies не маскируют gate. |
| Generation isolation | Concurrent preparations имеют разные dirs; настоящий parent-kill npm writer продолжает только старое дерево, новый ci/build проходит отдельно; UNKNOWN не выбирается/не удаляется; broken/foreign pointer не допускается. |
| Runtime ownership | Чужой occupied port не READY; normal stop, interrupted build, timer/child drain/deadline и parent-crash restart используют стабильный profile; surviving service сохраняет отказ второму PGlite owner. Windows/Linux имеют отдельные результаты. |
| Functional release | Existing six navigation/cookie assertions; raw negative assets/API/HEAD; persisted create/command receipt, progressive SSE, restart exact retry и sentinel; immutable protocol ESM/CJS/HTTP types/schemas/CLI и реальный runner outside install root. |
| Resource/env | SQL/MCP/preload/static paths от artifact, реальные env differential fixtures REC; secrets отсутствуют в logs/archive/browser assets. |

Browser binaries — отдельная capability; npm package наличия недостаточно. Linux CI должен выполнить strict HTML integrity, Windows host transformation не обходится фильтрацией/изменением headers. Full P5/cutover/Next removal/native/production acceptance не следуют из bounded checks.

## Оставшиеся технические вопросы и gates

- Frozen registry graph и fixed metadata slots реализованы и локально проверены; bounded source peer принят. Окончательный Linux CI ещё требуется. Source Node/npm dependencies не обновлялись.
- Actual protocol tgz/SRI выводятся из same-commit producer; Windows/Linux byte equality самого tgz не предполагается. Linux artifact/install/browser/strict HTML результат ещё PENDING.
- Проверить generation revision/root review: atomic allocation/publication, simultaneous preparation, interrupted/UNKNOWN trees, default start/build/MCP behavior и отсутствие общей mutation.
- Принять конкретную policy operator edits для shipped source snapshot и отсутствие automatic GC; доказать bounded pointer admission.
- REC уже подключён к independent consumer build. Подключить его к будущему outer build/start envelope с подтверждённым local/hosted/PORT порядком; hosted deployment/Docker по-прежнему отдельный scope.

Эти вопросы являются работой реализации и проверок; принятые D01–D16 повторного выбора не требуют.

## Отдельная проверка ownership model до launcher source

Root принял структурный producer design/REC и generation direction, но не признал parent-only mutex достаточным: после смерти parent npm/build/service child может ещё писать. Автоматический stale-marker reclaim по PID/таймеру запрещён. Текущий producer/source-build proof не запускает end-user launcher и не получает его полномочий. Producer использует отдельный unique sibling protocol stage и не удаляет его автоматически после неоднозначного исхода; он не входит в materialization output или source release.

Pinned [Node24.19 libuv Windows process source](https://raw.githubusercontent.com/nodejs/node/v24.19.0/deps/uv/src/win/process.c) использует non-inheritable global Job с kill-on-close для назначенных non-detached direct children. Silent breakaway не делает произвольные grandchildren членами Job; ERROR_ACCESS_DENIED при назначении может быть проигнорирован. Не-detached CreateProcess предшествует назначению, поэтому один source review не доказывает отсутствие crash window. [Unix source](https://raw.githubusercontent.com/nodejs/node/v24.19.0/deps/uv/src/unix/process.c) сам по себе не даёт аналогичной parent-death политики.

До launcher source нужны собственные реальные witnesses: kill только созданного parent → наблюдение реального npm lifecycle shell/Node writer, native esbuild worker, direct Node/service child; затем собственный cleanup и повторный admission. Наличие файла heartbeat/живого процесса после parent death — отрицательное evidence, не разрешение обходить owner. Windows результат не переносится на Linux; CI/platform gaps называются явно.

Shared SQLite leases у Node workers рассматриваются только вместе с явной child lifetime/handoff моделью. Они сами по себе не покрывают native writer, shell lifecycle и detached children. Вариант native write:false + owner writes требует отдельного настоящего proof и npm lifecycle audit. Глобальный NODE_OPTIONS hook не добавляется. Если без нового OS owner автоматический restart не доказан, persistent admission marker может оставаться fail-closed после crash; это конкретное ограничение с recovery contract, а не успешная автоматическая crash recovery.
