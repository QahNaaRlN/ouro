# SPECIFICATION · План и журнал переноса workspaceContent

Дата: 2026-11-05. Ветка `codex/specification-content-model`, база `9b7adc869c90320d13ac68a4e9f22f194acacc12`. [SDD](../specs/specification-content-model.md) записан до source edits; узкий перенос принят root.

| Область | Статус |
|---|---|
| API/consumer inventory | COMPLETE: одна реализация, два consumer sites |
| Source scope | DESIGN_ACCEPTED, имя workspaceContent и literal body сохраняются |
| Before artifacts | COMPLETE до source edits, exact base copies и SHA256 |
| Реализация | IMPLEMENTED_LOCAL, frozen для root peer |
| Static equivalence | PASS: literal function, оба callers, 26 handlers / 114 classNames |
| Types/build/browser/CI | NOT_RUN; HEAVY-FREE, выполняет root после передачи |
| Peer/commit/publication | PENDING; push/PR у root |

## Точный список изменений

| Путь | Разрешённое изменение |
|---|---|
| `packages/frontend/src/entities/specification/model/create-revision-content.ts` | Type-only core import, русское описание и прежнее определение workspaceContent |
| `packages/frontend/src/entities/specification/index.ts` | Explicit named export workspaceContent |
| `components/workspace-task.tsx` | Удалить только определение workspaceContent, добавить public entity import |
| `components/workspace-decisions.tsx` | Заменить только путь существующего workspaceContent import |
| Эти spec/plan | Зафиксировать scope и фактические результаты |

Existing type import `RevisionContent` в task остаётся нужен сигнатуре onStart. Не переносить компоненты, styles, Draft map, commands или schema. Не создавать compatibility proxy, новый Form wrapper, any или architecture allowlist.

## Последовательность

1. Прочитать actual AGENTS и installed Next use-client guide. В новой worktree dependencies отсутствуют; руководство читается из уже установленного `client-error-policy/node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`, при одинаковой версии Next в exact base. Новые dependencies не устанавливаются.
2. Сохранить immutable before copies из exact base и bounded AST script в ignored `.operations`. Скрипт использует только pinned Node и существующий TypeScript из `client-error-policy`, без выполнения production modules.
3. Перенести определение с буквальным телом, добавить public index, обновить два импорта. Сохранить client directives обоих callers и все остальные statements/JSX.
4. Проверить literal function/signature equality, caller non-import AST equivalence, handler/className invariance, отсутствие старого export и иных refs. Сверить `git diff --check`, source file list и unchanged locks/ledger/allowlist.
5. Передать root frozen source и exact evidence. Не запускать npm, tests, tsc, build, browser во время producer lease. Commit/push/PR до ответа root не выполнять.

## Существующие проверки для root

Значимые существующие suites перечислены в SDD; приоритет для этого переноса — root/web strict types, architecture/conventions/style/diff и необходимые workspace regressions. Full browser после literal/AST equality не объявляется уже выполненным и не дублируется автоматически: root определит нужный объём при разрешённом heavy окне. Существующий реальный `e2e/project-workspace.spec.ts` остаётся источником доказательств формы/UNKNOWN; здесь нет новой synthetic подмены этого сценария.

## Фактический журнал

- До source: exact base подтверждён, worktree clean; actual AGENTS и installed guide прочитаны. `rg` нашёл только определение workspaceContent и два caller sites. Новый shared helper не добавляется в generic shared: предметный RevisionContent остаётся в entity specification.
- До source edits `.operations/before/manifest.json` сохранил exact base copies: task 6262 bytes / SHA256 `2814f56551249df2d1da3826696aa08be2706847936fa9e4fe3380a9996dc661`, decisions 31835 bytes / SHA256 `f55ace25a7aa7a8167df2ccb15e308f71bc873b2edde55266feb0eb8a5fc1807`.
- Перенос выполнен строго в четырёх source files из карты. Имя workspaceContent сохранено, старое определение/export из task удалено, два consumers используют entity public index. Других active refs inventory не обнаружил.
- `.operations/check-static-equivalence.cjs` использовал Node24.19.0 и installed TypeScript5.9.3 из client-error-policy, не загружая production modules. Первая сверка заметила только CRLF/LF в JSX whitespace; parser уточнён общей EOL normalization, как предусматривал SDD. Это поправка evidence script, не product RED и не production source fix.
- Финальный `.operations/static-equivalence.json` и log: literal function/signature/body exact, SHA256 `93c47465a9002fa6efe19896c8d6646e5b9c6d2fb1038b244deb9ef6986d8d9d`; task non-import AST exact / 5 handlers / 16 classNames / 1 call; decisions non-import AST exact / 21 handlers / 98 classNames / 1 call. Дополнительно проверены точные разрешённые import substitutions, единственный named export и type-only core dependency. Client directives входят в AST equality.
- `git diff --check` PASS; manifests/locks/style ledger/architecture guard unchanged. Новых зависимостей, tests, профилей, серверов, browser/компиляторов и записей в ledger не создавалось. Source frozen для root peer; installation/types/build/runtime/CI остаются NOT_RUN. Commit/push/PR не выполнялись.
