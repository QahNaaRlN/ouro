# Журнал Tailwind workspace

Дата: 2026-11-04. Ветка `codex/tailwind-workspace`. [Спецификация](../specs/tailwind-workspace.md).

## План

1. Зафиксировать чистый исходный commit, прочитать relevant installed Next CSS guide, создать спецификацию и журнал до source changes.
2. Снять сравнимые rendered baseline каталога, проекта, решений/истории, подключения и task dialog на новых fixture data при dark/light и desktop/mobile.
3. Выделить явные shared utility recipes; конечный ledger общих legacy defaults сохранить отдельно для следующих panel/graph/onboarding owners.
4. Перенести собственное workspace presentation в конкретные JSX slots, удалить перенесённые selector rules и CSS module, заменить пять статических ProjectSwitcher styles и textarea runtime height на custom property.
5. Сопоставить rendered states, проверить действующие функциональные regressions, typecheck/build, обновить статус и точный остаток. Передать без commit/push.

## Исходное состояние

- `git branch --show-current`: `codex/tailwind-workspace`.
- `git rev-parse HEAD`: `72b70be462e73a50731c0e78a517d71a7bc81617`.
- `git status --short` до установки зависимостей и этой документации: пусто.
- После предыдущего primitives story весь исходный legacy остаток: 20 CSS-файлов, 1920 rules, 5730 declarations, 45 `!important`, 50 media at-rules. Собственная область workspace: 408 rules / 1066 declarations в трёх stylesheets и grouped-review module; общие defaults включены в эти числа.
- Vite peer review выполнен read-only; корневой исполнитель принял fixes asset fallback и router-aware project location port. Данный styling story сохраняет default существующего runtime и не внедряет параллельный router.

## Результаты

| Проверка | До переноса | После переноса |
|---|---|---|
| Каталог / проект / controls, dark/light, 1440×1000 и 390×844 | 40 исходных PNG | 40 PNG, все RGBA-пиксели идентичны исходным |
| Decisions/history, overview, expanded attempt, task/connection/decision dialogs | Те же fixture IDs, даты и данные | Геометрия, шрифты, цвета и отступы совпали; domain cursor/state не изменились |
| Focused unit: select availability, render/accessibility, verification UI | Проверки предыдущего среза | 7 PASS |
| Настоящие SSE, drafts/keys, onboarding, hidden graph views, keyboard | Действующие browser regressions | 35 PASS; новый WTW02 после ожидания готового label: PASS |
| Legacy consumer trigger overrides / активные вкладки при hover / hidden-mounted regions | Конфликты обнаружены peer review | WTW02/03/04: 3 PASS на замороженном source, trace сохранён |
| Финальные typecheck / production build | Проверены в предыдущем срезе | PASS / PASS, Node 24.19.0, Next webpack |
| Conventions / diff check | Чистая исходная ветка | PASS; финальный diff check повторяется после генераторов |

Визуальная проверка `WTW01` использует реальный API/MCP для однократного создания изолированного проекта и фиксирует допустимый `connecting`-вид EventSource. Это устраняет случайное изменение live-индикатора между снимками и **не квалифицирует SSE**. Настоящий EventSource, сохранность черновиков и одноразовых ключей проверяются отдельными функциональными regressions без этой подмены. Попытка ожидать `connected` в исходном визуальном fixture завершилась таймаутом в `reconnecting`; она не считается продуктовым RED.

Исходное UI взято из `git archive 72b70be462e73a50731c0e78a517d71a7bc81617`, запускалось последовательно с текущим UI, одним владельцем выделенного data directory. Архив `.operations/workspace-baseline.zip` сохранён; временная распаковка удалена перед финальным TypeScript/build, чтобы копия репозитория не попала в `**/*.ts`.

Авторитетные локальные артефакты: `.operations/visual-original-complete` и `.operations/visual-final` — по 40 PNG и `presentation.json`. Сравнение декодированных RGBA даёт 40 идентичных пар / 0 отличающихся. В computed styles есть только четыре невидимых сериализации нулевой границы decision dialog (`0px solid …` → `0px none …`); видимых отличий нет. Вручную просмотрены desktop expanded attempt/task dialog и mobile catalog/decision dialog. Предыдущие промежуточные наборы не используются как итоговое доказательство.

