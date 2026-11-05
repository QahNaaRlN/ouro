# Клиентские ошибки · инвентарь, граница и RED cases

Дата: 2026-11-04. Planning base `f0b25b32c1d1d22f21722d6a81cfcd22e0552716`, ветка `codex/client-error-policy`. [Проект SDD](../specs/client-error-policy.md) подготовлен до source changes.

| Часть | Статус |
|---|---|
| Accepted D04/D06 и current implementation audit | COMPLETE |
| Предложение минимальной вертикали | DESIGN_ACCEPTED до source |
| Source/dependencies | IMPLEMENTED_LOCAL, lockfiles unchanged |
| RED/GREEN | Actual core4+Query2 RED→GREEN; дополнительные regressions ниже |
| Types/build/browser | BOUNDED_QUALIFICATION, фактические результаты ниже |
| Root source peer | REVIEW_ACCEPTED после requested fixes и UNKNOWN closure |
| Scoped commit | Разрешён после финальных проверок, без push/PR |
| Full CI/merge | NOT_RUN |

## Готовые части и доказательства чтения

Проверены existing `ClientError`/ErrorReporterPort/occurrence DTO, `normalize-client-error.ts`, ProjectSession capture, catalog Query normalizer/queryFn, общий QueryClient factory, ProjectRuntimeProvider/common runtime, useProjectSession, Next layout и Vite standalone/router. Готовые части не обозначаются как NOT_STARTED и не заменяются дубликатами.

Существующие tests уже защищают важные свойства: `project-session-http.test.ts` сохраняет incompatible positive receipt как UNKNOWN при rejecting reporter; `catalog-read-query.test.ts` проверяет sync/async reporter failure, safe sourceId/message и чистую catalog normalization; `apps/service/tests/service-errors.test.ts` ограничивает HTTP diagnostic fields и исключает секреты. Это инвентарь existing tests, **не повторный запуск** в planning ветке. Service main пишет structured JSON в stderr, background owner изолирует sink failures; backend код здесь не переносится.

## Исходная карта затронутых файлов

| Область | Existing/new files | Минимальная ответственность |
|---|---|---|
| Общий клиентский контракт | existing `packages/client/src/ports/client-error.types.ts`, `ports/index.ts` | Один ClientError/AppError alias, unexpected kind, severity и совместимый occurrence union; без второй taxonomy |
| Нормализация/capture | existing `lifecycle/normalize-client-error.ts`; new public leaf `lifecycle/client-error-reporting/` | Pure contextual normalizer, safe bounded reporter/capture; прежний entry и transport fallback сохраняются |
| Query policy | new public `packages/frontend/src/api/error-policy/`; existing `api/project-session/project-session.query.ts` | Typed ownership/meta и injected cache callbacks; один QueryClient |
| Existing operations | existing `api/catalog-reads/catalog-read.query.ts`, `components/useProjectSession.ts` | Explicit inline/operation meta и reuse capture; без смены keys, cancellation, retries, UNKNOWN outcomes |
| Composition | existing `packages/frontend/src/app/project-runtime/create-project-runtime.ts`, `components/ProjectRuntimeProvider.tsx` | Одна injected reporter instance для всех трёх capture owners |
| Renderer | new public `packages/frontend/src/shared/ui/error-boundary/{index.ts,AppErrorBoundary.tsx}` | Client render fallback и безопасное report; без parent/context/legacy imports |
| Tests | new normalizer/reporter/policy tests; focused browser fixture для boundary/async; existing regressions | Meaningful RED и фактический runtime; без production fault hooks |

Точные filenames нового pure leaf и exports уточняются peer review; таблица не разрешает implementation до согласования. `ProjectSession` capture/HTTP adapters не переписываются массово. Если для единого DTO потребуются изменения auth/outcome алгоритмов или всех legacy handlers, их следует вынести из этой атомарной вертикали. Shared appearance/native foundation и entity work public API не затрагиваются.

