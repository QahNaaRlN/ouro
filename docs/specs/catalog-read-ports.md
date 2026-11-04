# CRP · Семантические чтения identity и каталога

Дата: 2026-11-04. Ветка `codex/catalog-read-ports`; immutable base `d30f4a3ffaccde209d8424c145fdc70e8a2fea31` (`origin/codex/react-vite-epic`). Статус: **ROOT_DIRECTION_ACCEPTED / IMPLEMENTED_LOCAL / ROOT_SOURCE_REVIEWED**. Root принял финальный bounded design до source work с уточнениями source coherence, auth-mode selection и scoped cancellation ниже, затем проверил source ownership/admission. Фактические scoped проверки записаны в [журнале](../plans/catalog-read-ports.md); полный CI/merge/whole migration acceptance не заявлены.

## Проблема и граница

Три смысловых чтения — `readIdentitySession`, `listWorkspaceProjects`, `listAccountProjects` — сейчас вызываются через HTTP URL прямо из компонентов либо через URL-based helper. Они не имеют общей проверяемой границы DTO, query keys и доступности host operation. Перенос касается только этих трёх reads. Серверные endpoints, auth/participant/project writes, project snapshots/SSE, CRDT, receipts/UNKNOWN, verification, filesystem browsing и другие HTTP reads не меняются.

Результат: pure именованный read-port, bounded HTTP adapter с Zod trust boundary, frontend/api public keys/options/hooks и явная injection в composition root. Это не общий method+URL facade, не full P4/P6 и не готовность всего Ouro внутри Meridian. CSS, DOM structure, classes, layout, размеры и существующие формы не меняются. Для disabled/unsupported/empty/error разрешены только необходимые state/text transitions в существующих элементах: они не должны оставаться вечным loader или показывать чужой список.

## Подтверждённый baseline

Пути ниже относительны к корню указанного worktree; номера строк относятся к immutable base.

| Место | Фактическое поведение / ограничение |
| --- | --- |
| `packages/client/src/http/read-identity-session.ts:6–15` | Session schema допускает optional/null actor, выводит `hasAccount` из truthiness account и `canManageParticipants===true`; account/credential в отображаемый результат не передаются. |
| `packages/client/src/lifecycle/create-identity-read-controller.ts:12–24` | Каждый mounted owner имеет отдельный monotonic generation; begin aborts прошлое ожидание, accepted/failed выдаются только текущему ticket. |
| `components/workspace-client.tsx:25–32` | WorkspaceProvider владеет identity controller, accessEpoch и refresh; local participant без account/manager допуска не открывает workspace. |
| `app/page.tsx:256–277` | Legacy Human View имеет свой identity controller. При account читает список, определяет current role/fallback selection; agents read остаётся отдельным legacy transport. |
| `components/workspace-catalog.tsx:27–29` | Catalog mount и explicit refresh читают `/api/projects`; mount имеет abort/live guard, список живёт в local state. Folder browsing — другой read, вне scope. |
| `components/project-account.tsx:79–103` | ProjectSwitcher читает тот же URL, используется также local-human/human-token; initial option сейчас остаётся «Загрузка проектов…» и при empty/error. Creation/selection cookies/reload — отдельные существующие действия. |
| `components/project-account.tsx:110–120` | Members reload одновременно читает members и account projects, затем определяет current role. Только catalog part переходит на port/query; members request и writes остаются прежними. |
| `app/api/projects/route.ts:14–21` | Один GET имеет две wire shapes по auth/deployment: local folder/demo objects либо account `ProjectMetadata`. Новый schema не может считать их одной формой. |
| `lib/participant-http.ts:18–25`, `lib/user-auth-http.ts:52–60` | Session read может установить существующий local session cookie; новая cache политика не должна пропускать необходимую identity проверку. Server behavior не меняется. |
| `packages/protocol/src/http/project-access.types.ts:2–4` | Canonical account `ProjectRole`/`ProjectMetadata` уже общие для UI/server. |
| `packages/client/src/ports/project.types.ts:15–26,60` | Есть canonical client `WorkspaceProjectDTO` и `ClientIdentityDTO`; новые определения не копируют их поля. |
| `packages/frontend/src/app/project-runtime/create-project-runtime.ts:7–14` | Общий QueryClient/project registry/refcounts уже существуют; project transport пока HTTP-default и source `ouro:same-origin`. |

## Pure port и DTO

Предлагается leaf `packages/client/src/ports/catalog-read.port.ts` с ровно тремя именованными методами, без URL, HTTP verb, Request/Response, React/Query/Zod или native imports. Public API — явные named exports из `ports/index.ts`.

