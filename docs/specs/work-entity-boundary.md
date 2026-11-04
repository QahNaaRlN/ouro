# WEB · Публичная граница сущности работы

Дата: 2026-11-04. Статус: **IMPLEMENTED_LOCAL / BOUNDED_QUALIFICATION_PASS / REVIEW_ACCEPTED**. Ветка `codex/work-entity-boundary`, исходная база `4586a69634dce06b620a0917628f20c347a8a835`. Документ создан до изменений исходников. Root подтвердил базу, API, четыре переноса и обе guard closures; локальный результат не означает допуск всего hFSD.

## Проблема и результат

После переноса оформления на Tailwind 4 компоненты `WorkStatus` и `VerificationPairCard` всё ещё физически находятся в корневом `components`. Их собственные таблицы оформления доступны потребителям по внутренним путям. Следующий атомарный срез должен поместить существующее отображение работы и связанной проверки в один entity slice с явным публичным API.

Основание — принятые D01–D16 и [целевая архитектура](../proposals/react-vite-migration/target-architecture.md): `entities` владеет моделями представления и компонентами отображения; чистые core projections являются объявленной зависимостью. Срез не переносит каноническую модель Project и не создаёт для неё новый cache, transport или владельца состояния.

Предлагаемая структура:

```text
packages/frontend/src/entities/work/
  index.ts
  ui/
    WorkStatus.tsx
    VerificationPairCard.tsx
    work-status-presentation.ts
    verification-pair-presentation.ts
```

Отдельный `model` каталог не нужен: нового состояния домена или собственной модели здесь нет. Внутри слайса используются относительные импорты; внешний потребитель импортирует `@/packages/frontend/src/entities/work`. Старые четыре файла удаляются после обновления всех актуальных потребителей, без compatibility proxies из `components`.

## Инвентарь API и зависимостей

| Публичный символ | Сохраняемый контракт | Потребители |
|---|---|---|
| `WorkStatus` | `presentation: StatusPresentation`, optional `showCode` и `className`; прежние defaults и JSX | Roadmap, WorkspaceProjectView, WorkspaceDecisions; внутренний Pair |
| `VerificationPairCard` | `state`, `group`, обязательный `onOpen`, optional `onOpenRequests`, `onOpenProposals`, `classNames` | Roadmap, WorkspaceProjectView; verification SSR test |
| `VerificationPairClassNames` | Readonly partial record: `attention`, `proposals`, `updated`, `time`, `root`, `face`, `button`, `open`, `auto`, `summary` | Публичный контракт caller-owned slots |
| `verificationPairWorkspacePresentation` | Конечные строки `open`, `auto`, `summary`; без context, поиска поверхности и побочных эффектов | Roadmap, WorkspaceProjectView |

Публичный `index.ts` содержит explicit named exports: три значения и один существующий тип. Собственные base maps, icon map и tone map остаются внутренними. Новые props types, повторные exports core и общий barrel всего frontend не добавляются. Поля, optional/null semantics и mutability существующего API не переопределяются.

`WorkStatus` зависит только от Lucide, `twMerge`, core presentation types и собственной таблицы классов. Pair использует React `useId`/`useState`, собственный `WorkStatus`, свои classes и прежние чистые core функции `getWorkPairPresentation`, `currentDecisionRequests`, `getSpecWorkPresentation` с типами `ProjectState`/`WorkPairGroup`. Эти функции продолжают работать с переданным snapshot; перенос не делает их источником серверных фактов. Runtime/type зависимости core сохраняются, без копирования доменного расчёта в frontend.

Единственное собственное UI-состояние Pair — локальный выбор стороны карточки. `use client` сохраняется буквально в `VerificationPairCard.tsx`; public index и `WorkStatus` не получают новую client directive. Внутренний Pair импортирует соседний WorkStatus напрямую, без возврата через собственный public index.

Внешние актуальные production consumers — `components/roadmap.tsx`, `workspace-project-view.tsx`, `workspace-decisions.tsx`; test consumer — `tests/verification-ui.test.ts`. В Roadmap остаётся прежний экспорт `Status`: его используют Human View, HistoricalPanel и GitHubPanel. Он продолжает вызывать публичный WorkStatus; перенос его callers и helpers не расширяет этот срез.

## Границы и совместимость

В слайсе запрещены зависимости от legacy `app`/`components`, parent presentation/context, router, ProjectSession/Query provider, HTTP/command ports и verification feature. AppearanceContext и общие native/typography defaults проектируются отдельно; этот срез их не переносит и не проксирует. Условия workspace и selected face остаются у прежних callers, которые передают готовые slots. Экспорт конечного compatibility recipe не даёт карточке знания о родительском экране.