## Предлагаемые meaningful RED cases

1. **Pure normalization:** unknown Error/string/object с synthetic secrets получает нейтральное unexpected AppError без raw stack/cause/body; повторная normalization не вызывает console/reporter/network/ID factory. Existing transport entry по-прежнему даёт network/AbortError→cancelled, сохраняет code/kind/status текущих безопасных ClientError. Проверенный plain DTO не зависит от prototype/instanceof; malformed/cyclic value не ломает normalizer.
2. **Occurrence dedupe:** один explicit ID через два report вызова даёт один sink event; два разных IDs с одинаковым текстом дают два. Проверить объявленную eviction границу256, без unbounded retained history и без обещания вечной дедупликации. Generic renderer event не получает выдуманный epoch/actor.
3. **Redaction/failure isolation:** extra raw fields, token-like URL/source, payload, document, stack и getter/serialization traps не попадают в sink. Sync throwing и async rejecting sink не заменяют исходный result/rejection, не меняют command outcome, не создают recursive report. Сам normalizer не логирует.
4. **Query/mutation matrix:** field/inline/boundary/toast/silent × suppressToast × contract/network/access/cancelled/unexpected. Один primary UI owner; schema error не обходит suppression/boundary. Diagnostics независимы от notification flag. Принятый cache хранит нормализованный тип из fn, а не только callback projection. Top-level throwOnError не прячется в meta. Notification callback отсутствует в production bootstrap.
5. **Capture ownership:** current project/catalog operation репортит один occurrence, глобальный cache его не дублирует. Cache-owned failure имеет один собственный capture; boundary-owned Query не получает cache toast/report. Две независимые operations с одинаковой ошибкой не теряются. Использовать реальные QueryClient/QueryCache/MutationCache, а не копию их поведения.
6. **Renderer и async:** настоящий React client descendant throw даёт доступный neutral fallback и один безопасный occurrence; обычные children проходят. Boundary не объявляется catch для SSR или rejected Promise. Отдельный async helper сохраняет success и нормализует/rethrows rejection с одним report. Нет reload/reset/command retry и изменений pending UNKNOWN intents; parent runtime остаётся жив.
7. **Compatibility:** existing session/catalog/identity/receipt tests сохраняют outcomes, cursor, same-body/request/actor exact retry, stale epochs, cancellation и reporter-failure isolation. Renderer integration не создаёт второй QueryClient/provider/SSE owner. Не ослаблять утверждения ради нормализованной ошибки.

Часть RED относится к отсутствующим capabilities и будет проверена после подготовки working baseline; missing dependency/import/файл не считается meaningful RED. Сначала написать failing behavioral assertions против существующих callable paths или минимально введённого контракта, затем реализовать принятое поведение. Точные tests/counts фиксируются по фактическим запускам, не этим списком.

## Порядок после peer review

1. Согласовать scope/API и актуальный clean parent: root сейчас интегрирует другие истории. До source начала синхронизировать planning ветку и повторить bounded inventory по затронутым файлам. Existing profiles/Next artifacts других worktrees не использовать для нового browser capture.
2. Прочитать actual AGENTS/установленные Next guides и нужные installed React/Query types; dependencies только из неизменённых lockfiles с pinned Node24.19/process-local PATH. Baseline существующих error/session/catalog/receipt tests — до production changes.
3. Ввести pure normalizer/reporter и пройти RED→GREEN, сохраняя compatibility class/порт. Затем Query ownership matrix и одну injected reporter instance. Наконец renderer boundary и explicit async capture; не начинать все legacy migrations одновременно.
4. Проверить root/web types, Next/Vite builds, resolved architecture/public API, style guard и diff. Для React boundary нужен реальный client browser test: SSR не доказывает componentDidCatch. Focused fixture допускает controlled synthetic failure только в test entry, без production hooks, masking и подмены canonical facts.
5. Existing production route regressions проверяют обычную работу обеих оболочек и UNKNOWN recovery с pass-through boundary. Диагностический browser fixture квалифицирует только свой scoped failure path. Полный CI/нативный Meridian/production telemetry не приписываются локальному результату.

