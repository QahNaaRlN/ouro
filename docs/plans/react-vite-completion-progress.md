# C0–C7: журнал завершения миграции

Дата возобновления: **2026-11-05, Asia/Yekaterinburg**. Основание — прямое поручение владельца «Продолжить работу по обновленному плану». [Действующий план](react-vite-completion.md); принятые D01–D16 и все архитектурные критерии сохраняются.

## Состояние этапов

| Этап | Состояние | Фактический результат / следующий выход |
|---|---|---|
| C0 | CLOSED | Recovery registry и обновлённый план интегрированы PR77; исходный снимок и dispositions ниже сохранены |
| C1 | IN_PROGRESS | CLI/generation/protocol producer приняты в epic; pnpm local A3 квалифицирован и ожидает publication CI/review; universal quality checks ещё в работе |
| C2 | PLANNED | hFSD, semantic ports и реальный Form/RU/error/time stack после C1 |
| C3 | PLANNED | Shared Tailwind и точные geometry policies после стабилизации C2 |
| C4 | PLANNED | Explicit embedded composition после C2 |
| C5 | PLANNED | Actual artifact/CLI/hosted/data qualification после C3/C4 |
| C6 | PLANNED | Удаление Next после candidate delivery gate |
| C7 | PLANNED | Итоговый состав и post-removal ZIP; до него epic не входит в dev |

## C0. Проверенные исходные факты

- Исходная main worktree: `c369079294939a7890567b129495aae34090968b`; прежние dirty README/next-env и untracked proposal docs сохранены. Dev: `3f8c986a8a5ddf272afc2ec8c08bc042b369d683`. Meridian, пользовательские env/profile/DB не использовались.
- До возобновления epic local/remote совпали на `6595e2e30e4a3f800e647404c8ac083a1d6892c0`. План сохранён в `ded3d99ad4fac728766dd3ea4bfd6fbb29090f40`; root изменяет только его документационную ветку до перехода к C1.
- GitHub проверен свежим именованным GraphQL запросом. PR76 exact `6afa3160c28721bb3a57c194de6c50436f2d1706`: все5 обязательных jobs SUCCESS, review submissions/threads пусты. Независимое read-only review подтвердило frozen source, production context identity и отсутствие нового command/auth/Query owner. Полный набор локально не повторялся.
- PR76 интегрирован в epic merge `6bf31d1a8e189bf02e0ee0b7c7bd52d0b4c4a752`. Это первый RU-срез assign-work, не локализация всего UI. Изменений domain/core/collaboration/SQL/protocol source в этом срезе нет.
- PR74 exact `88cbba1afa53e775225f7eb57fd5db280527df3c`: run41935397441 содержит1SUCCESS/6CANCELLED после прежней остановки. Отменённые jobs не считаются PASS. Возобновлена только незавершённая обязательная CI-квалификация (`rerun --failed`); до нового actual result PR остаётся draft.
- Старый `f99ca177` сохраняет Linux6jobs PASS и Windows13functional PASS при strictHTML672/1161FAIL. Это не общий Windows PASS и не evidence полного ZIP/CLI cutover.
- Локальный C0 не запускал runtime/сборки/установки. Текущее CIM-чтение недоступно; отдельная проверка процессов по exact owned Node24 executable дала0. Предыдущее подтверждённое закрытие owned процессов сохранено; глобальное отсутствие всех неизвестных процессов не заявляется.

## C0. Решение по каждому незавершённому срезу