- `IdentitySessionDTO` — composition существующего `ClientIdentityDTO` и обязательного boolean `hasAccount`; actor остаётся существующим core Actor. Account object, cookies, expiry credential и raw session payload не попадают в DTO/cache.
- Workspace list использует существующий `WorkspaceProjectDTO`; account list — canonical `ProjectMetadata` из `@ouro/protocol/http`. Поля и optional/null semantics не зеркалируются в новые interfaces. Эти списки различаются смыслом, даже когда HTTP URL совпадает.
- Каждый method принимает immutable `CatalogReadScope` и существующие `ClientOperationOptions`; scope содержит `sourceId`, nullable `actorId`/`projectId`, `accessEpoch`, optional `hostEpoch`. Identity до authentication использует null actor, catalog без selected project — null project. Scope не доказывает права: current server auth остаётся authority.
- Результат — bounded `available(value)` либо `unsupported(capability)` с отдельным конечным union ровно трёх read capabilities. Не расширять `ProjectClientCapabilities` обязательными новыми keys и не ослаблять существующий project port result ради catalog.
- Необязательность operation выражается `unsupported`, а не отсутствующим method, `undefined` payload или ambient HTTP fallback. Host reader может поддерживать любую часть тройки; scope/epoch enforcement остаётся у client owner и adapter.

## HTTP trust boundary

`packages/client/src/http/create-catalog-http-reads.ts` связывает только GET `/api/session` и GET `/api/projects`. URL construction, injected fetch, `cache:'no-store'`, `credentials:'same-origin'`, browser cancellation bridge, response/error schemas и DTO projection принадлежат этому adapter. Никакого base URL из компонента или произвольного HTTP proxy. Existing server/Next wrappers, cookies и wire bodies не меняются.

Session schema сохраняет действующий optional/null/default behavior. Успешный session DTO содержит только actor/hasAccount/canManageParticipants. Не сохранять исходный account object в Query. Catalog schemas валидируют обязательные поля, допустимые kind/role, nullable/optional поля, массивы и nonempty IDs; поля неизвестного wire response не получают display/authorization authority. Для account read применяется canonical account shape; local folder/demo ответ не выдаётся за ProjectMetadata и не получает выдуманный slug/role. Schema declarations могут переиспользоваться внутри adapter, без второго canonical DTO engine.

Выбор operation делается по уже принятой identity: `hasAccount` означает account read; local manager без account использует workspace list. WorkspaceCatalog и ProjectSwitcher отображают выбранную форму через явную маленькую UI projection. Account catalog представляется existing hosted cards без изменения JSON API; локальный ProjectSwitcher сохраняет local folder/demo выбор и optional role, а не ломается на account-only validator. Legacy account fallback и Members currentRole используют только account operation. Не выводить auth mode/role/account из opaque actor ID, его prefix либо schema-cast workspace DTO в account shape. Существующее UI permission поведение, не относящееся к выбору этих reads, не расширяется.

Non-2xx, malformed JSON/schema, abort и network errors превращаются в typed ClientError с безопасным сообщением. Подтверждённый 401/403 остаётся access error даже если error body невалиден. Ошибка schema не превращается в empty list/успех. Credentials/raw payload/URL с query secret не логируются. Redirect acceptance квалифицируется отдельно тестом adapter; не следовать произвольному auth HTML как корректному session DTO.

Существующий `read-identity-session.ts` после переноса всех внутренних consumers либо удаляется, либо остаётся только узким совместимым HTTP delegation, если обнаружится внешний поддержанный потребитель; generic helper не импортируется из pure/api. Legacy `readWorkspaceJSON` и writes сохраняются для остального scope.

## Composition и ownership

Предлагается отдельный typed read-environment context рядом с существующим QueryClient: `{sourceId,hostEpoch,reads,reporter}`. Context/provider размещается в frontend `shared`, public catalog API — в `api/catalog-reads`; слой api не импортирует app/components и не создаёт HTTP adapter. Web `components/ProjectRuntimeProvider.tsx` является composition root: собирает same-origin HTTP reads и внедряет их. Во host injection передаётся явный port/unsupported, без автоматического web fallback. Не создавать второй QueryClient/router/identity singleton.