Исходный план выше был записан до реализации. Далее приведены фактические результаты; полный CI, публикация и интеграция пока не выполнялись.

## Реализация и сохранённые границы

Root разрешил реализацию минимального среза. Прочитаны actual AGENTS, установленные Next16.4.3 guides use-client/server-and-client-components и TanStack types/cache callbacks. Dependencies установлены offline из неизменённых lockfiles:208root/81web; protocol71schemas собран как existing dependency. Generated EOL drift проверен semantic-zero и убран только в bin/schemas/version. Использован Node24.19/process-local PATH; allowScripts и host configuration не менялись.

ClientError сохранил четыре constructor аргумента и пять transport kinds; добавлен unexpected и детерминированный severity getter. AppError — alias того же класса. Generic normalizeAppError получает нейтральный unexpected fallback и structural DTO decoder без raw message/stack/cause. Existing normalizeClientError сохраняет network fallback и **не декодирует произвольный plain DTO в access**: иначе могла бы измениться ветка отзыва доступа в ProjectSession. Дополнительный regression сначала показал actual access вместо network и затем GREEN.

ErrorReporterPort расширен совместимым scoped/unscoped occurrence union; renderer/query не получают выдуманные epoch/actor. Correlation/request IDs копируются только из явно переданных допустимых полей, не вычисляются из пользователя. Safe reporting пересобирает whitelist DTO из data descriptors, не сериализует вход целиком и не читает посторонние getters. Severity зависит от kind. FIFO256seen IDs принадлежит reporter через WeakMap; после eviction ID может зарегистрироваться снова — это ограниченное окно. Reporter failures изолированы без resend/рекурсивного log.

Weak association связывает failure с явно переносимым occurrence. Новый capture по умолчанию создаёт новый occurrence даже при reused Error object: дедупликация не основана на тексте/Error identity. Propagation разрешается только explicit reuseOccurrence:true в boundary. Отдельный regression показал1вместо2 независимых events и затем GREEN. ProjectSession/catalog/cache создают новые occurrences с исходной metadata; boundary переиспользует ID при Query→render propagation. Нет сильного unbounded списка исключений.

Query factory получает cache callbacks с прежними defaults. Typed meta задаёт UI path/suppression/report owner; meta.throwOnError запрещён типом never. Policy не вызывает caller throwOnError predicate повторно: conditional predicate считается boundary-capable для подавления конкурирующего notification, actual throw остаётся у React Query. Current project/catalog queries/mutation/explicit refresh помечены inline/operation-owned. Error нормализуется до throw у своего owner; command UNKNOWN/rejected остаётся outcome value. Production notification callback отсутствует, toast UI не добавлен.

ProjectRuntimeProvider создаёт одну reporter instance для runtime QueryClient/session, catalog environment и boundary. Common runtime больше не создаёт implicit console sink; вне browser provider отсутствующий reporter остаётся отсутствующим. Boundary внутри existing providers заменяет только рендер children, сохраняя owner/cache; в нормальном режиме не добавляет DOM wrapper. Fallback имеет role=alert, нейтральный текст/код и собственные Tailwind utilities. Нет reload/reset/command retry, router/context dependency, Form/i18n/shared-style изменений.

Explicit async pilot — existing catalog queryFn catch: captureClientError возвращает нормализованную ошибку для прежнего throw. Новая Promise-обёртка вокруг запроса не добавлена, freshness/cancellation/ordering не перестраивались. ProjectSession сохраняет capture и решения auth/admission/UNKNOWN. Generic capture проверен также реальным rejected Promise отдельно от renderer.

## Baseline и meaningful failures

