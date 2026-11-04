# P4 · Публичная read model событий проекта

Дата: 2026-11-05. Статус: **IMPLEMENTED_LOCAL / STATIC_EQUIVALENCE_PASS / RUNTIME_NOT_RUN**. Ветка `codex/project-event-read-model`, база `41012fa1a4cee33f9904a3c7382bb81ecb90f68f`. SDD записан до source edits. Root принял exact move существующего helper, обновление consumers и удаление двух устаревших pure-legacy entries. Source frozen для peer и последующих root checks.

## Результат и граница

`lib/workspace-history-view.ts` содержит пять чистых функций представления событий и таблицу названий. WorkspaceHistory и WorkspaceProjectView используют их для scoped history, details, provenance и явной причинности. Это event projection одной сущности, поэтому по [целевой архитектуре](../proposals/react-vite-migration/target-architecture.md) helper получает public entity boundary:

```text
packages/frontend/src/entities/project-event/
  index.ts
  model/project-event-presentation.ts
```

HistoricalPanel не импортирует этот helper и не входит в срез. Команды, History UI, ProjectSession/Query, события в хранилище, i18n/Form и другие selectors не переносятся. Никакого нового snapshot owner, state, fetch, runtime service или authority inference нет.

## Сохраняемый public API

| Export | Контракт |
|---|---|
| `workspaceHistoryEventNames` | Та же mutable Record<string,string> и прежние детерминированные Object.assign additions |
| `workspaceEventProvenance` | Только structured metadata и actor authority определяют kind/label/tone |
| `selectWorkspaceHistory` | Conjunctive scope, проверка проекта, descending version, без изменения исходных events |
| `workspaceHistoryEntry` | Прежние явные поля/fallback labels; raw event/details не сокращаются |
| `workspaceHistoryRowLabel` | Только accessible row excerpt, прежние лимиты/тексты/порядок |
| `workspaceHistoryRelations` | Только сохранённый causationId, без вывода причинности из chronology/correlation |
| `WorkspaceHistoryScope`, `WorkspaceEventProvenance` | Те же exported type definitions без переименования |

Public index явно экспортирует шесть значений и два типа; private record/text/rowExcerpt не протекают. В model разрешено изменить только type-only import DomainEvent/ProjectState на public `@/packages/core/src`. Остальные bytes после EOL normalization, включая прежние labels/comments, сохраняются. Новое описание index — на русском. Proxy из прежнего lib path не остаётся.

## Consumers и guard cleanup

Ровно три active imports обновляются через public index: `components/workspace-history.tsx`, `components/workspace-project-view.tsx`, `tests/workspace-history-view.test.ts`. Имена и тела потребителей/пяти существующих test cases не меняются. Existing test filename сохраняется как исторический идентификатор suite.

Из `scripts/check-architecture.mjs` удаляются только `lib/workspace-history-view.ts` и уже отсутствующий `lib/workspace-proposals-view.ts` в pureLegacyFiles. Не расширять exceptions/permissions, не менять алгоритм guard. Два negative fixture inputs подготовят реинтродукцию этих lib paths; positive fixture защитит public project-event index с type-only core dependency. Expected diagnostic — server-boundary для старого path. Actual fixture RED/GREEN пока NOT_RUN; parser/static analysis не выдаётся за запуск guard.

## Проверка

До source сохраняются exact Git bytes helper/consumers/test/guard/fixture. Затем bounded static proof проверяет literal body equality после единственной import substitution, все exported signatures/types/labels, AST consumers/tests после разрешённого import path change, handlers/classNames, отсутствие old module и два exact guard removals. Fixture data добавляется без изменения существующих cases.

Пять existing history tests уже содержат meaningful assertions: conjunctive project/spec/revision/execution scope, source immutability и typed fields; полные reason/outcome vs accessible excerpts; только явные causal links; actor/provenance/simulation boundaries. Новые implementation-mirroring tests helper не нужны. Types, эти tests, architecture fixtures/guard и необходимые integration checks выполняет root после CPU/dependency окна. Пока **HEAVY-FREE**: npm/tests/tsc/build/browser не запускаются. Static PASS не означает runtime/native/полный P4 acceptance. Commit/push/CI принадлежат root после peer.

Фактический bounded static result: helper literal equality после единственной core import substitution, body SHA256 `3a9de903b9729651f2a6b0b089c51e435349c4f639536f810b3e869f0bc05b4e`. У обоих UI consumers и existing unit suite literal/AST equality после только import replacements; сохранены 62 JSX handlers, 160 className expressions и все пять test bodies. Index содержит ровно шесть значений/два типа, старые lib paths отсутствуют. Guard отличается ровно удалением двух entries; 30 прежних fixture records сохранены, новые 2 negative/1 positive inputs пока не выполнялись. `git diff --check` PASS, manifests/locks/ledger/protocol unchanged. Подробности и NOT_RUN границы — в [журнале](../plans/project-event-read-model.md).
