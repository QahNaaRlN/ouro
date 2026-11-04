# STI · Журнал технических inline-исключений

Дата: 2026-11-04. База `ca05037031bfa5abdb84a45d34e179efee5cafc2`, ветка `codex/style-technical-exceptions`. [SDD](../specs/style-technical-exceptions.md) и root-approved bounded design зафиксированы до кода.

Изучены существующие checker/declarations/13 style fixtures, исходные SMG SDD/journal, настоящий tour helper из отдельного P3 worktree и textarea setProperty формы. Root заранее подготовил только worktree/cache install. Начальный generated protocol bin diff проверен как semantic-zero EOL; в исходный scope он не входит.

- Implementation: IMPLEMENTED_LOCAL; bounded metadata и AST mechanism, без production approvals.
- Meaningful RED → GREEN: CONFIRMED; первоначальный positive RED и отдельные false-approval regressions ниже.
- Legacy inventory compatibility: BYTE_IDENTICAL.
- Root types/current debt/final refusal: PASS / PASS / EXPECTED_REFUSAL.
- Production technical exceptions: NOT_POPULATED; ordinary ledger не меняется.

Все fixtures — собственные временные каталоги, приложение/профили/DB не запускаются. Node 24.19.0 закреплён, host environment и dependency policy не меняются. Полная Tailwind/hFSD/migration qualification не заявляется.

## Реализация и границы

`technicalInline` остаётся optional для прежнего v1 ledger. Схема закрытая: exact file/source sha256, category, owner/reason, expression kind/hash/count и exact helper dependency hashes. AST metadata хранятся только внутри checker; публичный inventory и прежние expression printer/hash/sort не меняются. Valid technical IDs вычитаются только из ordinary residue; пересечение со старым ordinary record не считается миграцией.

Resolver проверяет finite custom-property objects, прозрачные TS casts, unique const/local/named-relative helpers, simple return/conditional undefined и ограниченные numeric/unit forms. Он не исполняет source и не загружает frontend. Глобально-консервативная проверка style binding ambiguity отвергает в том числе shadow/destructuring/mutation; alias/escape стилизуемого const object не считается доказанной immutable формой. Bounded literal/const/member + simple helper parameter context используется только для отказа доказуемо static presentation. Каждое JSX/graph custom-property value требует runtime read: измеряемое соседнее поле не разрешает static property. Constants внутри измеряемого arithmetic expression сохранены; standalone constant property исключения не получает. DOM требует runtime read либо literal auto reset. Semantic numeric provenance, algebraic dependence и visual fidelity остаются вне этого AST доказательства.

## Настоящие RED и исправления

1. До implementation STI01 создал настоящий finite helper fixture с exact file/helper hashes и убранным ordinary debt. Старый gate игнорировал optional policy: `Unowned inline styling` и `Unfinished ordinary styles` вместо ожидаемого final PASS. Это product RED; после реализации тот же fixture GREEN.
2. Дополнительные реальные negatives обнаружили false approval для destructured shadowed helper и destructuring reassignment. Обе проверки были RED до исправления; добавлен только прямой AST учёт binding/write targets. Отдельный alias mutation RED закрыт консервативным отказом escaped/aliased style object.
3. Root peer review обнаружил static CSS-variable disguise: literal `--padding:20px` и constant wrappers проходили computed category. **9/9 static-only negative fixtures RED** до сужения: JSX, graph, cast const, local/imported helper, constant Math, helper literal/const object argument, runtime condition со static geometry. После bounded static-origin refusal они GREEN. Дополнительный DOM constant-write RED закрыт тем же classifier; literal auto reset и measured scrollHeight/border arithmetic сохранены.
4. Первый общий fixture run не смог создать собственный temporary junction (EPERM); это environment/setup failure, не domain RED. Повтор с разрешением для own temporary fixtures прошёл, safeguards/cleanup не ослаблялись.
5. Первый прямой root tsc был выполнен до сборки generated protocol и дал missing `@ouro/protocol`/каскад типов. Это setup failure, не domain RED. Стандартный `npm run typecheck` выполнил существующий pretypecheck/protocol build, затем PASS; финальный прямой tsc после подготовки также PASS.

## Финальные локальные проверки

Закреплённый runtime: `D:/PersonalProjects/ouro-worktrees/react-vite-foundation/.operations/runtime/node-v24.19.0-win-x64/node.exe`. PATH менялся только внутри собственного процесса для npm pretypecheck. Дополнительные зависимости, Node/dependency policy и allowScripts не менялись.