До production changes existing session/http/runtime/catalog/service-error baseline **51/51PASS**. Новые tests вызывали existing functions, а не отсутствующие imports: **4actual core/reporting RED** (runtime→network, повтор occurrence, extra fields, повтор failing sink) и **2Query/Mutation RED** (нет cache policy). Затем6GREEN. Настоящая Query/Mutation matrix:2operation×6kind×5path×2suppression =120ветвей; original stored error сохраняется. Дополнительные DTO, severity, independent reused Error, explicit propagation, transport fallback и untouched throw predicate дают10new unit tests.

Renderer causality проверена отдельно: после pure implementation временно восстановлен **literal original f0 ProjectRuntimeProvider** из immutable git. С тем же browser fixture —2actual failures (нет fallback), async1PASS. Это original-provider RED, не утверждение, что renderer test был написан до любого pure source изменения. После восстановления нового provider3GREEN. Временная подстановка не оставлена в diff; backup/log в .operations. Controlled failures только в test entry, production fault hooks отсутствуют.

Первый combined прогон57/57PASS; с полными новыми tests и existing verification SSR — **65/65PASS**,0skipped. После последнего explicit default-propagation fix затронутые10new tests и renderer3/3 повторноGREEN. Existing domain/HTTP callsites задают new occurrence явно; boundary теперь явно propagation.

## Browser и structural evidence

| Scope | Фактический результат |
|---|---|
| Real-provider renderer/async fixture |3/3GREEN6.4s: raw render failure→neutral fallback; Query→render один occurrence; actual catalog malformed HTTP→operation-owned CATALOG_CONTRACT без fallback |
| Narrow fallback |390×844, без overflow; PNG test-results/client-errors просмотрен визуально, raw secret отсутствует в DOM/application diagnostic |
| Existing catalog lifecycle |4/4GREEN8.9s: A/B/A, same actor epoch, disabled/unsupported, ignored abort и drafts |
| Собранный Vite shell |6/6GREEN25.0s: direct routes/history, help/links, API fallback и cookie-clearing POST |
| Actual browser receipt/WebCrypto |2/2GREEN15.7s: historical/fresh committed200 потерян, UNKNOWN и explicit exact retry |
| Existing Next verification |3/3GREEN1.2m: real runner/import/manual/stale, keyboard, exact request/proposal navigation |

Все profiles собственные свежие, предыдущие protected baselines не использовались. Единственный controlled HTTP failure — test route, без создания canonical facts. Application console spy выделяет только ouro/client; framework console не маскируется. Dedicated renderer config имеет root test-results/client-errors с trace/screenshot на failure и обязательный CI шаг, без blanket skip/ignore.

До peer unique-handle исправления AST четырёх модулей совпал относительноf0 после удаления imports/meta, diagnostic statements и runtime reporter injection (.operations/error-domain-equivalence.json). Это evidence предыдущего этапа, **не утверждение final complete AST/error identity**. Финальная проверка .operations/error-authority-equivalence.json дополнительно исключает определение capture в ProjectSession и catalog capture/normalization initializer. Остальные algorithms statements — keys/freshness/cancellation, payload/cursor/permission branches, Query setters и leases — exact. Capture теперь намеренно возвращает отдельный error handle; старое равенство ссылок ошибок при независимых capture не обещается.

Предварительные Next/Vite types/builds PASS, Vite11.71s/12.57s. Финальные обе сборки frozen source после default-propagation fix **PASS**, включая Next strict type phase и отдельный web tsc; финальный Vite11.03s. Architecture882files/0violations/11exactlegacyedges, styles5ordinary CSS/4inline files/0violations. Machine ledger, finite baseline, manifests/locks неизменны. Полный визуальный CSS parity приложения этой error story не заявляется.

## Ограничения

