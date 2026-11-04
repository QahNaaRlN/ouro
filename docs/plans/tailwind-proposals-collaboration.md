# Журнал Tailwind: предложения и совместные черновики

Дата: 2026-11-04. Ветка `codex/tailwind-proposals-collaboration`. [SDD](../specs/tailwind-proposals-collaboration.md) создан до изменения UI. Реализация и локальная квалификация завершены; публикацией и CI управляет root.

## Результат и границы

Удалены `agent-proposals-panel.css` и `collaborative-drafts.css`: 143 обычных правила, 457 деклараций, 5 important и 4 media blocks. Оформление находится в конкретных TSX-слотах и статических `proposalPresentation`, `collaborationPresentation`, `panelElements`. Bulk `@apply`, runtime converter и global important не добавлялись.

Четыре статических React Flow objects (`node.style`, `edge.style`, `labelStyle`, `labelBgStyle`) заменены utilities. Dagre layout/positions, markers, Background, React Flow API и vendor CSS сохранены. Экранированные literal SVG selectors проверены в скомпилированном CSS и actual renderer.

Handlers, HTTP/SDK/CRDT/Yjs, очереди, pending intents, identity recovery и lifecycle не менялись. Nonpresentation AST обеих панелей совпадает с принятым parent. В `ParticipantLogin` добавлены только optional typed input/caption slots; стандартная поверхность P42 сохраняется. Два collab consumers передают `box-border min-w-0` и точную caption recipe.

## Основа и последовательность

1. Работа начата от чистого `381ff34`; прочитан установленный Next CSS guide. Parser подтвердил proposals 102 rules / 338 declarations / 5 important и collaboration 41 / 119 / 0.
2. До source changes созданы реальные изолированные fixtures и сняты 68 состояний с неизменными IDs и датами.
3. Принятый parent `d30f4a3` объединён в merge `133e5bb`. Его первоначальный заголовок `a9aa747` исправлен message-only по Conventional Commits: commit tree `86098194` и подготовленный A source совпали до/после. Три конфликта разрешены только как ordered variants union и фактический style ledger; P3 switch/theme/lease, L presentation, P42 defaults и portable collaborative DTO import сохранены.
4. До изменения общего login дополнительно сняты 68 состояний принятого parent. Затем перенесены собственные слоты и минимальные presentation props. Общий файл не менялся до получения parent.
5. Source заморожен перед финальной production-сборкой, визуальной проверкой и существующими browser regressions.

Собственные изменения защищены retained backups `45fdc7b` и `ec6d758`. Второй stash создал запись, но его cleanup pathspec отказал на уже удалённом stylesheet. После проверки tracked source против backup четыре собственных файла временно восстановлены к parent для съёмки и возвращены из той же записи. Записи и ignored baseline/profile сохранены.

## Визуальные доказательства

Одна сцена на отдельный browser context: dark/light × 1440×1000 / 390×844 × 17 состояний. Предложения: empty, spec с источником/JSON/Flow table, несохранённый draft с selection, история, summary, reviewed, dismissed, adopted. Совместный редактор: empty, list, saved, base flow, pending, offline, denied, publish-unknown, published.

Fixtures создаются через настоящие HTTP/MCP SDK команды один раз. Только write-fault scenes останавливают POST до сервера; GET/polling и application owner реальны. Canonical project/draft snapshots до и после каждой полной съёмки равны. Credentials не сохраняются. Пользовательские профили `.ouro` не использовались.

| Свидетельство | Фактический результат |
|---|---|
| Исходный baseline `381ff34` | 68 PNG и computed/overflow JSON |
| Принятый parent, тот же profile | 68 PNG и computed/overflow JSON |
| Финальный source, strict root invariant | 68 состояний + PCV02 PASS, 2.2 мин |
| Декодированные RGBA против parent | 52 из 52 неизменённых кадров полностью одинаковы |
| Остальные 16 кадров | Намеренное mobile overflow correction, обе темы |
| Computed comparison неизменённых кадров | 28 отличий только ненарисованного zero-width border или float <0.001; значимых отличий нет |

Исходный дефект: `.collab-create > label` с auto min-width распространял min-content длинного выбора на весь grid. При viewport 390 document имел 459 px в 16 nonempty collaboration scenes. DOM-only `min-width:0` этой label давал 390; `minmax` только panel оставлял 440. Root разрешил узкое исправление собственной label. Baseline-only `OURO_CAPTURE_LEGACY_OVERFLOW=1` записывает старое переполнение; обычный CI и PCV02 сохраняют строгий invariant.