`createProjectRuntime`/project acquire/registry/SSE пока не переделываются: эти три reads могут пользоваться существующим QueryClient и отдельной read environment. **Реальная web composition фиксирует тот же `ouro:same-origin`, default hostEpoch и same-origin HTTP, что project runtime.** Она не получает независимый read-source override, позволяющий показать catalog B рядом с commands A. Shared context/hooks позволяют квалифицировать source/epoch replacement в изолированной bounded композиции; alternate-source переключение целого приложения и P6 остаются неподдержанными до согласованной injection всех services. Это намеренно не объявляется исправлением hardcoded project source/HTTP factory для всех project operations. Если implementation докажет необходимость менять их для корректности именно этих reads, остановиться на concrete design delta root review, а не расширять facade на весь read side.

Existing identity controller остаётся единственным владельцем принятия identity результата в каждом из двух shells. Query выполняет storage/fetch/dedup; он не публикует actor в глобальный identity store. `ticket.run` оборачивает named Query read, и его superseded branch сохраняется. Независимые controllers имеют owner-local instance ID сверх accessEpoch: одинаковые generation/null actor двух owners не должны разделить identity verification по ошибке. Scope instance ID не credential и не переносится на сервер как authority.

В bounded context/hooks source/hostEpoch замена не remounts форму/provider subtree: old scoped reads отменяются и удаляются только своим exact keys, callbacks не обновляют новый owner. Нельзя делать `queryClient.clear()` либо remove-prefix, затрагивающий project snapshots/новую генерацию. Нельзя отменять query с оставшимися current active observers при освобождении одной аренды: cleanup выполняется только последним владельцем того же read scope. При source A→B→A, same-actor reauth, hostEpoch change и StrictMode remount late value/error прежнего owner не получает current display/cache authority, даже если port игнорирует cancellation. Project session refcounts/last-lease cleanup и один SSE owner остаются прежними.

## Query policy и UI state

`packages/frontend/src/api/catalog-reads/index.ts` экспортирует только именованные query keys/options/hooks и используемые типы; URL и HTTP imports здесь отсутствуют. Keys включают operation, sourceId, actorId, projectId, accessEpoch, hostEpoch и read-owner identity, когда lifecycle owners различны. Все изменяющие результат параметры отражаются в key; secrets нет.

Явная initial policy сохраняет существующую частоту: mount/current identity generation и ручной refresh, **retry:false (0)**, refetch on focus/reconnect/interval выключен. Не добавлять polling и автоматический вызов auth writes. Для catalog accepted data живёт только текущий scope; initial/mount read проверяет сервер заново, explicit refresh всегда читает заново (`staleTime:0` для fetch), не выдавая cache hit за проверку identity/access. GC/last-reader cleanup ограничены scope. Query subscribers текущего scope могут разделить один in-flight read; каждый mount не создаёт независимый local copied catalog cache.

Identity read вызывается через named imperative Query fetch из существующего refresh ticket; hooks дают владельцу typed access к этому fetch и catalog observers без автоматического второго identity запроса. Параллельные panels не становятся владельцами новой project history. Members reload может explicit refetch account list после прежнего membership action, не меняя его server write semantics. Существующие draft/name/email/password/code/current-selection state не сбрасываются эффектом query refresh.

State distinctions: disabled unauthenticated — idle, unsupported — finite unavailable, initial active fetch — loading, empty available list — empty, initial error — inline error, background refresh — usable current data остаются видимыми с existing inline error/status. Unsupported identity reader не означает signed-out: UI явно показывает unavailable, не открывает автоматически login form и не выполняет ambient HTTP fallback. `isPending` сам по себе не означает loader. На смене access/source/host scope старые списки не используются как placeholder; private data старого scope сразу скрываются. Error owner — existing inline path, без duplicate toast. Pure normalizer и independent safe reporter не влияют на app outcome при throw/reject reporter; occurrence bound к read, не к каждому observer render. Reporter получает только заранее разрешённые code/kind/operation/occurrence и bounded epochs/source identifier; raw server error code/message либо секретный source URL не становятся metadata автоматически.

## Файлы и ownership

Предполагаемый source footprint после root review:

- `packages/client/src/ports/catalog-read.port.ts`, existing `ports/index.ts`: конечные pure methods/types.
- `packages/client/src/http/create-catalog-http-reads.ts` и existing identity helper: bounded wire validation/transport.
- `packages/frontend/src/shared/catalog-read-environment/`: pure frontend read injection, без HTTP default.
- `packages/frontend/src/api/catalog-reads/`: named keys/options/hooks/read-state policy.
- `components/ProjectRuntimeProvider.tsx`: web adapter assembly; `workspace-client.tsx`, `workspace-catalog.tsx`, `project-account.tsx`, `app/page.tsx` и минимальная explicit scope propagation из existing parents: только эти reads и их lifecycle inputs.
- New focused tests, browser read-port fixture entry при необходимости, `docs/plans/catalog-read-ports.md`.