Qualification относится к application reporter events/fallback, **не глобальному очищению console**. Installed React production defaultOnCaughtError вызывает console.error(error); root/framework options в минимальном срезе не менялись. Это передано root peer. Нет обещания catch для SSR/bootstrap, всех handlers/subscriptions или window unhandled events. Backend reporters сохранены; сквозная client/service correlation, внешний sink, queue/retention/delivery и production monitoring не реализованы.

Recovery/reset UI намеренно не добавлен: сохранение runtime/UNKNOWN не равно готовому восстановлению после любого render failure. Form fields, toast UI/presenter dedupe, native Meridian и global coverage остаются отдельными историями. Full CI/Linux/native/owner acceptance всего D04/D06 **NOT_RUN / NOT_CLAIMED**. Source frozen после принятого peer; публикация и интеграция передаются root.

## Конкретный peer case: immutable propagation handle

Root peer обнаружил воспроизводимую ошибку первого варианта: один ClientError E независимо capture-ится как eventA и eventB, first===second===E; последующий explicit propagation first через другой reporter получает eventB/новую scope. Actual RED .operations/error-issued-handle-red.log подтвердил event-B вместо event-A. Root принял bounded fix без изменения нормализатора транспорта или Query stored error.

Новая операция создаёт уникальный ClientError handle с теми же code/message/kind/status и отдельной immutable occurrence association. Existing normalizeClientError(E)===E сохраняется. Session/catalog теперь используют возвращённый handle перед прежним throw; это явное изменение технической error identity, а не прежний complete AST equivalence claim. Pure issued handle→occurrence никогда не перепривязывается. Explicit propagation first и second через другой reporter сохраняет соответственно A/epoch1 и B/epoch2; также проверен issued render handle.

Cache callbacks используют отдельный metadata-only reportClientErrorFailure, **не клонируют и не устанавливают cached error**. Если raw input наблюдался с несколькими независимыми IDs, его alias становится ambiguous, а не latest-owner. Boundary в таком случае создаёт новый unscoped render occurrence без чужого epoch. Для надёжной propagation операции возвращают собственный уникальный handle до throw. Query tests по-прежнему проверяют stored error===исходная ошибка fn.

После fix **67/67PASS**, включая12new tests,51legacy/access/UNKNOWN/catalog/service cases и4verification SSR. Последний renderer3/3GREEN22.7s подтверждает propagation через настоящий Provider и async capture; повторная metadata-only ветка не создаёт второй report. Финальный Vite strict types/build **PASS26.17s**. Next сначала обнаружил только widened union в scoped test helper; он уточнён as const satisfies без ослабления production type. После этого финальный Next production build/strict type phase **PASS**. Это test-typing failure, не product RED.

Conditional throwOnError predicate policy намеренно не вычисляет: no-toast в cache является консервативным предотвращением второго UI-пути, **не автоматическим UI fallback**, не заменой результата predicate и не указанием React Query что-либо бросать. Known queries остаются inline/operation-owned. Source после этого peer fix frozen; дополнительные Next/window/framework hooks не добавлены, open bootstrap capture остаётся отдельным объёмом.

## Последний bounded fix и UNKNOWN browser closure

Root отдельно принял fresh unbound handle до occurrence factory. Две actual RED проверки (.operations/error-unbound-red.log) показали, что metadata failure и cancelled/no-report возвращали прежний issued handle. Теперь новая операция заранее получает свежий объект с теми же code/kind/message/status; при отсутствии диагностического occurrence он остаётся unbound. Последующий renderer capture получает новый unscoped occurrence, а не старый epoch. normalizeClientError identity по-прежнему сохранена. **69/69PASS** в .operations/error-unbound-final-regressions.log, затем14focused tests PASS, включая conservative true/false throwOnError predicates; root/web strict types PASS после production fix. Полные Next/Vite builds непосредственно до этого узкого fallback-return fix сохранены; root разрешил final bounded types/CI вместо дополнительного повторения обеих сборок.