| Worktree/branch | Exact HEAD и состояние | Решение |
|---|---|---|
| typed-russian-i18n | `6afa3160c28721bb3a57c194de6c50436f2d1706`, clean | INTEGRATED как PR76; продолжение RU покрытия относится к C2 |
| consumer-generation-launch | `88cbba1afa53e775225f7eb57fd5db280527df3c`, clean | CONTINUE C1 compatibility qualification; не менять HTML expected и не заявлять production/ZIP acceptance |
| tailwind-shared-foundation | `80c69d317a03fd035ec1a44ce51ce6ad19efe3c7`;3dirty docs, primitives spec и новый fixture helper; product `fc0c1aac9347b63a10967e4e96963ef6001c5261` | HOLD/SUBSUME C3 после C2. Непроверенный cache не интегрируется автоматически;804-frame workload не продолжается |
| methodology-page | `6595e2e30e4a3f800e647404c8ac083a1d6892c0`;2tracked source edits,2SDD docs,3new page files | SUBSUME C2. Literal equivalence сохранена; остановленный typecheck/runtime — NOT_RUN. Старый journal status уточняется при включении среза |
| assign-work-form | `6afa3160c28721bb3a57c194de6c50436f2d1706`;только2untracked SDD docs | SUBSUME C2 после C1. Form source/dependency changes отсутствуют; старый npm/legacy target plan пересматривается |
| pnpm-workspace | `526af11bb193b7c7e1bba9676383fe792e6fb76e`, clean,2SDD docs | CONTINUE C1. Прежнее ожидание Form заменено обязательным protocol producer prerequisite |

Все dirty scopes совпали с точкой остановки; потерянная работа в этих scopes не обнаружена. Файлы, ignored evidence и история сохранены без restore/delete/rewrite. Source/target owner и проверки оставшихся решений заданы в C1–C7; перед каждой implementation story уточняется её конечный контракт.

## C0. Конечные сценарии и плановые владельцы

Эта таблица использует существующий реестр поведения и его suites, не заявляет новые выполненные tests. Target — принятая ответственность, которую закрывает соответствующий этап.

| Сценарий | Source → target owner | Уже имеющееся evidence / конкретный остаток |
|---|---|---|
|47/59HTTP, auth/cookies/raw-body/SSE/jobs|Next route wrappers +lib handlers → service transport/application/lifecycle|Service/URI/TCP/PostgreSQL suites; remaining actual artifact+owner handoff и post-Next baseline guard: C5–C7|
|Domain/SQL/protocol/replay/receipts|core/protocol/store → прежний domain/SQL authority с явным service owner|Core/storage/protocol suites; closed old-profile fingerprints/restore/rollback: C5/C7|
|Query/snapshot/subscription/UNKNOWN|ProjectRuntimeProvider +client lifecycle/HTTP → scoped runtime/ports и web adapter|Session/runtime/receipt/error/catalog tests; pending state source/host epochs и shared lease между двумя panels: C2/C4|
|Human View/workspace composition|app/page, app/projects, components → frontend pages/widgets/features/entities/shared public APIs|Existing functional/presentation suites и accepted literal models; физические UI owners/legacy edges и real Form/RU/DataState coverage: C2|
|Native/shared styles и геометрия|globals/shared defaults +6expressions → readonly Tailwind recipes/exact technical policies|Style ledger, accepted family proofs;112rules/all-consumer coverage и after-pairs: C3|
|Agents/membership/collaboration/files/GitHub/Meridian import/verification UI|components +client-project/workspace clients → semantic feature ports/HTTP adapter; privileged actions остаются server|Existing auth/collaboration/workspace/GitHub/Meridian/verification suites; убрать implicit frontend transport/host authority: C2/C4|
|CLI/producer/dev/install/hosted|scripts, mcp bin, old npm/source/Docker → canonical CLI/resources, independent producer/consumer, pnpm dev graph|Frozen40script disposition и source/generation qualifiers; before-build manual CLI, producer lock independence и actual ZIP/hosted artifact: C1/C5|
|Meridian composition|portable context/ports +web root → explicit embedded entry +host-provided runtime/providers|Existing port/scope tests; real production embedded doubles, same-scope single owner и capability/revoke: C4; actual native/SSO отдельно|

## C1. Первая конечная story

Owner: producer agent, root review. **Только** `agent:config`, `agent:check` и manual `mcp` до frontend build. Stable supplement и generation entries используют общие canonical mains. Existing issued configs остаются pinned; invalid explicit generation selector не получает fallback. Сохраняются caller cwd/token-file/argv/stdout/exit/privacy semantics. Общий новый launcher/GC/reclaim не разрабатывается.