PCV02 получил настоящий RED на parent: после выбора точной fixture spec document 429 при 390. Затем GREEN проверил document, select/input bounds, полное имя из actual ProjectState, читаемый option, keyboard open/Escape, неизменный value и восстановление focus обеих тем. Первоначальный произвольный length threshold оказался ошибкой теста и заменён actual source до product RED. Ни timeout, ни semantic assertions не ослаблялись.

Comparator также обнаружил исходное правило `tbody tr:last-child td {border:0}`: оно превосходило старый proposal stylesheet. Его точное действие перенесено на последний реальный row slot; TH font/color/background и SVG shrink теперь явные. После этого все 52 неизменённых PNG совпали. Мобильный итоговый экран списка просмотрен визуально.

Локальные evidence в ignored `.operations`: `proposals-collaboration-before`, `proposals-collaboration-parent-before`, `proposals-collaboration-final`, `proposals-collaboration-final-images.json`, `proposals-collaboration-final-metrics.json`; соответствующие `*-results` содержат traces. Profile: `proposal-collaboration-visual-profile`, metadata: `proposals-collaboration-fixture.json`. CI-тест снимает новые states и проверяет semantic/geometry invariants; локальное сравнение RGBA выполнено отдельно.

## Проверки окончательного source

| Проверка | Результат |
|---|---|
| Root strict TypeScript | PASS |
| Web strict TypeScript | PASS |
| Production Next 16.4.3 webpack | PASS |
| Production Vite 7.3.7 | PASS, 2479 modules |
| Architecture | PASS: 857 files, 0 violations, 11 exact legacy edges |
| Migration baseline | PASS: 47 routes / 59 explicit method exports |
| Style ledger | PASS: 11 CSS / 723 rules, 8 inline files / 28 expressions |
| Conventions | PASS для ветки и merge subject |
| PCV01 + PCV02 | 2/2 PASS на окончательном source |
| Существующие proposals/collaboration/SP21 | 12/12 PASS, 1.1 мин, новый отдельный profile, retries 0 |

Двенадцать существующих тестов проверяют настоящие HTTP/stdio SDK adoption и UNKNOWN, сохранённые inputs/history/focus, явное обновление основы, two-human Yjs/DoD/relative caret/offline convergence/publication, re-entry после 401, cross-tab actor и переиспользование mounted review draft. Их assertions и таймауты не менялись. Финальный rerun выполнен после последнего table-slot correction.

Использован точный Node 24.19.0 из `.operations/runtime` worktree `react-vite-foundation`. Root dependencies установлены штатным `npm ci --ignore-scripts`; web dependencies — `npm ci --ignore-scripts --offline` (81 package, 0 vulnerabilities). Manifest/lockfiles не менялись. После parent sync потребовалась штатная protocol build для нового HTTP DTO export; начальные unresolved DTO/dependency проверки были setup failures, не product RED.

Начальный запрос сборки не стартовал из-за automatic review timeout до CreateProcess; разрешённый повтор прошёл. Обычный build также встретил EPERM на собственном `.next`; разрешённый build прошёл. После генерации 74 tracked outputs сопоставлены с HEAD с нормализацией только EOL: все 74 равны, восстановлены. До parent merge такая же проверка подтвердила 75 outputs. `next-env.d.ts` и AGENTS.md не менялись.

Vite сохранил предупреждения об annotations в внешнем Zod и chunk >500 kB: entry 582.78 kB / gzip 176.86 kB. Bundle splitting не входит в этот CSS-срез; предупреждение не скрывалось.

## Точный остаток

| Срез | Ordinary CSS | Inline files / expressions |
|---|---|---|
| Старт A на `381ff34` | 14 / 1345 rules | 9 / 32 |
| Принятый объединённый parent до A | 13 / 866 rules | 9 / 32 |
| После A | 11 / 723 rules | 8 / 28 |

Остаются `app/globals.css` (163 rules), `legacy-shared-defaults.css` (21), flow-runtime, impact, lessons, methodology, spec-flow, state-transitions, verification, work-status и workspace-graphs. Shared defaults/native rules не стали base exception. Три onboarding geometry expressions, другие graph/runtime styles и vendor CSS этой историей не квалифицируются.

Source hFSD move, transport/backend/Meridian changes, полный Tailwind final gate и CI GREEN здесь не заявляются. Подготовлен локальный scoped commit для root review; push/PR делает root.