| Проверка | Команда после имени Node | Результат |
| --- | --- | --- |
| Новые finite-policy positives/negatives и все13 прежних styling tests | `--import tsx --test tests/ui-style-boundaries.test.ts` | **86/86 GREEN**, 0 skipped |
| Root strict types | npm CLI `run typecheck`, затем `node_modules/typescript/bin/tsc --noEmit` | PASS |
| Checker syntax | `--check scripts/check-ui-styles.mjs` | PASS |
| Текущий ordinary ledger | `scripts/check-ui-styles.mjs` | PASS, **17 ordinary CSS / 10 inline-style files**, 0 violations |
| Final mode текущего дерева | `scripts/check-ui-styles.mjs --final` | **expected exit1**, 20 violations о прежних legacy/ordinary styles; счётчики17/10 не скрыты |
| Conventions / diff | `scripts/check-conventions.mjs`, `git diff --check` | PASS |

Для compatibility оригинальный checker из immutable base `ca05037` загружен как собственный временный `.operations` module, затем удалён. Его `--print` stdout и новый stdout совпали **побайтно: 10801 bytes**, SHA-256 `ee8fd894e5870f11fa0daaa9195d078f9f6decb18b90cfd3fcc2f00d8ab4343e`. Полные `inspectStyles` results на production ledger совпали deep-equal в ordinary и final mode. Это повторено после root static-only fix.

Production `style-debt.json` не менялся и **не содержит technicalInline**. UI/CSS/ordinary debt, app/business code, dependency manifests/locks, Node version, protocol/domain/schema/DB не изменены. Pretypecheck generated protocol diff проверен как semantic-zero EOL и убран до commit. В этой истории не запускались application/browser/geometry checks: их отсутствие не является visual approval и не повышает mechanism fixtures до production exceptions. Full CI и Linux qualification остаются NOT_RUN; root проводит финальный peer review и публикацию.

## Followup: static property рядом с measured geometry

Root peer review `8441938` предложил конкретный обход: `{"--x":width,"--padding":"20px"}`. **4/4 STI09 fixtures дали настоящий RED**: JSX, graph, local helper и imported helper не получили ни одного нарушения. Пообъектная проверка runtime read пропускала соседнее static presentation.

Теперь каждый custom-property initializer отдельно проходит существующий bounded static-origin classifier. Измеряемое соседнее поле не разрешает constant property; неизвестная/неоднозначная форма остаётся запрещённой. Отдельного исключения для standalone literal coordinate нет. Arithmetic constants внутри измеряемого expression и узкий DOM literal `auto` reset сохранены.

Повтор закреплённым Node `--import tsx --test tests/ui-style-boundaries.test.ts`: **90/90 GREEN**, 0 skipped. Все четыре новых negatives отклоняются; три reviewed tour-call shapes, nested Math measured arithmetic и textarea auto/measured positives проходят. Production policy, UI и CSS не менялись.

## Синхронизация с эпиком

Followup сохранён отдельным commit `77c2102cb966818258ad522f9f65a6a41c71e513`. Merge `f936a5d856ec40bb1ee3eee2a0bfe56bb5424fa1` включает разрешённое основание `origin/codex/react-vite-epic` — `d30f4a3ffaccde209d8424c145fdc70e8a2fea31`, без конфликтов. Входящие UI/Tailwind изменения принадлежат эпик-основанию, не STI mechanism.

На объединённом дереве повторены **90/90 GREEN**, root `npm run typecheck` с существующим protocol prebuild, checker syntax, conventions и diff checks: PASS. Только сгенерированные pretypecheck protocol EOL differences подтверждены `git diff --ignore-space-at-eol --exit-code` как semantic-zero и убраны; исходные protocol contracts не менялись.

Оригинальный checker из нового immutable parent `d30f4a3` и STI checker выдали побайтно одинаковый `--print`: **10600 bytes**, SHA-256 `6f8c7516a43adc9d765da91e29d9ab8392773d1bd9d08ddd1408b6173873b928`. Полные ordinary/final `inspectStyles` results совпали deep-equal. Production ledger по-прежнему не содержит `technicalInline`. `styles:check` PASS: **16 ordinary CSS / 10 inline-style files**, 0 violations. `styles:final` ожидаемо отказал: exit1, **19 violations**, те же16/10 ordinary files. Эти новые счётчики отражают только входящий parent.

Application/frontend build, browser/geometry и full CI повторно не запускались: STI не меняет UI, production exceptions не утверждены. No push/PR; handoff root для финального peer review/публикации.
