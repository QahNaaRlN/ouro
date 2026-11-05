# WEB · План физического переноса work UI

Дата: 2026-11-04. Ветка `codex/work-entity-boundary`, planning base `4586a69634dce06b620a0917628f20c347a8a835`. [SDD](../specs/work-entity-boundary.md) создан до source изменений.

| Область | Статус |
|---|---|
| Read-only API и consumer inventory | COMPLETE |
| Независимая сверка consumer graph | COMPLETE, без source/profile writes |
| Окончательный base и scope guard | ACCEPTED:4586, четыре переноса и обе проверки |
| Dependencies и regression/browser baseline новой worktree | PASS:208/81packages,SSR4,Next/Vite,actual104+12frames |
| Перенос исходников | IMPLEMENTED_LOCAL:4файла и explicit public index |
| После переноса: types/build/AST/browser/guards | BOUNDED_QUALIFICATION_PASS |
| Peer review | REVIEW_ACCEPTED: public API, guard closures и source/CSS evidence |
| Scoped commit | Подготовлен после принятого review, без push/PR |
| CI и интеграция | NOT_RUN |

## Зафиксированный исходный инвентарь

| Исходный путь | Предлагаемый путь | Изменение |
|---|---|---|
| `components/work-status.tsx` | `packages/frontend/src/entities/work/ui/WorkStatus.tsx` | Физический перенос; прежние props/defaults/JSX |
| `components/work-status-presentation.ts` | `packages/frontend/src/entities/work/ui/work-status-presentation.ts` | Физический перенос; tone map и classes без изменения |
| `components/verification-pair-card.tsx` | `packages/frontend/src/entities/work/ui/VerificationPairCard.tsx` | Физический перенос; локальные UI hooks и callbacks без изменения |
| `components/verification-pair-presentation.ts` | `packages/frontend/src/entities/work/ui/verification-pair-presentation.ts` | Физический перенос; base recipe внутренний, workspace recipe публичный |
| Отсутствует | `packages/frontend/src/entities/work/index.ts` | Explicit export двух компонентов, existing slot type и compatibility recipe |

Обновить imports в Roadmap, WorkspaceProjectView, WorkspaceDecisions и `tests/verification-ui.test.ts`. Два первых callers больше не импортируют recipe по private file path. Pair использует внутренний relative WorkStatus import. Все текущие old-path source refs найдены поиском executable/test source; независимый read-only peer не обнаружил дополнительных direct consumers.

`Status` в Roadmap остаётся: его callers в app/page, HistoricalPanel и GitHubPanel не переносятся. Не вводить импорт entity → Roadmap, WorkspaceAppearance или WorkspaceUI. Feature verification forms/commands и их own map не относятся к этому переносу. Не создавать пустой `model` каталог, новый cache, адаптер pure core или props types ради структуры папок.

## Порядок работы, зафиксированный до реализации

План ниже создан до source изменений; фактические результаты приведены отдельно. Root согласовал исходную базу и обе проверки перед началом реализации.

1. Уточнить у root итоговую основу ветки и две предложенные проверки guard. До этого разрешены только эти два документа; исходники замороженной verification story не меняются. Синхронизацию с новым base делать до получения baseline, чтобы baseline относился к фактической реализации.
2. Прочитать actual AGENTS и нужное установленное Next руководство. Dependencies установить из неизменённых lockfiles, закреплённый Node24.19 использовать с process-local PATH. Собрать protocol как существующую предпосылку; возможный semantic-zero EOL drift проверить отдельно и убрать только у generated files.
3. Сохранить immutable исходные четыре файла, public/consumer import map, non-import AST/runtime и Tailwind candidate set. Выполнить existing verification SSR/architecture baseline. Собрать текущий Next/Vite до source edits и создать собственный synthetic profile через существующий public fixture helper.
4. Снять bounded actual baseline карточки/статусов до физического переноса. Использовать сохранённые contracts/fixed case IDs, полный canonical snapshot и один и тот же профиль/запусковой PATH до/после. Не применять clock/UUID override, SQL edits, screenshot masks или новые production hooks. Не пользоваться профилями `tailwind-verification`: они сохранены как evidence отдельной истории.
5. Если guard входит в согласованный scope, добавить meaningful fixtures для legacy caller → entity internal и frontend package → legacy UI; сначала зафиксировать RED старого guard. Positive cases защищают public index, same-slice relative imports, pure core и transitional apps/web composition. Исправить правило без allowlist и без расширения layer permissions.
6. Переместить четыре файла, создать explicit public index, заменить только необходимые imports у существующих callers/tests. Сохранить client directive только Pair, props/signatures и readonly slot ownership. Удалить исходные файлы после zero active refs; не оставлять root proxies.
7. Проверить source/runtime equivalence, обработчики и прежний набор Tailwind candidates; выполнить strict root/web compilation и обе production builds, existing verification SSR, architecture fixtures/guard, conventions/style guard. Далее сравнить frozen actual browser baseline и пройти три существующих verification suites. Повторять только затронутые проверки при последующей узкой правке.
8. Записать фактические команды, counts, ограничения, промежуточные failures и исправления. После peer review — scoped Conventional Commit, без push/PR. Root выполняет integration/CI; локальный PASS не обозначать как весь migration/native PASS.