Сохраняются все callbacks, аргументы маршрутов и ревизий, остановка всплытия, обе грани, `inert`, `aria-hidden`, `tabIndex`, локальный override, reduced motion и transform-only transition. Domain command/cursor/receipt/UNKNOWN/authorization, verification contract/editor/runner/manual/import, draft ownership и SSE lifecycle не меняются. `verification-panel`, `verification-advanced` и `verification-presentation` остаются на прежнем feature-переходном месте.

Обычный CSS, Tailwind tokens/variants, theme, stylesheet order и style-debt ledger не изменяются. Уже существующий `@source "../packages/frontend/src"` должен обнаруживать перемещённые utilities. Перенос не исправляет прежний mobile overflow и не повышает результат браузерной проверки до native Meridian acceptance. DB, MCP/protocol, service, Node/dependencies, consumer delivery, Next cutover и production profiles вне границ.

## Согласованное закрепление границы проверкой

Read-only аудит обнаружил два пробела действующего guard. Публичный entry слайса проверяется только при распознанных `from && to`, поэтому legacy caller может напрямую импортировать `entities/work/ui/*`. Кроме того, `packages/frontend/src` сейчас может зависеть обратно от корневых `app`/`components` без отдельного hFSD нарушения.

Root согласовал в этом срезе две узкие проверки: внешний импорт entity slice всегда проходит корневой public index; `packages/frontend/src` не импортирует legacy `app`/`components`. Второй запрет не распространяется на transitional composition root `apps/web/src/app/router.tsx`, который ещё собирает существующие экраны. Существующие layer/cross-slice/type-only правила и finite baseline не ослабляются. Обе проверки реализованы; вложенный `ui/index.ts` тоже не считается публичным entry слайса. Meaningful negative fixtures показали actual RED старого guard и последующий GREEN; подробности в журнале.

## Критерии приёмки

1. До source changes зафиксированы API/consumer inventory, согласован scope guard и чистая база; установленное Next руководство прочитано в рабочем дереве реализации. Собственный свежий профиль и actual browser baseline создаются в новой worktree: защищённые профили прошлой истории не переиспользуются через другой PATH.
2. Оба компонента и обе собственные presentation maps находятся в одном `entities/work` slice. В public index только объявленные named exports; внешние executable/test imports используют его. Старых четырёх файлов и актуальных imports на них нет. Исторические документы и evidence прошлых путей не переписываются.
3. Сравнение TypeScript AST и transpiled runtime сохраняет тела четырёх файлов и обработчиков после нормализации EOL и только необходимых import path substitutions. Набор Tailwind classes и фактическое обнаружение utilities не меняются. Ни одного нового parent/context/legacy root import в transitive closure слайса.
4. Если расширение guard принято, meaningful negative fixtures сначала показывают разрешённые сейчас недопустимые импорты; после исправления они отклоняются. Public-index, same-slice relative, pure core и transitional apps/web composition остаются разрешены. Это RED/GREEN архитектурной проверки, а не изменение продуктового поведения.
5. Existing verification SSR и три verification browser suites проходят. Ограниченное сравнение тех же реальных карточек/статусов включает обе поверхности, темы, desktop/mobile, selected face, keyboard и motion. Новый тест не дублирует реализацию; точный набор и сохранённый snapshot фиксируются до переноса. Исходные ограничения mobile остаются обозначены.
6. Root/web strict types, Next/Vite builds, architecture fixtures/guard, conventions, style guard и `git diff --check` проходят в фактически запущенном объёме. Ledger и dependency locks неизменны; полный CI/merge/push/PR выполняет root после bounded peer review. До этого результат остаётся локальным.

Фактический локальный результат: четыре файла перенесены с literal equality после единственной внутренней подстановки имени WorkStatus и нормализации EOL; тела семи модулей, их transpiled runtime и92callbacks совпали. Старые файлы отсутствуют, актуальных imports на них нет; публичный API ровно объявленный выше. Все1341valid Tailwind candidates, сгенерированный utility CSS и четыре CSS assets production Next сборки совпадают. На новом собственном snapshot43 все116PNG и116metric sets exact; existing verification browser3/3 и SSR4/4PASS. Strict root/web types, обе сборки, architecture32/32fixtures и871files/0violations/11legacyedges, style guard и conventions PASS. [Журнал](../plans/work-entity-boundary.md) сохраняет scope, evidence и ограничения; CI/merge ещё не заявляются.
