# Журнал Tailwind: показатели и уроки

Дата: 2026-11-04. Ветка `codex/tailwind-impact-lessons` от чистого `8c11e9f2a1dc3d18e0387ab5d31a00bf1158ea9f`. [SDD](../specs/tailwind-impact-lessons.md) создан до UI source changes. Реализация и локальная квалификация завершены; root review, интеграция и CI остаются отдельными шагами.

## Результат

Удалены `components/impact-panel.css` и `components/lessons-panel.css` вместе с imports. Parser подтвердил Impact 98 rules / 294 declarations / 5 important и Lessons 82 / 292 / 2. Всего перенесены 180 правил, 586 деклараций, 7 important и 6 media blocks.

Презентация привязана к конкретным слотам двух существующих TSX consumers через статические `impactPresentation`, `lessonsPresentation` и общий `panelElements`. Нет bulk `@apply`, runtime class converter, blanket ancestor CSS или reverse import из `app/human-view`. Новые включительные media variants 750 и 640 добавлены по убыванию.

Ровно один динамический meter expression сохранён как типизированная CSS custom property. Формула `Math.max(0,Math.min(100,report.percent??0))` буквально прежняя; width теперь utility. Expression остаётся в обычном консервативном ledger до root review технических исключений.

Доменные формулы, queries, timestamps/Intl, lesson sources, авторство, публикация, pending intents, UNKNOWN/exact retry и все handlers не менялись.

## База и данные

До source changes прочитан установленный Next CSS guide целиком, включая ordering/production. Baseline снят на production Next 16.4.3 webpack с собственным profile `.operations/impact-lessons-visual-profile-v3`. Metadata: `.operations/impact-lessons-fixture.json`, c0=4, итоговая domain version=20.

Fixture создан настоящими public Store/domain commands. Сохранены две исходные активные спеки, новая цель вне базы, изменение одной исходной цели, optional DoD `required:false`, два вида lesson candidates, опубликованный r1 и черновой r2 урока, ещё один сохранённый черновик и пустой проект. Owner и Viewer — настоящие account/membership роли с отдельными browser sessions. Тестовый mailer только сохраняет invitation в памяти; внешних сообщений нет.

Setup owner закрывается до обращения API к SQL. Конфигурация проверяет статический HTML readiness; health endpoint открыл бы owner до seed. Повторная съёмка читает сохранённые metadata без повторного открытия setup SQL. Общий multiproject temporary file и пользовательские profiles не использовались.

Domain facts, IDs и даты одинаковы before/after. Финальный тест сравнивает полные snapshots основного и пустого проектов до/после. Auth-session rows создаются для реального входа и не объявляются неизменными domain facts. Error/UNKNOWN POST прерываются до commit; успешные receipts не подделывались.

## Визуальная и поведенческая квалификация

84 парных состояния: 21 scene × dark/light × 1440×1000 / 390×844.

- Impact: empty, no-baseline, invalid-window/unknown, доступные 0/50/100%, scoped/historical выбор, empty scope, длинные названия, изменённые controls, source JSON/baseline/method disclosures. Все 12 нулевых счётчиков и фактическая ширина 0/50/100 проверены. False сохраняется в реальном source JSON и unchecked scope controls.
- Lessons: empty, list, published/history, filtered/empty-filter с сохранённым выбором, source JSON, unsaved editor/candidate/spec forms, error/UNKNOWN, сохранённые draft records и настоящий Viewer readOnly.

| Проверка | Фактический результат |
|---|---|
| Frozen legacy baseline | 84 PNG, computed/overflow JSON; domain snapshot неизменён |
| Финальный ILV01 | 84 states PASS; оба domain snapshots неизменны |
| Декодированный RGBA before/final | 84 из 84 полностью одинаковы |
| Сопоставленные computed nodes | 20 отличий только ненарисованного zero-width border; значимых отличий нет |
| Дополнительные observations | 16 уже существовавших meter spans теперь попали в class-based selector из-за имени CSS variable; DOM AST не менялся, ширина проверена до/после отдельно |
| ILV02 | PASS: empty disclosure, закрытые 16 px, Enter/Space/focus, inert и mounted content обеих тем/размеров |
| Финальные ILV01 + ILV02 | 2/2 PASS, 2.8 мин, retries 0 |

Computed audit обнаружил перенос неработавшего selector: `.impact-baseline > .helper-note` не достигал вложенного content, поэтому actual исходный margin был 14 px, а первая recipe задала 12. ILV02 воспроизвёл настоящий presentation RED 12 вместо 14; recipe возвращена к actual generic helper, затем focused GREEN и полная финальная съёмка подтвердили исправление. Assertions и таймауты существующих тестов не ослаблялись.