## Граница диагностики

Это структурный перенос без нового продуктового поведения, поэтому новый domain RED и implementation-mirroring tests не нужны. RED допустим и нужен для нового поведения architecture guard, если оно войдёт в scope. Отсутствующая dependency, неподготовленная `.operations` папка или не запущенный server — setup failure, не доказательство продуктового дефекта.

Срез Tailwind verification на исходной базе имеет собственную квалификацию115/116 pixel-identical кадров и все116 exact metrics; это историческое evidence, а не результат будущего перемещения файлов. Его прежний mobile overflow и описанный диагностический drift отдельного профиля не скрываются и не переносятся в утверждение о готовности новой worktree. Новая история создаёт свой baseline и явно обозначает проверенный объём.

Из style-debt ledger не удалять новых entries и не регенерировать чужие hashes: этот перенос меняет расположение уже преобразованного UI. Общие native/typography styles, AppearanceContext, remaining CSS, command features, service и Meridian qualification принадлежат другим историям.

## Исходные результаты

Root подтвердил planning base4586, четыре переноса, публичный API и обе guard closures до реализации. Прочитаны actual AGENTS и установленные Next16.4.3 guides `use-client.md` и `05-server-and-client-components.md`. Root/web dependencies установлены offline из неизменённых lockfiles:208/81packages, protocol71schemas собран. Первая установка с изолированным пустым npm cache завершилась ENOTCACHED; повтор через существующий пользовательский cache прошёл. Это setup failure, не product RED. `allowScripts` и версии не менялись.

Новые architecture fixtures сначала дали actual RED: обе запрещённые зависимости возвращали пустой список нарушений вместо ожидаемых codes. Итог старого guard28/31PASS,3fail с учётом parent subtest failure. После узкого запрета `packages/frontend/src → app/components` и проверки entity public entry для legacy callers все31/31GREEN. Проверки существующих распознанных frontend slices не ослаблены; type-only cross-entity/public-index правила сохранены. Positive fixtures защищают public API, same-slice implementation, pure core read projections/types и transitional apps/web composition. Полный исходный граф:870files/0violations/11exactlegacyedges; allowlist не менялся.

До UI переноса existing verification SSR4/4GREEN, исходные Next/Vite builds PASS (Vite14.46s). Сохранены non-import AST/transpiled runtime семи модулей и92callbacks,1341valid Tailwind candidates, generated utility CSS digest и hashes четырёх production CSS assets. Исходные четыре UI-файла остаются неизменными до завершения browser baseline.

## Выполненный перенос и доказательства

Реализована ровно предложенная структура из четырёх UI-модулей и одного public index. В index explicit named exports: `WorkStatus`, `VerificationPairCard`, `verificationPairWorkspacePresentation`, type `VerificationPairClassNames`. Private base maps и core symbols не экспортируются. У трёх production callers заменены только imports, SSR test получает Pair из public index; assertions не менялись. Внутри Pair изменилось только имя relative WorkStatus import. Старые четыре файла удалены, актуальный поиск source/test paths не обнаружил old imports; historical docs сохранены.

Четыре implementation source texts буквально равны immutable base4586 после нормализации EOL и единственной обратной подстановки `./WorkStatus → ./work-status` в Pair. Отдельно TypeScript AST printer и `transpileModule` подтвердили полное равенство всех non-import statements семи модулей: четыре перенесённых и три callers. Все92callbacks и их AST hashes совпали; props, readonly slots, local state, client directive и core calculation остаются прежними. Evidence: `.operations/entity-literal-equivalence.json`, `entity-equivalence-before.json`, `entity-equivalence-after.json`.

Raw source scanner и настоящий Tailwind design system обнаружили одинаковые1341valid utility candidates. Сгенерированный из них CSS имеет одинаковый SHA256 `ec1989663ba75fe6dd6f59e9da5a3f43c86a9d9592dc0a7485f381bd5f649938`. Все четыре actual production Next CSS assets совпали побайтово:89005/20227/2018/25114bytes. Source discovery уже охватывает `packages/frontend/src`, поэтому `app/tailwind.css` и tokens/variants не менялись. Это отдельное доказательство CSS equality, а не вывод только из AST или наличия class strings.

Дополнительная negative fixture воспроизвела обход public boundary через `entities/work/ui/index.ts`: после первого исправления guard вернул `[]` вместо `deep-slice-import` (30/32PASS,2fail с parent subtest). Guard теперь считает public entry entity только корневой `entities/<slice>/index`; вложенный barrel не является разрешением. Внутренние same-slice imports по-прежнему разрешены. Ограничение для внешних legacy callers расширено именно на entities; прежние правила остальных распознанных frontend slices не ослаблены. Финальные32/32architecture tests GREEN, включая7новых fixtures:3negative и4positive. Evidence: `architecture-red.log`, `architecture-green.log`, `architecture-nested-index-red.log`, `architecture-final-green.log`.

