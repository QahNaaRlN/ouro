# C2: карта stories и контракт первой story

Дата: 2026-11-13. Статус: **SPECIFIED / IMPLEMENTATION_NOT_STARTED / ALL_RUNS_NOT_RUN**. Ветка `codex/c2-architecture-sdd`, exact base **1fe3ee1063b6fabc62b246404c692c39bcbe9b16** (epic после записи закрытия C1, PR82). Этот документ фиксирует состав работ C2 и конечный контракт первой story до любых source edits; сам он не является реализацией и не закрывает ни одну story.

Основания: [план завершения, раздел C2](../plans/react-vite-completion.md), [целевая архитектура](../proposals/react-vite-migration/target-architecture.md), [D01–D16](../proposals/react-vite-migration/decisions.md), [React stack](../proposals/react-vite-migration/react-stack.md), C0 dispositions в [completion progress](../plans/react-vite-completion-progress.md). C1 закрыт: один dev lock, CLI, protocol producer, clean install/build и владельцы всех 25 правил имеют exact-head CI evidence.

## Проверенная исходная точка

Read-only чтение Git на base `1fe3ee1`, без установки и runtime:

- `packages/frontend/src` содержит слои `app` (i18n, project-runtime), `api` (catalog-reads, error-policy, project-session), `entities` (agent-proposal, project-event, specification, work), `features` (assign-work), `shared` (catalog-read-environment, i18n, ui/error-boundary, ui/graph). Слоёв `pages`, `widgets`, `embedded` ещё нет.
- Старое Next-приложение сохраняется до C6: `app/` — 7 tsx routes, `components/` — 69 записей. Архитектурный baseline содержит ровно 11 exact legacy edges, все `framework-boundary` с owner P3, все внутри старого приложения; их удаление относится к C6, а не к этой карте.
- Готовые к adoption срезы C0: `codex/methodology-page` (SPECIFIED SDD, literal move подготовлен, 2 tracked source edits + 3 новых page files, typecheck/runtime остановлены NOT_RUN) и `codex/assign-work-form` (STATIC_DESIGN_ONLY SDD, source формы не начат). Оба base устарели относительно текущего epic и подлежат re-base до source edits.
- Критерий выхода C2 по плану: нет frontend→legacy/server/Next dependencies и скрытых HTTP/host fallback; все UI responsibilities имеют owner; формы и смена контекста сохраняют поведение.

## Карта stories

Одна story — один законченный сценарий или граница с одним owner. Активных implementation stories одновременно не более двух, при разных файлах/контрактах и без зависимости от незаконченного результата друг друга. Зависимости ниже записаны до начала параллельной работы, как требует план.

| Story | Результат | Зависит от | Состав |
|---|---|---|---|
| C2-S1 | Pages layer pilot: перенос экрана Methodology с literal equivalence | C1 | Adoption `codex/methodology-page`; создание `pages/methodology` с public API; паттерн владельца страницы |
| C2-S2 | Form pilot D10: типизированная форма назначения работы | C1 | Adoption `codex/assign-work-form`; schema/model в `features/assign-work`; законченный pilot, по которому переносятся остальные формы |
| C2-S3 | Semantic ports completion | C1; старт после освобождения слота | Оставшиеся auth/membership/agents/GitHub/Meridian-import/files/verification operations; привилегированные действия остаются серверными; общий HTTP/fs/shell proxy для host не появляется |
| C2-S4 | Widgets и оставшаяся pages composition | C2-S1 | Home не переносится целиком в один widget; переходные path wrappers имеют owner и удаляются до выхода C2; новый frontend не импортирует legacy app/components/lib |
| C2-S5 | Изоляция scope и pending intents | C2-S1 | Явные source/actor/project/access/host scopes у Query keys/subscriptions/drafts/intents; смена контекста изолирует представление и поздние callbacks; frozen UNKNOWN не переотправляется автоматически |
| C2-S6 | Typed RU continuation | C2-S4 по мере появления owners | Namespace/fallback для всех owned UI; PR76 остаётся pilot одного namespace; тексты истории и внешние данные не становятся translation keys |
| C2-S7 | D07 data states | C2-S4 | Различимые loading/disabled/paused/background/stale/empty/forbidden/error; 0/false/null не маскируются |
| C2-S8 | Error ownership completion и D09 | C2-S4 | Runtime/Query/boundary/async capture без повторного уведомления; reporter failure не ломает команду; типизированный Temporal adapter с записанным support gate для Node/браузера/WebView2 |

