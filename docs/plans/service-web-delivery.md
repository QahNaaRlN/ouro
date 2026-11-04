# SWD1 · Журнал actual service + built Vite

Дата: 2026-11-04. Ветка `codex/service-web-delivery`, база `529e221cb090d593b6ad055fb73594d6cdeb5c9e`; [SDD](../specs/service-web-delivery.md).

## До source work

- Создан собственный worktree `D:/PersonalProjects/ouro-worktrees/service-web-delivery` от точного согласованного epic head.
- Прочитаны D13/P5, CONTRIBUTING, current release launcher/packer и tests, runtime Node gate, actual service build/main/config/static/lifecycle, existing artifact/runner/ownership/resource qualification и все6 Vite navigation/cookie assertions.
- Выявлено: service уже поддерживает explicit staticRoot, ordinary artifact/foreign cwd и graceful IPC; current browser6 пока используют Vite proxy → Next. Artifact dependencies по-прежнему source-installed — consumer independence не доказана.
- Root принял split SWD1/SWD2. Текущий slice — bounded actual same-origin qualification. Production launch/pack/Docker не меняются. Future SWD2 сохраняет не только `npm run launch`, но и **ci + fresh build**; prebuilt verification не подменяет preparation contract.
- Новый SDD описывает test child/profile ownership, joint SQL/SSE/MCP/restart, negative assets/API/HEAD, mandatory CI ordering и future separate consumer source tree/npm lock/dependencies/risks.

Статус: **DESIGN_ACCEPTED / IMPLEMENTATION_NOT_STARTED**. Source/deps installs/build/tests: **NONE / NOT_RUN**. Рабочие profiles/DB/releases/production не открывались; dev pnpm/locks и consumer tree не менялись. Independent consumer install/full P5/Next removal/native acceptance: **NOT_QUALIFIED**.

Следующий шаг: подготовить dependencies/builds из согласованных locks, затем test-only actual-service composition и meaningful qualification. Setup failure не считается RED. Scoped source commit только после root peer review; no push/PR.

## Реализация

Новый `playwright.service.config.ts` выполняет те же6 navigation/cookie assertions против одного actual service child с built Vite static root. Global setup/returned teardown использует прямой ordinary Node entry и IPC shutdown, а не Vite/Next webServer. Readiness связана с собственным child, health и UI; temp profile/foreign cwd/workspace принадлежат fixture, environment не наследует DATABASE_URL, SMTP/GitHub credentials и NODE_OPTIONS/NODE_PATH. Ни рабочие profiles, ни production/release запуск не выполнялись.

Service fixture запускает actual `dist/main.mjs` из отдельного Unicode/space-containing cwd. Joint test сохраняет folder project/command, наблюдает progressive SSE, подключает выдаваемый built MCP stdio bridge, требует graceful shutdown/закрытие stream, затем открывает тот же file profile и получает точные сохранённые receipts. Foreign cwd остаётся пустым. Все child/profile resources освобождаются перед own-temp cleanup; fallback после deadline не выдаётся за graceful PASS и не квалифицирует произвольные detached descendants будущего consumer launcher.

CI checks собирают web до новых service artifact tests; browser job отдельно устанавливает service dependencies, строит его и обязательно запускает новый actual-service gate. Production launcher/packer/Docker/root scripts не менялись. Consumer install/fresh build, source closure и pnpm workspace остаются отдельным SWD2.

## Исправления qualification fixtures и Windows observation

1. Existing positive UI probe использовал APIRequestContext `Accept:*/*`, а service SPA policy требует `text/html`. Root одобрил explicit `Accept:text/html` только для положительного navigation probe; все6 assertion bodies/expected сохранены, название same-origin стало нейтральным. Отрицательные `*/*` и `application/json` matrix остаются404. Static policy не расширялась.
2. Первый catalog replay assertion ошибочно ожидал200/created:false. Actual `lib/store.ts:568–577` возвращает сохранённый original `{created:true}` + `replayed:true`; Next и service wrappers поэтому сохраняют201. Fixture исправлен на201/created:true/replayed:true, same project и ровно одну запись каталога. Domain/HTTP код не менялся; это ошибочное expectation, не product RED.
3. Windows TCP HTML bytes содержат добавленные `local.adguard.org` scripts. Built `index.html` **686 bytes**; latest node:http payload **1183 bytes**, native raw socket тоже получил injection (wire1200 bytes с framing). Direct handler/Web pipeline до TCP возвращают exact686 bytes. Source file не изменён; host settings, filters и service headers не менялись.
4. Root потребовал сохранить отдельный strict gate без skips/фильтрации. Final strict HTML case остаётся **FAIL / NOT_QUALIFIED on Windows**: expected686/actual1183, injection=true, GET Content-Length=null, HEAD Content-Length=null, Transfer-Encoding=chunked. Остальные UI refs/MIME/cache/HEAD semantics, точные JS/CSS/woff2 TCP bytes/lengths и raw negative matrix выполняются независимо. Linux CI обязан доказать тот же exact HTML gate; локальная host transformation не является CI exception.
5. В первом direct-pipeline probe whole built index и legacy fixture одновременно загрузили разные installed Yjs instances. Это test-process import warning без обмена domain/CRDT objects; probe сужен до actual static handler + Web pipeline source, без загрузки всего backend bundle в parent. Actual service artifact по-прежнему исполняется отдельным ordinary child, а strict TCP test не ослаблен.

Новых production behavior changes и product regression fixes в SWD1 не потребовалось; artificial RED через отсутствующий dependency/server не создавался.

## Локальное evidence

Runtime: `D:/PersonalProjects/ouro-worktrees/react-vite-foundation/.operations/runtime/node-v24.19.0-win-x64/node.exe`,24.19.0. PATH только process-local. `npm ci` по прежним locks: root208,web81,service130 packages; manifests/locks/allowScripts не менялись. Существующие esbuild install-script notices не меняют policy.

| Проверка | Фактический результат |
| --- | --- |
| Protocol/service/web builds из own source tree | PASS; ordinary service artifact и actual Vite dist созданы, consumer independence этим не доказана |
| New TCP/direct tests: `--no-wasm-code-gc --import tsx --test tests/service-web-delivery.test.ts` из apps/service | **8 PASS / 1 FAIL / 0 skipped**. Единственный FAIL — strict Windows HTML TCP byte/HEAD-length gate выше |
| `playwright test --config=apps/web/playwright.service.config.ts` | **6/6 PASS**, actual single service origin, foreign cwd/temp file profile, graceful IPC teardown; Next/Vite listener отсутствует |
| Existing static/artifact/node-contract/runtime-lifecycle tests, serial ordinary child fixtures | **13/13 PASS**,0 skipped; включая real unsupported Node before application import, file receipt restart, killed-child restart и profile ownership/drain |
| Final service/web/root strict types | PASS |
| Architecture / historical baseline | **851 files / 0 violations / 11 existing exact edges**; **47 routes / 59 method exports PASS** |
| Styles / conventions / diff | **16 ordinary CSS / 10 inline files / 0 violations**, PASS; production CSS/debt/ledger не менялись |

Root peer review fixture startup/readiness/IPC/forceOwned/cleanup, direct/TCP tests, CI ordering и unchanged navigation assertions принят до commit; scoped blockers не указано. Generated protocol EOL differences подтверждаются semantic-zero и убираются отдельно от source scope.

Full local qualification **не GREEN** из-за strict HTML transformation. Linux CI, independent consumer install, full P5, cutover/Next removal/native/production acceptance остаются **PENDING / NOT_QUALIFIED**. No push/PR; scoped source review не подменяет эти gates.