## Остаток общих defaults

Удалены четыре исходных файла: `workspace-styles.css`, `workspace-redesign.css`, `workspace-ui.css`, `workspace-grouped-review.module.css`, а также их imports. Их исходные 408 rules / 1066 declarations включали общие defaults. В `components/legacy-shared-defaults.css` остаются **21 rule / 23 selector branches / 80 declarations / 0 !important**. Чистое уменьшение — 387 rules / 986 declarations за счёт реальной конверсии действующих slots и удаления неиспользуемых/дублирующихся правил; это не утверждение, что 387 правил были механически переписаны один к одному.

| № | Точный selector | Остаточные потребители и владелец удаления |
|---|---|---|
| 1 | `.ws-shell a` | Вложенные onboarding/auth/verification/graph links; владельцы этих семейств |
| 2 | `.ws-shell a:hover` | Те же links; владельцы этих семейств |
| 3 | `.ws-muted` | В частности `verification-panel.tsx`; владелец verification |
| 4 | `.ws-shell p` | Onboarding/auth/verification/graph paragraphs; владельцы этих семейств |
| 5 | `.ws-shell h2` | Auth и вложенные панели; владельцы этих семейств |
| 6 | `.ws-shell h3` | Onboarding/verification/graph headings; владельцы этих семейств |
| 7 | `.ws-shell h4` | Вложенные verification/graph sections; владельцы этих семейств |
| 8 | `.ws-shell code,.ws-shell pre` | Auth/onboarding/verification/graph evidence; владельцы этих семейств |
| 9 | `.ws-shell pre` | Те же preformatted evidence/config blocks; владельцы этих семейств |
| 10 | `.ws-shell form` | `EmailLogin`, `ProjectMembersPanel`, вложенные формы; auth/panel owners |
| 11 | `.ws-shell label` | Auth/onboarding/verification/graph control labels; владельцы этих семейств |
| 12 | `.ws-shell input:not([type=checkbox]),.ws-shell textarea` | Те же native controls; владельцы этих семейств |
| 13 | `.ws-shell textarea` | Вложенные формы; владельцы соответствующих семейств |
| 14 | `.ws-shell textarea[readonly]` | Вложенные readonly config/evidence; владельцы соответствующих семейств |
| 15 | `.ws-shell button` | Onboarding/auth/verification/graph и ReactFlow controls; владельцы этих семейств |
| 16 | `.ws-shell button:disabled` | Те же native buttons; владельцы этих семейств |
| 17 | `.ws-shell button:not(:disabled):hover` | Те же native buttons; владельцы этих семейств |
| 18 | `.ws-shell :is(button,a,input,textarea,summary,[tabindex]):focus-visible` | В том числе focusable graph nodes; владельцы этих семейств |
| 19 | `.ws-shell details` | Вложенные раскрываемые панели; владельцы соответствующих семейств |
| 20 | `.ws-shell summary` | Те же disclosures; владельцы соответствующих семейств |
| 21 | `.ws-project-page>.ws-map>.graph-container` | Корень Roadmap: height 100% / min-height 0; graph owner переносит на фактический root |

Фактические границы вложения: `workspace-catalog` → `WorkspaceOnboarding`/`EmailLogin`; `workspace-navigation` → `AccountLogout`; `workspace-members` → `ProjectMembersPanel`; `workspace-project-view` → `VerificationPairCard`, `WorkspaceVerification`, `Roadmap`, `SpecFlow`, `RealityGraph`. Не все legacy panels отображаются внутри workspace: наличие других stylesheet-файлов само по себе не объявляет их текущими потребителями этих defaults.

Собственные workspace elements получают recipes явно. Shared `useWorkspaceAppearance` позволяет следующему владельцу выбрать оформление React-контекстом. Он не вводит DOM ancestor lookup. После переноса последнего вложенного потребителя финальный CSS gate удаляет весь файл: это временный ordinary legacy CSS, а не постоянное base exception.

