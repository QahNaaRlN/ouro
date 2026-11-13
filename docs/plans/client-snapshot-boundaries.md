# CSB · Журнал переноса двух клиентских модулей

Дата: 2026-11-04. Основание: explicit root assignment; ветка `codex/client-snapshot-boundaries`, база `f5a7caf181d62e5971368862dfa649f3c8bb0039`. [SDD](../specs/client-snapshot-boundaries.md) создан до source изменений.

- Реализация: IMPLEMENTED_LOCAL, ограничена двумя leaf modules и их импортами.
- Baseline regression: **35/35 GREEN** до source изменений.
- Source/runtime AST equivalence: **PASS**, включая прежние type declarations и public exports.
- Types/builds/regressions/browser: **LOCAL_PASS**, результаты ниже.
- Full CI/Linux/PostgreSQL: NOT_RUN; не приравнивается к локальным результатам.

Все действия ограничены этим worktree и собственными synthetic fixtures. Старый HRP worktree оставлен чистым для root publication; push/PR не выполняются. Установки нужны только из неизменённых lockfiles нового worktree; версии Node/dependencies и host environment не меняются.

## Выполненный перенос

`lib/project-snapshot.ts` перенесён в `packages/client/src/lifecycle/project-snapshot/project-snapshot.ts`; его `index.ts` именованно экспортирует ровно прежние runtime/type symbols. Server `lib/http-command-receipt.ts`, HTTP proof и session используют один pure leaf, не общий client/frontend barrel. Compatibility normalizer существует в одном месте.

`lib/project-subscription.ts` перенесён в `packages/client/src/http/project-subscription/project-subscription.ts` с собственным explicit public index. EventSource/DOM event types и существующий URL остались HTTP adapter responsibility. UI `workspace-project-view` использует существующий port `ProjectConnectionStatus`; компонентный runtime JS тождественен прежнему. Публичные типы обоих перенесённых модулей, включая optional поля и mutability, не менялись.

Старые два файла удалены, все актуальные source/test imports обновлены. External package exports не ссылались на эти внутренние lib paths, поэтому compatibility re-export shim не понадобился. Historical документы прошлых историй сохранены как evidence прежних путей. В `pureLegacyFiles` удалены ровно эти два entries (11→9); новых исключений нет. Отдельный finite legacy import baseline остаётся прежним: 16 edges.

До source изменений прочитаны CONTRIBUTING, принятые D01–D16 и установленное Next 16.4.3 руководство `05-server-and-client-components.md`. Root/service/web зависимости установлены offline из неизменённых lockfiles: 208/130/81 packages. `allowScripts` не расширялся; предупреждения о неразрешённых postinstall не выдаются за product RED. Protocol собран только как обязательная подготовка существующих dependencies.

## Equivalence evidence

Сравнение с immutable base `f5a7caf181d62e5971368862dfa649f3c8bb0039` канонизировало CRLF/LF. Полный source text обоих implementation files совпал после **только** необходимой подстановки import paths. TypeScript AST printer дополнительно подтвердил равенство всех non-import statements, включая прежние type declarations; old export symbols/types совпали с named public index exports, без добавлений. Statement SHA-256:

- Snapshot: `2407b7b1fc02781a4b51ac368c00f53e42f60f54178a784672c9e7756266d163`.
- Subscription: `38a3175c41dd7e79d410b7b3bdbc2d331fccb49bb5128c01dd71cccac84c5ddf`.

`transpileModule` со стабильными ES2022/ESNext/react-jsx options дал идентичный runtime JS для UI component до/после замены type import. AST set comparison guard подтвердил ровно два удалённых pureLegacy entries, ноль добавленных и отсутствие обоих старых файлов. Поиск актуальных source imports не нашёл прежних lib paths. Это структурный refactor: нового поведения и нового domain RED здесь нет; missing imports/dependencies не объявлялись RED, implementation-mirroring tests не добавлялись.

## Локальные проверки

Все команды используют закреплённый `D:/PersonalProjects/ouro-worktrees/react-vite-foundation/.operations/runtime/node-v24.19.0-win-x64/node.exe`; PATH менялся только внутри собственного процесса для дочернего Next/Vite.