По root peer добавлен четвёртый meaningful browser case на настоящем ProjectRuntimeProvider/runtime и actual workspace-intents manager. В synthetic fake project child арендует настоящую session lease и отправляет frozen POST через default HTTP port. Test route.abort прерывает ответ; это **не backend commit proof**. Получен UNKNOWN, проверены wire bytes через postDataBuffer и исходный frozen body с whitespace, requestId/version, actor/project headers и соответствующий RAM record. Затем child render throw запускает fallback и effect cleanup: lease.release действительно переводит сохранённую session в active:false, ровно один release.

После cleanup RAM pending record целиком равен прежнему: body/requestId/actor/project/version/URL/key/status/uncertain сохраняются. Неизменный original FrozenProjectCommandIntent отдельно сохраняет исходные accessEpoch12/hostEpoch3; эти epochs не выдаются за дополнительные поля WorkspaceIntent manager. Один и тот же зарегистрированный Provider beforeunload listener остаётся, синтетический beforeunload event получает defaultPrevented. На границе проверены ровно один aborted POST и отсутствие нового POST после fallback/двух animation frames. Пакет не сбрасывает intent, не отправляет retry и не создаёт canonical facts;2существующих real receipt browser cases остаются отдельным commit/lost-response proof.

Этот case уточняет сохранение состояния: **Provider/runtime/QueryClient instance и отдельный RAM intent manager остаются; children unmount**. Child hooks освобождают leases, последняя lease завершает ProjectSession и её Query projection. Нельзя объявлять сохранёнными все локальные React drafts или принятую session snapshot только из-за живого Provider. Тест не доказывает durable RAM persistence через reload/process restart, trusted browser dialog или native WebView.

Новый UNKNOWN case прошёл в первом пакете за3.5s. Первый старый mobile case тогда остановился на page.goto/load30s до heading/failure assertion; остальные3passed. Это navigation/setup failure, не product RED UNKNOWN. Trace/context сохранены в .operations/error-initial-load-evidence до повторного запуска. Без изменения timeout/assertions/skip тот же полный пакет прошёл **4/4PASS40.2s**, UNKNOWN case5.4s (.operations/boundary-unknown-retention-repeat.log). Test-only listener instrumentation пересылает исходные add/remove calls; production hooks не добавлены.

После добавления fixture/test финальный strict type check был отложен до согласованного root CPU/IO окна. В ожидании не запускались новые heavy jobs; все собственные browser/API listeners были закрыты. До следующего font review production source после fresh-unbound fix не менялся.

По финальному review foundation owner/root к новому fallback code добавлен ровно один explicit font-mono token: production прежде давал family через old global code rule. Изолированный fixture без globals не считается доказательством font parity. Другой fallback JSX/style не менялся, shared recipes не импортируются; family теперь задана самим компонентом. Source после этого token снова frozen. Root разрешил final fixture types и полный4-case renderer пакет в отдельном коротком окне после CGL, без запуска heavy jobs до release.

В выделенном финальном окне root/web strict types **PASS** (.operations/error-final-fixture-root-types.log и error-final-fixture-web-types.log). Неизменные timeouts/assertions дополнены проверкой computed family JetBrains Mono и11px; финальный пакет **4/4PASS13.5s**, UNKNOWN closure1.7s (.operations/error-exclusive-final-browser.log). Это CSS family declaration и functional proof, не сравнение actual production font glyphs; foundation owner проверит production-font сцену отдельно после принятого parent. Все compiler/browser/API jobs завершены, root получил HEAVY-FREE до возобновления foundation capture.

Root прочитал и принял final capture fresh fallback, immutable issued handles, ambiguous raw policy, compatibility transport, metadata-only Query callbacks и настоящий UNKNOWN retention case. Полный peer среза **REVIEW_ACCEPTED**. Разрешён atomic Conventional Commit без push/PR; дальнейшие CI/интеграция принадлежат root. Local drafts, canonical session snapshot, bootstrap/global console и native acceptance не повышаются до PASS.