Вне `.ws-shell` legacy Human View продолжает использовать defaults из `app/globals.css`; его владелец должен заменить их явным оформлением при своём переносе. В `workspace-proposals.tsx` остаются ReactFlow node/edge `style`, `labelStyle`, `labelBgStyle`: они принадлежат graph story. JSX wrapper `FlowPreview` и все пять ProjectSwitcher `style` уже переведены на utilities; не заявляется, что весь graph presentation или весь проект свободен от inline styles.

AST-проверка всех `app/components` TSX: 19 явных `hidden` attributes, из них 17 в двух перенесённых workspace файлах получили `[&[hidden]]:hidden`. Ещё два — plain div переключения GitHub/Meridian в `app/page.tsx` вне `.ws-shell`; удалённое общее workspace rule к ним не применялось. В других собственных panel/graph компонентах таких attributes нет; imperative `.hidden=`/`setAttribute('hidden',…)` не найдено. WTW04 дополнительно проверяет, что каждый фактически смонтированный `.ws-shell [hidden]` имеет computed `display:none`. Новый global `!important` не добавлен.

Оставшийся ordinary legacy CSS по всему этому исходному worktree: **17 файлов / 1524 rules / 4702 declarations / 42 !important / 39 media at-rules**. Счёт исключает foundation `app/theme.css` и `app/tailwind.css`, а также внешние зависимости. Он включает данный временный файл, `app/globals.css`, специализированные panels/onboarding/graph styles. Полный CSS rewrite и его final gate остаются обязательным отдельным результатом.

Здесь PostCSS `walkRules` считает также один keyframe step в `app/globals.css`; машинный style-debt gate исключает keyframe steps и поэтому получает **1523 ordinary rules** при том же остатке.

## Проверка границы общих элементов

Независимый review выявил, что новый utility-слой базового `WorkspaceAccordion` выигрывает у старых consumer trigger selectors в `ouro-legacy`. Согласован узкий `triggerClassName` API с последним `twMerge` и явные utilities в следующих конечных slots. Удалены только девять перенесённых trigger rules / 42 declarations в семи специализированных CSS; остальная конверсия этих семейств остаётся их будущим владельцам.

| Семейство / исходный selector | Явный потребитель |
|---|---|
| `.proposal-source>.ws-accordion-trigger` | `agent-proposals-panel.tsx`: источник предложения |
| `.collab-flow .ws-accordion-trigger` | `collaborative-drafts.tsx`: внешнее раскрытие; `SpecFlow.factsTriggerClassName` передаёт 13px также вложенным фактам без узлов |
| `.historical-source .ws-accordion-trigger` | `historical-panel.tsx`: запись исторического основания |
| `.impact-source>.ws-accordion-trigger` | `impact-panel.tsx`: первичная запись основания |
| `.impact-counter-sources>.ws-accordion-trigger` | `impact-panel.tsx`: основания счётчика |
| `.impact-new-goals>.ws-accordion>.ws-accordion-trigger,.impact-baseline>.ws-accordion-trigger,.impact-method>.ws-accordion-trigger` | `impact-panel.tsx`: новые цели, база и метод расчёта |
| `.lesson-sources .ws-accordion-trigger` | `lessons-panel.tsx`: `SourceFacts` |
| `.meridian-preview .ws-accordion-trigger,.meridian-origin .ws-accordion-trigger` | `meridian-panel.tsx` и `meridian-origin.tsx`: источники synthetic imported context |
| `.state-transition-history .ws-accordion-trigger` | `state-transitions.tsx`: история переходов |

Child span rules и не конфликтующие root/content styles не переносились. `WorkspaceTextarea`/`WorkspaceCopyValue` проверены по фактическим verification consumers: дополнительных конфликтующих override не найдено. Ещё один finding — general button hover побеждал active underline по specificity; в конкретном navigation recipe добавлен active+hover border-bottom variant. Новые WTW03/WTW04 проверяют реальные consumer geometry/focus и обе активные навигации. Базовая geometry 40 ранее совпавших снимков этой правкой не изменяется; отдельный повтор всего набора не требуется.

## Выполнение

Спецификация и журнал созданы до source changes; установленный Next CSS guide прочитан. `npm ci --ignore-scripts` в собственном worktree: 206 packages, 0 vulnerabilities; package/lock не менялись. Используется Node 24.19.0 из согласованного локального runtime.

