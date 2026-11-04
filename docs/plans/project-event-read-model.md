# P4 · План и журнал переноса event projection

Дата: 2026-11-05. Ветка `codex/project-event-read-model`, exact base `41012fa1a4cee33f9904a3c7382bb81ecb90f68f`. [SDD](../specs/project-event-read-model.md) записан до source changes.

| Область | Статус |
|---|---|
| API/consumer inventory | COMPLETE:5functions+table+2types,2UI+1test imports |
| Narrow scope | DESIGN_ACCEPTED root |
| Immutable before | COMPLETE до source,6exact Git snapshots/SHA256 |
| Source/static proof | IMPLEMENTED_LOCAL / STATIC_EQUIVALENCE_PASS |
| Tests/types/build/browser/CI | NOT_RUN, HEAVY-FREE |
| Peer/commit/push | PENDING, не выполнялись |

## Точные изменения

1. Move `lib/workspace-history-view.ts` → `packages/frontend/src/entities/project-event/model/project-event-presentation.ts`; только type-only core import меняет путь. Все Workspace* имена сохраняются.
2. Создать explicit entity public index. Обновить imports WorkspaceHistory/WorkspaceProjectView/history unit suite; старого lib файла/export proxy не остаётся.
3. Удалить ровно два stale pureLegacyFiles entries в architecture guard. `Test-Path lib/workspace-proposals-view.ts` на planning base возвращает false.
4. В actual `tests/fixtures/architecture/cases.json` добавить два old-path negative cases и один public entity/core-type positive case. Не менять existing fixtures/allowlist/guard algorithm.
5. Добавить фактические результаты bounded AST/literal/handler/className checks в этот журнал. Сохранить scope и неизменные locks/ledger/protocol.

## Порядок и evidence

- Actual AGENTS прочитан. Installed Next use-client guide прочитан из project-runtime-environment node_modules: новый module pure и не получает client directive; существующие consumer directives сохраняются.
- До source сохранить exact base helper/consumer/test/guard/fixture bytes и SHA256 в ignored .operations/before. Bounded script использует только pinned Node и installed TypeScript из project-runtime-environment; production modules и architecture inspector не исполняются.
- Сверить literal helper после единственной core import substitution; non-import AST и необходимые import replacements у двух UI/одного test. Guard body должен совпадать после удаления только двух string entries, а все прежние fixture records — остаться буквально/структурно прежними.
- Источники meaningful tests: пять cases `tests/workspace-history-view.test.ts`, существующая architecture fixture harness и реальные WorkspaceHistory consumers. Не писать placeholder helper tests ради перемещения.
- История остаётся frozen без commit до root peer; root устанавливает dependencies и выполняет tests/types/guards/CI. До этого no runtime PASS, no fixture RED/GREEN claim и никаких native/полного hFSD assertions.

## Фактический static-only результат

- `.operations/before/manifest.json` и шесть файлов созданы до source из exact base. Ни один protected profile, чужая worktree или D08 dependency file не затронуты.
- Новый project-event model совпал буквально после замены единственного type-only core import; старые comments/labels сохранены по принятому scope. Private helpers и deterministic Object.assign table additions остались внутри module. Body SHA256 `3a9de903b9729651f2a6b0b089c51e435349c4f639536f810b3e869f0bc05b4e`.
- `.operations/check-static-equivalence.cjs` использовал pinned Node24.19.0 и existing installed TypeScript5.9.3 из project-runtime-environment без выполнения production/guard modules. `.operations/static-equivalence.json`: оба UI и test source literal/non-import AST exact после разрешённых import substitutions. WorkspaceHistory:5handlers/52classNames; ProjectView:57handlers/108classNames; existing history suite:5test bodies. Все существующие client directives включены в literal equality.
- Public API проверен:6named values+2type-only exports, type-only core dependency, parse diagnostics новых modules равны нулю. Старый helper удалён без proxy; прежний proposals lib path также отсутствует. Active old imports вне prepared fixtures не найдены.
- Guard file literal equality после удаления ровно двух string entries. Все30existing fixtures структурно неизменны; добавлены2old-path negative и1public-entry/core-type positive. Это подготовленные expectations, **не actual RED/GREEN**, fixture harness не запускался.
- `git diff --check` PASS; manifests/locks/style ledger/protocol unchanged. Tests/types/build/browser/architecture runtime/CI — **NOT_RUN**, producer lease соблюдён. Source frozen и передан root для peer; commit/push/PR не выполнялись.

## Root peer и три новых boundary cases

Root принял перенос после чтения actual source/consumer diff и повторил literal/AST proof: PASS. Для новой worktree использован только явно связанный existing TypeScript5.9.3 из собственной `project-runtime-environment`; новые package graphs не устанавливались. Это read-only AST qualification, не independent installation proof.

`.operations/qualify-architecture.mjs` выполнил фактические старый и новый `inspectArchitecture` на трёх собственных сохранённых fixture trees. Старый checker допускал оба удалённых lib paths без нарушений; новый выдаёт ожидаемый `server-boundary` для каждого. Публичный project-event index с pure core type dependency принимают оба checker. Результат трёх cases: PASS; `.operations/architecture-qualification.json` хранит точные before/after codes. Production modules не исполнялись. Полные33fixtures, существующие5history tests, strict types/build/browser и combined CI всё ещё требуют штатной проверки; они не объявлены локально пройденными.