До source edits — tracked SDD/journal, затем positive characterization прежних команд на полностью provisioned MCP fixture и фактический consumer contract RED. Missing dependency/server не являются RED. Один локальный heavy lease принадлежит этой story; второй implementation story пока нет. Pnpm/protocol preparation и review параллельно только read-only, без конкурирующей установки.

Следующие C1 результаты: independent npm protocol producer contract до удаления developer npm locks; затем один frozen pnpm developer graph и universal quality checks. Полная C1 готовность не объявляется по факту закрытия трёх CLI.

## C1. Текущий результат после восстановления и delivery prerequisites

Эта запись обновляет текущий execution status; разделы C0 выше остаются историческим recovery snapshot.

| Принятый срез | Merge в epic | Evidence / граница |
|---|---|---|
| [PR76: RU pilot](https://github.com/QahNaaRlN/ouro/pull/76) | `6bf31d1a8e189bf02e0ee0b7c7bd52d0b4c4a752` | Все5 CI PASS; assign-work namespace, не весь UI |
| [PR77: completion plan](https://github.com/QahNaaRlN/ouro/pull/77) | `22ee3f95d24c2e092a2b6cf9bac1ace73bcbbb9d` | C0 closed, C0–C7 и D01–D16 сохранены |
| [PR74: generation launcher](https://github.com/QahNaaRlN/ouro/pull/74) | `b957bc95926543e79b4d45f3723f052eaaa04f62` | Combined run41995077028 все7 PASS; Windows/Linux source93526ae85dfe6e46ff484529b1f3d39688634b02, strict HTML672/672. Исторический local672/1161FAIL не переписан; ZIP/C5 не принят |
| [PR78: agent CLI](https://github.com/QahNaaRlN/ouro/pull/78) | `b92b5f6c04dc3933881278e066e42259ed4bc690` | Run42013485414 все7 PASS; config/check/manual MCP до frontend build, synthetic source7ec722eb49e1a8a8efba30f7f71e34f0eb25a27e |
| [PR79: protocol producer](https://github.com/QahNaaRlN/ouro/pull/79) | `19c1f663abb240aed9d78f330c335ba380db334d` | Все7 CI PASS; source cad5062a3daabf1dfbf1aea2fb2ba70219ae4340; отдельные committed producer inputs, developer lock не authority |

Pnpm workspace story: [SDD](../specs/developer-pnpm-workspace.md), [журнал](developer-pnpm-workspace.md). Source A3 `daaddc0df2951c849b16344f8679a69e6ffcfcb6`, clean до qualification. Один developer lock/four importers, explicit root task graph, source-launch argv/env/profile/exit и independent consumer npm boundary сохранены. Первое root import обновило tuples и отклонено; один bounded aggregate-preference repair принят с0new external tuples/0changed integrity и явной таблицей десяти root substitutions. Два web-owned font imports объявлены exact прежним5.3.0; shared root-runner test scopes описаны точно.

Actual A3 local results: fresh Windows frozen install13.7s/exit0/lock byte-unchanged; web production build и font resolution; focused launch/auth/SDK/config27PASS/0FAIL/2Windows platform skips; CPB01 source port1PASS; actual pnpm→npm task standalone protocol1PASS; catalog4/error4/i18n dev2/production2 =12renderer PASS; stale frozen manifest отклонён actual ERR_PNPM_OUTDATED_LOCKFILE без installation. Strict programs/service build/guards A2 переиспользуются только для неизменных relevant source/tuple inputs; final publication CI всё равно проверяет полный exact head. Первое printed-Done-but-stalled installation сохранено STALLED/OWNER_INTERRUPTED; optional notification отключена, natural exit отдельно доказан.

Ни этот local result, ни publication PR не закрывают весь C1 до universal checks/25-rule enforcement и review/CI. C2 ещё не начат; C3 ждёт его стабилизации. Actual consumer ZIP, operator/hosted/data rehearsal, Next removal и epic→dev остаются C5–C7. Dev/main/исходная dirty worktree, user env/profile/DB и Meridian не изменялись.