| Проверка | Команда после имени Node | Результат |
| --- | --- | --- |
| Existing baseline до переноса | `--no-wasm-code-gc --import tsx --test --test-concurrency=1 tests/project-snapshot.test.ts tests/live-review.test.ts tests/project-session-http.test.ts tests/project-session-runtime.test.ts tests/verification-legacy-receipt.test.ts` | **35/35 GREEN** |
| Snapshot/SSE/session/legacy projection, actual HRP SQL/TCP/hash/UNKNOWN/epochs, agent adoption и negative architecture fixtures после переноса | `--no-wasm-code-gc --import tsx --test --test-concurrency=1 tests/project-snapshot.test.ts tests/live-review.test.ts tests/project-session.test.ts tests/project-session-http.test.ts tests/project-session-runtime.test.ts tests/verification-legacy-receipt.test.ts tests/http-command-receipt.test.ts tests/agent-proposals-store.test.ts tests/architecture-boundaries.test.ts apps/service/tests/http-receipt-proof.test.ts` | **98/98 GREEN**, 0 skipped |
| Root/service/web strict types | `node_modules/typescript/bin/tsc --noEmit`, та же команда с `-p apps/service/tsconfig.json` / `-p apps/web/tsconfig.json` | PASS |
| Service production bundle | `apps/service/scripts/build.mjs` | PASS |
| Standalone web production bundle | `apps/web/node_modules/vite/bin/vite.js build --config apps/web/vite.config.ts` | PASS |
| Next production bundle | `node_modules/next/dist/bin/next build --webpack` | PASS |
| Настоящий browser fetch/WebCrypto после production build | `node_modules/@playwright/test/cli.js test --config=playwright.receipt-proof.config.ts` | **2/2 GREEN**: historical empty replay и отдельный fresh COMMIT после потери ответа подтверждаются только explicit exact retry |
| Architecture / historical HTTP inventory / conventions | `scripts/check-architecture.mjs`, `scripts/check-migration-baseline.mjs`, `scripts/check-conventions.mjs` | **0 violations**, 835 files / 16 finite legacy edges; **47/59 PASS**; conventions PASS |
| UI style boundary | `scripts/check-ui-styles.mjs` | 0 violations; прежний остаток 17 ordinary CSS / 10 inline-style files |

Service build manifest проверен фактически: единственные inputs из client — `lifecycle/project-snapshot/index.ts` и его implementation. HTTP subscription, другие client runtime modules и frontend туда не попали. Browser fixture сохраняет уже описанный HRP seed-source/bundled-Next Yjs warning; collaboration runtime в этом fixture не квалифицируется.

`git diff --check` PASS. DB/core/MCP/protocol, API wrappers/historical baseline/HRP adaptation map, store/stream/drain, frozen intent dispatch, другие legacy helpers, dependency manifests/locks, Node version и UI styles не изменены. Protocol generation оставил только semantic-zero EOL diff, проверенный и затем убранный до commit. Новые source comments — русские JSDoc; существующие комментарии перенесены без массового перевода.

Full CI, Linux и external PostgreSQL в этой истории **NOT_RUN**, не LOCAL_PASS. Полный hFSD/Tailwind/native integration и live cutover не входят в этот перенос. Финальный peer review и интеграцию в эпик выполняет root; локальный scoped commit не является публикацией или полной приёмкой миграции.
## Синхронизация с окончательными receipt/type prerequisites

Root source review подтвердил pure leaf/public API, исправленную HTTP responsibility и отсутствие поведенческих изменений. После объединения `9d09caf`/эпика`bb1d1a2` перенесён и fixture fix явного migration path из HRP (не source normalizer). Root/service strict types PASS, protocol71 build PASS; architecture **850files/0violations/11finite framework edges** после принятого DTO-среза. Старые source-файлы отсутствуют, актуальная таблица владельцев теперь ссылается на новые public indexes.

Первая root-команда проверки остановилась на отсутствующей `.operations` directory до запуска tools; после явного создания папки команды действительно выполнены. Это setup failure, не RED. Ранее98 regressions и2 browser cases сохраняют собственный проверенный source scope; полный combined CI_PENDING.