Нет новых dependencies/Node/workspace changes, backend/SQL/routes или UI presentation conversion. Existing root architecture guard должен разрешить точные направления импортов; новых blanket legacy exceptions не добавлять. New JSDoc на русском, named exports, PascalCase components/useCamelCase hooks, no any.

## Meaningful проверки и порядок

До production source зафиксировать baseline поведения текущих consumers и настоящий RED нового требования: semantic fake host reader при отключённом ambient fetch обслуживает session/catalog; нынешний direct HTTP consumer/adapter это не умеет. Отсутствие dependencies/build/server — setup error, не domain RED. Дополнительные RED: malformed catalog не считается data, disabled/unsupported не остаётся pending loader, late old source/epoch не заполняет current list/cache.

| Gate | Что доказывает |
| --- | --- |
| CRP01 pure contract / architecture | Ровно три semantic reads, явный unsupported; no DOM/HTTP/Query/server dependency в port; api не импортирует HTTP/app. |
| CRP02 real adapter | Реальные Request/Response/fetch fixtures: exact URLs/credentials/no-store/abort, local/account/session DTO schemas, missing/null/optional fields, malformed JSON/arrays/roles/IDs, 401/403 priority, safe errors; no network fallback native. |
| CRP03 Query owner/cache | A/B/A, same-actor accessEpoch++, source/hostEpoch++, independent identity owners, StrictMode mount/unmount; port игнорирует abort; old errors/data не принимаются и не resurrect removed cache; current subscribers/refcounts не очищают друг друга. |
| CRP04 policy/error | Disabled/unsupported/empty/error finite states, initial/background distinction, retry0/no focus/reconnect polling, explicit fresh refresh, no credentials/raw error output, reporter sync throw/async reject не меняет outcome; один occurrence при повторных observers. |
| CRP05 consumer compatibility | Local folder/demo и hosted catalog, ProjectSwitcher selection/cookies/reload/fallback, Members currentRole and read reload; identity denial/local manager/account сохраняются, unsaved forms переживают current-scope refresh. Только scoped three reads перестают обращаться к URL в компонентах. |
| CRP06 real browser | Built Next и Vite shell на собственных profiles: catalog selection/navigation, authenticated account/local manager, existing route provider persistence, late read controls и форма сохраняет ввод. `e2e/multiproject.spec.ts`, applicable `apps/web/tests/navigation.spec.ts`, new bounded case. Auth writes проверяются как unchanged behavior. |
| Existing regression | `identity-read-controller`, project-session/runtime/HTTP, UNKNOWN/receipt affected cases; root/web types, architecture/migration/style guards, Next+web build и current relevant browser tests. Не запускать весь backend suite без причины. |

Приложения запускаются только на isolated temporary profiles/ports, без рабочих DB/профилей. Фактические RED/GREEN, exact commands/runtime, setup errors и ограничения сохраняются в journal. Full migration/host integration/owner acceptance не выводятся из scoped PASS.

## Принятые root уточнения / риски

1. Separate read environment использует прежний QueryClient; actual web source/hostEpoch фиксированы согласованно с current same-origin project runtime. Независимый partial-source override в целом приложении не предоставляется.
2. Явный local/account operation selection по session flags сохраняет local ProjectSwitcher. Никакого actor ID prefix inference или schema-cast обеих форм в ProjectMetadata. Новые schema restrictions сверяются с actual server wire и fixtures до реализации.
3. Identity owner instance ID и explicit cancellation/admission/last-owner cleanup обязательны: accessEpoch не уникален между независимыми controllers; один subscriber не отменяет другого.
4. State/text corrections в существующих DOM nodes устраняют бесконечный loader/auto login на unsupported; никаких CSS/DOM presentation изменений.
5. Главные риски: duplicate identity request; stale catalog после reauth; вызов HTTP из unsupported host; shared-key cancellation соседним subscriber; reporter leakage; сброс draft/forms. Все имеют отдельные проверки выше. Результаты пока **NOT_RUN**.

Технические основания: accepted D03/D04/D05/D06/D14; installed Next16.4.3 guides `use-client.md` и `client-side-data-fetching/tanstack-query.md` прочитаны из соседней установленной рабочей копии перед source work. TanStack Query5 official [keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys), [cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation) и [disabled queries](https://tanstack.com/query/latest/docs/framework/react/guides/disabling-queries) сверены; итоговая квалификация должна выполняться на закреплённой repo версии5.105.3.