Представление перенесено в static Tailwind strings конкретных JSX slots, локальные `presentationSlots` с осмысленными именами и `workspacePresentation` recipes. Runtime converter, `@apply` и blanket ancestor utilities отсутствуют. `twMerge` оставляет consumer override последним. Новые inclusive `at-most-*` variants сохраняют исходные `max-width: Npx` и порядок убывающих порогов: произвольные media variants Tailwind иначе сортировались лексически. Измеренная высота textarea передаётся через `--ouro-textarea-height`; эффекты/ResizeObserver cleanup сохранены. `[hidden]` на смонтированных областях получает явную utility; источники state/session/commands не перенесены.

Функциональный профиль: `.operations/e2e-workspace-regressions`, порт 3366; visual fixture и все созданные данные находятся только в этом worktree. Рабочий `.ouro`, реальные агентские назначения и другие runtime profiles не используются. После выполнения среза корневой исполнитель отдельно разрешил локальный commit и синхронизацию с текущим эпиком; публикация остаётся у корневого исполнителя.

Первый функциональный run: 35 PASS / 1 FAIL (4.2m). FAIL нового WTW02 был обращением к отсутствующему на момент замера `closest('label')`; после ожидания готового label проверка прошла (1 PASS, 28.9s). Это ошибка синхронизации теста, а не подтверждённый продуктовый RED. Финальный typecheck выявил недостижимое style-условие `mode==='manage'` внутри `mode!=='manage'`; оно удалено без изменения видимого состояния, повторный typecheck PASS.

Расширенный run затронутых legacy семейств: 23 PASS / 3 FAIL (3.3m). В WTW03 ошибочно ожидался goal в раскрытом `RevisionActivated` payload; исправлен assert на реальную сохранённую запись `RevisionActivated`, геометрия и keyboard/focus не ослаблены. C05 delayed GET первоначально завершился ошибкой `route.fetch: Request context disposed` внутри callback; других первичных assertion/timeout ошибок отчёт не содержит. Без изменения canonical test/source этот C05 прошёл traced rerun. Финальный WTW02/03/04 run: **3 PASS (38.4s)**; итоговые trace лежат в `test-results/tailwind-workspace-*`.

**Открытая проверка C06.** Сценарий `C06 two real human sessions converge…` не прошёл: после setup отсутствует combobox «Спецификация для черновика», failure snapshot показывает roadmap. Замороженный current source воспроизвёл сбой; точный исходный UI `72b70be` из архива на том же изолированном data profile также завершился тем же assertion (28.0s). Current trace фиксирует оба реальных клика по `button.nav-item` «Черновики»: visible/enabled/stable, hit point (103.5,654), `click action done`, без interception; setup успел увидеть «Совместные черновики», затем failure snapshot снова показывает roadmap. Legacy URL остаётся `/`, выбор вкладки определяется React state/class, `aria-current` в этой legacy navigation не задан. Это не доказательство причины state reset; HMR/overlay/продуктовая причина не объявляются установленными. C06 остаётся **FAIL, reproduced on baseline**, а не PASS.

Сохранённые отдельные артефакты C06: `.operations/workspace-c06-current/collaboration-C06-two-real-0b4b0-nd-publish-distinct-authors/{trace.zip,error-context.md}` и `.operations/baseline-browser-results/collaboration-C06-two-real-0b4b0-nd-publish-distinct-authors/{trace.zip,error-context.md}`. Они не перезаписываются итоговыми control tests. Другие пять canonical collaboration cases прошли, включая C05 на повторе; semantic assertions этих тестов не менялись. Не заявляется полный зелёный расширенный suite или квалификация CRDT этим срезом.

После сборки проверены 75 generated protocol outputs: 74 byte-identical HEAD, один отличается только LF/CRLF. `next-env.d.ts` после production build также равен HEAD после нормализации LF/CRLF. Только эти 76 generated outputs восстановлены из исходно чистого HEAD; пользовательский source и root/main не затронуты. Финальные focused unit **7 PASS**, direct TypeScript **PASS**, production build **PASS**, conventions/diff check **PASS**. Повторное чтение/decode сохранённых 40 пар PNG подтвердило **40 identical / 0 different**.