Остальные формы переносятся отдельными stories по контракту C2-S2 после его закрытия; их перечень фиксируется при планировании C2-S4. C3 начинается после стабилизации C2; C4 допустим параллельно C3 при разных owners.

## Контракт первой story: C2-S1 (pages pilot, Methodology)

Adopt без переоткрытия решений: [SDD methodology-page](https://github.com/QahNaaRlN/ouro/blob/codex/methodology-page/docs/specs/methodology-page.md), base `6595e2e30e4a3f800e647404c8ac083a1d6892c0`.

**Результат.** Экран Methodology и `humanMethodology` перенесены в `packages/frontend/src/pages/methodology` с явным public API `MethodologyPage`. Home выбирает экран через этот public API. Слой `pages` создан и зарегистрирован в архитектурной проверке как владелец route-level composition.

**Граница.** Переносятся только тело компонента и `humanMethodology` из `app/human-view/history-presentation.ts`. `humanHistory`, остальные функции Home, URL/navigation и handlers не изменяются. Никакой другой экран, форма, style и runtime в story не входит. Новый модуль не импортирует legacy app/components/lib и не создаёт provider/root/router.

**Сохранение поведения.** Литералы, URL, aria/DOM, JSX, class expressions и порядок контента неизменны. Перенос без изменения поведения: искусственный RED не добавляется.

**Доказательства.** (1) Re-base подготовленного среза на exact текущий epic head с фиксацией diff к остановленному состоянию; изменённые с момента остановки inputs перечисляются явно. (2) Literal equality перенесённого тела после одного переименования declaration; exact map bytes. (3) AST equality остального Home после замены import/JSX callee и удаления перенесённой declaration. (4) Strict types root/web, `check:architecture` с сохранением 11 baseline edges и без новых, `check:quality`, conventions, style guards. (5) Существующий methodology browser/presentation набор без изменения ожиданий. (6) Обязательная CI 7/7 на exact head PR.

**Критерий merge в epic.** Все доказательства GREEN на exact head, review, обновлённый журнал story; ни один baseline edge не добавлен и не удалён этой story.

**Не объявляется.** Перенос других страниц, готовность C3 styles, квалификация native/shared CSS, любое изменение поведения и доменной истории.

## Контракт второй допустимой параллельной story: C2-S2 (Form pilot)

Adopt без переоткрытия решений: [SDD assign-work-form](https://github.com/QahNaaRlN/ouro/blob/codex/assign-work-form/docs/specs/assign-work-form.md), base `6afa3160c28721bb3a57c194de6c50436f2d1706`. Файлы и контракт не пересекаются с C2-S1 (features/assign-work и `components/workspace-task.tsx` против pages/methodology и `app/page.tsx`), поэтому параллельная работа допустима правилом двух stories.

Дополнительные условия к принятому SDD перед source edits:

1. Re-base на exact текущий epic head; исходная characterization AC01–AC06 повторяется, если re-base меняет relevant inputs (`components/workspace-task.tsx`, pending manager, entity mapper, RU resources, runtime owner).
2. Lock/dependency окно `@tanstack/react-form@1.33.5` открывается отдельно и согласуется с owner установки; существующие react-store/store/use-sync-external-store tuples не понижаются и не обновляются ради Form.
3. Один локальный heavy lease; локальные install/build/browser запуски не конкурируют с C2-S1.

Всё остальное — инвентарь сохранения поведения, AV01/AV02 RED, AT01, роль PW04/PW06 — остаётся по принятому SDD без переписывания.

## Порядок допуска

1. Эта спецификация и обновление completion progress — отдельным docs PR в epic. Source edits до её интеграции не начинаются.
2. C2-S1 стартует первой с re-base adoption; C2-S2 может стартовать параллельно после подтверждения, что файлы/контракты различны.
3. C2-S3–C2-S8 получают собственные SDD или явные ссылки на существующие принятые документы до source edits; этот документ не заменяет их детальные контракты.
4. Закрытие C2 записывается в completion progress только после выполнения критерия выхода этапа целиком; закрытие отдельной story этап не закрывает.