## Браузерное сравнение

Создан новый собственный профиль `.operations/entity-profile`, project `4271354e-09f4-4491-96b1-2c20346b32a8`, immutable snapshot43. Существующий public verification fixture сохранил настоящий runner/import/manual provenance, fixed saved case IDs и canonical states. Production overrides, UUID/clock replacement, SQL edits, masking и новые runtime hooks не использовались. Процессный PATH закреплён одинаково до/после; его digest `9874b1990bc1701b7b893b849aac1e918dbd6d86134736d5cdc5498a1583bce2` совпал во всех четырёх qualification manifests. Полный snapshot проверялся deep equality до и после каждого browser прогона; cursor43 сохранился. Дополнительных запросов observer/probe вне этой последовательности не выполнялось.

Применён существующий production-route TWV01, без изменения его body/config. Сначала104исходных кадра (`entity-before`,2.7m), затем12selected/motion (`entity-pair-before`,19.9s). После переноса тот же профиль дал104кадра (`entity-after`,2.5m) и12selected/motion (`entity-pair-after`,17.6s). **Все116/116PNG pixel-identical; все116/116DOM/computed metric sets exact**, включая все поля и число/tag элементов, без нормализации. Обе темы, legacy/workspace surfaces, desktop1440/mobile390, graph/table, обе грани, selected border, keyboard и reduce/no-preference motion сохранены. Reused route дополнительно прошёл saved contract/forms/provenance/status views, исходники которых этот срез не менял. Evidence: `presentation.json`, `qualification.json` в четырёх каталогах и `comparison.json` в обоих after-каталогах.

Существующие3browser suites прошли непрерывно **3/3PASS1.3m** на отдельном `.operations/entity-functional-profile`: verification-pairs, verification-observed, verification-review-integration. Это настоящие navigation/keyboard, real runner/import/manual/stale и request/proposal/revision пути; они не подменены scoped renderer. Общий multiproject setup не запускался. Browser health server использовал отдельные3404/3405ports и закрылся после тестов.

Мобильный результат ограничен сохранением исходного оформления. Прежние narrow results/forms содержат horizontal overflow, описанный в Tailwind verification journal; текущие116точных сравнений его не исправляют и не доказывают полную mobile usability. Browser legacy/workspace frames не обозначают native WebView/Meridian qualification. Защищённые профили предыдущей истории не использовались и не изменялись.

## Локальные проверки и остаток

Все запуски использовали закреплённый Node24.19.0 из `react-vite-foundation/.operations/runtime/node-v24.19.0-win-x64` с process-local PATH. Зависимости, Node host и allowScripts не менялись.

| Проверка после переноса | Фактический результат |
|---|---|
| `--no-wasm-code-gc --import tsx --test --test-concurrency=1 tests/verification-ui.test.ts` |4/4PASS; исходный baseline тоже4/4 |
| `--no-wasm-code-gc --import tsx --test --test-concurrency=1 tests/architecture-boundaries.test.ts` |32/32PASS после сохранённых RED |
| `node_modules/typescript/bin/tsc --noEmit` и `-p apps/web/tsconfig.json` |Root/web strict types PASS |
| `node_modules/next/dist/bin/next build --webpack` |PASS, включая Next strict type phase |
| `apps/web/node_modules/vite/bin/vite.js build --config apps/web/vite.config.ts` |PASS14.13s; прежнее chunk-size предупреждение сохранено |
| Existing production-route TWV01, same own profile |104+12GREEN;116exactPNG/metrics |
| Existing3verification browser suites, fresh own profile |3/3PASS1.3m |
| `scripts/check-architecture.mjs` |871files,0violations,11exactlegacyedges |
| `scripts/check-ui-styles.mjs` |5ordinary CSS,4inline-style files,0violations; ledger unchanged |
| `scripts/check-conventions.mjs`, `git diff --check` |PASS |

Generated protocol создал только semantic-zero EOL drift: `git -c core.safecrlf=false diff --quiet -- packages/protocol` подтвердил0, затем восстановлены только generated bin/schemas/version files. Manifest/lockfiles, finite architecture baseline и style ledger не изменялись. Команды, Query/SSE owner, parent/surface context, service, domain/protocol и remaining style families вне diff.

Root peer review принят: конечный public index, отсутствие private exports и reverse legacy dependency, закрытый nested-index обход и source/handler/CSS evidence подтверждены. После review удалены только четыре пустые строки в местах прежних imports; body/runtime и CSS evidence остаются прежними. Разрешён scoped Conventional Commit без push/PR. Полный CI, Linux, external PostgreSQL, native Meridian и owner acceptance всего эпика в этой истории **NOT_RUN / NOT_CLAIMED**; публикация и интеграция принадлежат root.
