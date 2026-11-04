# Журнал Tailwind: legacy Human View

Дата: 2026-11-04. Статус: реализован ограниченный срез, bounded review принят; push/merge ещё не выполнены. Отдельный worktree/branch `codex/tailwind-human-view` от `codex/project-session`, исходная база `5a66071`.

Прочитаны AGENTS.md, CONTRIBUTING.md, установленный Next16.4.3 guide CSS. Исходный `app/globals.css`:611 ordinary rules. Readonly audit связывает517 rules с class tokens app/page (404 без другого TSX consumer,113 общих; предварительный поиск консервативен и не является разрешением массового удаления). Shared/native defaults и external graph/agent/history consumers требуют явного остатка.

Порядок: deterministic production baseline → явные JSX/recipes → review потребителей и удаление перенесённых selectors → rendered comparison → функциональные регрессии/typecheck/build/debt gate → review родителем.

Все данные и browser artifacts создаются в `.operations` отдельного worktree. Профили пользователя, production и репозиторий Meridian не используются.

## Реализация

Оформление shell/navigation/topbar/footer/loading/error/toast, roadmap toolbar/metrics/table/context, spec expectation/comparison/revisions, decisions/execution, timeline/history, private Methodology и контролируемых модалок перенесено в явные readonly presentation slots в `app/human-view/` и конкретные JSX элементы. Нет runtime class converter, `@apply`, глобального important или свалки ancestor utilities. Семантические hook-классы сохранены для действующих tests/consumers.

`app/globals.css`: **611 → 163 ordinary rules**, то есть448 правил удалены;455 reviewed rule/selector-branch edits с учётом частичного удаления comma groups. Файл сократился с2843 до720 непустых строк. Изменён только его точный hash/count в style-debt.json. Другие записи не расширялись; новых ordinary CSS/inline expressions нет. В этой stacked ветке текущий общий остаток —20 CSS/1471 ordinary rules,11 inline files/41 expressions; это не финальный CSS PASS.

Inclusive media variants упорядочены1250/1100/1050/1000/900/760/680/560/520, совместно со vocabulary W-среза. Они сохраняют фактический поздний cascade исходника: например sidebar208px при1250, context280px до900, footer6px18px и gap18px tabs. Для состояния history main явно получает max-width:none, как прежний `.historical-preview .main-content`.

Добавлены только два локальных presentation flags: ExecutionPanel.context и Timeline.comparison. Они заменяют прежние ancestor CSS воздействия на вложенные кнопки/историю; команды, проверки прав, callbacks, lifecycle и данные этих компонентов сохранены. OperatorRecovery сохраняет собственные12px label/textarea overrides, которые иначе проиграли бы новым utilities.

## Проверки и исправленные расхождения

Проверки выполнялись на точной Node24.19.0. Production Next baseline собран до изменения стилей. Новый TWH01 сначала имел ошибочные exact locators для numbered tabs/headings; trace показал «Реальность7», «Ревизии1», «Решения3». Это было исправление fixture до CSS-переноса, не product RED. Исходный production TWH01: **1 PASS,28.7s**,44 PNG/metric sets при dark/light×1440×1000/390×844. Профиль `.operations/visual-profile` сохранялся для повторного чтения тех же данных, без доменных команд.

Промежуточное сравнение реально обнаружило расхождения: tailwind-merge убрал line-height20px у navigation footer после text-size override; поздний CSS footer отменял ранний mobile padding; `.context-selected .btn-full` влиял также на три вложенные ExecutionPanel кнопки; после удаления CSS tabs сохранили user-agent horizontal padding6px. Исправлены явные line-height/padding и узкие presentation slots. Обновления golden images для сокрытия этих отличий не выполнялись.

Итоговый production TWH01 после всех переносов: **1 PASS,21.3s**,44 PNG. **36 PNG попиксельно идентичны** исходнику. Остальные8 содержат только11–17 пограничных пикселей с максимальной разницей1–2/255 RGB; полные before/after и comparison.json сохранены. Все44 измеренных наборов geometry/font/color/padding/margin/gap совпали полностью. Это перечисленное покрытие двух размеров и тем, а не доказательство всех возможных responsive widths.

Финальная проверка исходника после удаления неиспользуемых recipes и уточнения grid tracks: comparison/Blocker используют точные `1fr 1fr`, а не стандартный Tailwind `repeat(2,minmax(0,1fr))`. Повторный Next production build — PASS; TWH01 — **1 PASS,19.2s**,44 PNG,38 полностью идентичны, оставшиеся6 отличаются только11–12 пограничными пикселями с максимумом1–2/255; все44 metric sets идентичны. Артефакты `.operations/visual-review/`. Меняющееся распределение этих малых edge-разниц между повторами сохранено в артефактах и не превращено в заявление о44 exact PNG.

Дополнительная readonly AST-проверка: все129 JSX `on*` bindings и выражения обработчиков точно совпадают с исходным HEAD. Родительский bounded review source/maps/render evidence принят; новые JSDoc и комментарии переведены на русский по D11. Это не заменяет точный CI после синхронизации.

Функциональная группа из16 существующих cases: **15 PASS** и первый R07 завершился5s timeout на холодном identity/store bootstrap. Error context показывал loading и «Вход не выполнен», остальные сценарии затем проходили. Собственная конфигурация ждала только HTML; readiness исправлена на существующий `/api/health`, который готовит backend перед тестом. Без изменения timeout/assertions тот же R07 прошёл **1/1,12.0s total** на новом профиле `.operations/functional-profile-02`. Результат не объявляется единым uninterrupted16/16 run.

Прошедшая группа: обе filter presentations, text-only revision/process preservation, breadcrumb keyboard navigation, concurrent create-response selection, все5 historical/clarification/revoked-agent/Blocker methodology cases, graph/table/mobile/theme, реальная цепочка revision→answer→resume→agent evidence→DoD, HTTP idempotency/stale-version, separate remediation и оба keyboard/exact-process roadmap scenarios.

Root strict TypeScript и Next production build — PASS. Web strict TypeScript и Vite production build — PASS; существующее предупреждение initial579.87kB chunk остаётся, threshold не менялся. Architecture:837 files/0 violations/16 прежних exact edges; HTTP migration baseline47 routes/59 explicit methods — PASS. До точечной актуализации реестра styles:check отказал ровно на изменённом app/globals.css; после неё20 CSS/11 inline files/0 violations. `styles:final` ожидаемо отказывает23 раза из-за оставшегося ordinary debt/legacy layers.

## Точный остаток

163 правила globals остаются обычным долгом: native controls/typography, shared button/icon/heading/status/segmented/table/empty/helper defaults; Roadmap/Reality/ReactFlow nodes and controls; AgentsPanel onboarding/registration. `.table-wrap` оставлен после проверки действительного consumer SpecFlow; удаление общего правила без этого consumer сломало бы его scrolling.

Сохранены также конечные descendant defaults для separately owned methodology consumers: `.request-detail p`, `.request-detail section`, `.request-detail section h3`, `.execution-panel code`, `.execution-panel .btn`; и pointer rule для legacy JSON accordion trigger. Они не стали technical base и не объявлены перенесёнными. `methodology.css`/HistoricalPanel/DecisionMaintenance/OperatorRecovery, остальные специализированные панели, графы и общие defaults получают следующие срезы. Private Methodology() из app/page уже перенесён и не дублируется в P-ветке.

Нативная интеграция Meridian, SSO, pnpm/toolchain и полный hFSD relocation не входят в этот CSS-срез. Текущая база включает P1.2; интеграционные исправления parent-ветки должны быть синхронизированы перед PR/CI.