Новый optional readonly `gridClassName` общего WorkspaceAccordion согласован root. Старый `.impact-method > div` оформлял grid wrapper и оставлял 16 px даже закрытым. Оформление перенесено именно в этот slot; children/open/inert/callback lifecycle сохранён. При пустом prop default class sequence буквально прежняя после twMerge. Local SourceDetail получает только timeClassName для двух прежних вариантов времени; formatter неизменён.

Окончательный мобильный Impact со scoped 100%, длинными labels, zero counters и шкалой просмотрен визуально.

## Source и compiler proof

Normalized nonpresentation AST трёх файлов (`impact-panel`, `lessons-panel`, `workspace-ui`) совпадает с точным base 8c11e9. Исключены только presentation attributes/props/imports и finite style type; clamped-percent expression проверен дополнительно буквально.

Обе workspace textarea geometry calls byte-identical, и оба AST expression hashes совпадают с исходным ledger. Это проверено до обновления whole-file hash: `7a921ccb…` → `f3f4e90b…`. Новых geometry expressions в этом файле нет.

Настоящий Tailwind compiler принимает 323 utility tokens из 401 candidates; оставшиеся 78 — точные legacy hooks из исходных selectors/нативной поверхности, invalid 0. Проверены обе recipes, общий panelElements и TSX className/trigger literals.

Ignored scripts `.operations/check-impact-lessons-source.cjs`, `check-impact-lessons-candidates.mjs` привязаны к неизменному base, а не текущему HEAD. `.operations/compare-impact-lessons.cjs` сохраняет decoded image/computed reports; newly observed node не скрывается как DOM delta.

## Остальные проверки

| Проверка окончательного source | Результат |
|---|---|
| Root strict TypeScript | PASS |
| Web strict TypeScript | PASS |
| Production Next 16.4.3 webpack | PASS |
| Production Vite 7.3.7 | PASS, 2479 modules |
| Architecture | PASS: 859 files, 0 violations, 11 exact legacy edges |
| Migration baseline | PASS: 47 routes / 59 explicit method exports |
| Styles | PASS: 9 CSS / 543 rules, 8 inline files / 28 expressions |
| Conventions | PASS для branch и исходного commit subject |
| Existing impact/lessons regressions | 6/6 PASS, 27.2 s, retries 0, отдельный свежий profile |

Существующие шесть сценариев покрывают настоящий JSON export/fixed cohort, light mobile, candidates/curation/publication, exact spec provenance после потерянного ответа, focus/unsaved draft при concurrent event и явный rebase после доказанного отсутствия receipt. В M07 добавлены geometry assertions 0 → 50 → 0 независимо от способа задания width. Functional run использовал унаследованный production-only config `playwright.proposals-collaboration.config.ts` с новым собственным profile; его fixture helper не вызывался.

Точный Node 24.19.0 — runtime worktree `react-vite-foundation`. Root/web dependencies установлены из cache через штатные `npm ci --ignore-scripts --offline`; manifests/locks неизменны. После protocol build 75 generated outputs сопоставлены с HEAD с нормализацией только EOL: все равны, восстановлены. `next-env.d.ts` и AGENTS.md не менялись.

До baseline setup исправлены две ошибки helper: внутренний ACK использует canonical `confirmResumed` + `ackPhase:'start'`, а причина Fork требует минимум 50 символов. Helper теперь принимает distributive canonical Command union. Незавершённые собственные v1/v2 profiles сохранены; факты не перезаписывались. Это setup failures, не product RED. JSX custom property квалифицирована finite ImpactMeterStyle assertion: contextual CSSProperties checking не принимал её через satisfies; runtime формула не менялась.

Vite сохранил внешние Zod PURE-annotation warnings и предупреждение entry chunk >500 kB: entry 582.78 kB / gzip 176.86, page chunk 430.42 kB / gzip 115.38. Bundle splitting не входит в этот CSS-срез.

Evidence: `.operations/impact-lessons-before`, `impact-lessons-final`, `impact-lessons-final-results`, `impact-lessons-functional-results`, `impact-lessons-helper-red-results` и `impact-lessons-helper-green-results`. Финальные image/metrics comparison JSON находятся внутри final directory. Browser qualification `.browser.ts` запускается явным own config; существующие `.spec.ts` остаются в обычном CI.

## Остаток и передача

На исходном 8c11e9 — 11 CSS / 723 rules, 8 inline files / 28 expressions. После IL — 9 / 543, 8 / 28. Удалены именно 180 правил; meter custom property и обе textarea expressions остаются учтёнными, без blanket technical exemption. App globals, 21 shared default и остальные семейства сохраняют прежних owners.

Root source peer принят: maps, буквальная meter formula и readonly grid slot проверены отдельно. Scope не включает hFSD/transport/backend migration, полный Tailwind final gate или CI acceptance. Подготовлен scoped local commit; push/PR делает root.
