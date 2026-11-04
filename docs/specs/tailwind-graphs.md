# Tailwind 4: графы и учёт процесса

Дата: 2026-11-04. Статус: G1 реализован и проверен в ограниченном scope, замечание review устранено; G2/G3 не начаты. Точные результаты и границы qualification находятся в журнале. Рабочая ветка `codex/tailwind-graphs` первоначально создана от локального Human View `2af5f46`, затем обновлена до проверенного `c15e827` с P1/W/L. Основание — полный CSS-переход принятого React/Vite-эпика.

## Область

Roadmap/Reality, ReactFlow presentation slots, `workspace-graphs.css`, `spec-flow.css`, `state-transitions.css`, `flow-runtime.css` и оставшиеся graph selectors в globals. Readonly исходный инвентарь после L:24+98+68+56=246 правил этих четырёх CSS-файлов,32 graph rules в globals. Графические TSX/конфигурации содержат18 учтённых style expressions: Roadmap3, Reality8, SpecFlow4, StateTransitions3. Каждое выражение рассматривается отдельно; сам факт принадлежности графу не разрешает inline exception.

Последовательные атомарные истории: G1 — shared graph presentation + Roadmap/Reality; G2 — процесс/оси состояний; G3 — runtime-панель. Эта ветка реализует только G1. Специальные process/state controls/attribution и proposal preview получают минимальные companion props при удалении общих globals, а остальные их CSS/inline expressions сохраняются для следующих историй.

G1 удаляет `workspace-graphs.css` (24 правила), 30 graph rules в globals и 11 ordinary expressions Roadmap/Reality. Оставшиеся два graph rules в globals — `.react-flow__handle` и `.react-flow__node.selected .react-flow__handle`: они имеют потребителей в process/state и генерируемых библиотекой default-node handles Reality/proposal preview. Их конечный перенос относится к G2, это обычный долг с точными записями, а не technical exception. Library palette/marker props остаются в public API библиотеки; собственных CSS style objects в Roadmap/Reality больше нет.

Общий presentation boundary находится в `packages/frontend/src/shared/ui/graph`, экспортируется через `index.ts` и явно сканируется Tailwind. Он знает только surface (`legacy`/`workspace`), control tone и slots установленного React Flow. Roadmap/Reality recipes находятся рядом с соответствующими компонентами. Roadmap передаёт `VerificationPairCard.classNames` — optional readonly slots attention/proposals/updated/time. Повторно используемая карточка не импортирует стили, context или recipes своего родителя; default table presentation и все callbacks сохранены.

## Инварианты

- Сохраняются installed ReactFlow APIs и обработчики: zoom/fit/minimap/fullscreen, keyboard, selection, drag position/measurement, hidden-mounted activation и отсутствие повторного auto-fit. Графовые представления не меняют факты, команды, версии, receipts, pending intents, роль и runtime transitions.
- Используются собственные JSX utilities и явные finite presentation variants. Нет bulk `@apply`, global important, runtime class converter либо переноса ordinary CSS в theme/base.
- Внешний ReactFlow CSS остаётся внешней зависимостью. Узкое оформление DOM, которым владеет библиотека, использует её public className/slot boundaries и получает отдельное обоснование. Библиотечные controls/label measurement/routing не переписываются ради доступа к CSS.
- Обычные цвета, размеры и state variants из своих style/labelStyle/labelBgStyle переносятся. Runtime geometry/theme mapper допускаются только после точной классификации и review; blanket graph/component exemption запрещён.
- Измеренные размеры, positions, routed handles, semantic edge classes и finite visual states различаются. Изменение отображения не является поводом менять graph/domain algorithms.
- CSS правила удаляются после проверки всех потребителей; shared global controls/handles/minimap влияют на несколько графов.

### Точные цели отображения

| Исходная настройка | DOM-владелец | Целевое оформление |
|---|---|---|
| `Node.style` | Внешний ReactFlow node div | Public node.className и явные finite variants; статические размеры переносятся без изменения measurements/position |
| `Edge.style` | Только видимый BaseEdge path | Public edge.className с ограниченным slot для `.react-flow__edge-path`; opacity не переносится на весь edge group, иначе изменятся label и hit area |
| `labelStyle` | SVG text | Узкий библиотечный text slot, с сохранением размера/цвета и библиотечного bbox measurement |
| `labelBgStyle` | SVG rect под текстом | Узкий rect slot; fill-opacity отличается от opacity всего label group |
| Controls | Container и внутренние library buttons/SVG | Public className и локальные slots; installed zoom/fit handlers, disabled limits и aria labels сохраняются |
| MiniMap/Handle | Public component slots и их SVG | Явное оформление экземпляров без глобальных selector rules; palette props библиотеки классифицируются отдельно от своих CSS style objects |

Verification-paired Roadmap node получает отдельную проверку winning cascade: общий spec-node и verification-graph-node сейчас имеют разные intrinsic height/padding. Общие utilities не должны отменить CSS ещё не перенесённой VerificationPairCard и нарушить measured layout.

Фактическая исходная позиция Controls/MiniMap задавалась более специфичными library Panel.left/bottom/right (0), которые перекрывали старые offsets 14/22/12/25px. Целевая recipe сохраняет выигравшее значение 0. Для CSS selector tokens со знаком `_` используется `String.raw` и экранирование имён классов: Tailwind иначе трактует `_` как пробел. Это синтаксис статических utilities, без runtime-преобразования исходного CSS.

## Проверки

До source changes создан deterministic G1 fixture baseline на изолированном профиле с фактической готовностью `/api/health`. Сравниваются те же данные в dark/light при1440×1000 и390×844: legacy, workspace Roadmap, keyboard focus, actual graph, planned graph, verification face. В fixture обычная и парная карточки имеют реальные вопрос и предложение через MCP. Настройка темы рабочего пространства выполняется test DOM-атрибутом, поскольку там нет theme toggle; legacy-тема меняется действующей кнопкой. Данные сохраняются между сборками; повторный прогон их не изменяет.

Существующие browser gates: GR01–GR06 (50-spec map, zoom/minimap/fullscreen refusal, source keyboard, first-fit, hidden-mounted graphs), F04/F07/F08/F10/F11 (immutable editor, exact process, chosen/applied/unbound facts), F09 states axes, FR01–FR12 (explicit permission, skip, retries/loops, fork choice/application/resume, legacy/no-invented-runtime и UNKNOWN navigation recovery). Их исходные ограничения сохраняются; ошибки подготовки не называются domain RED.

TypeScript, production builds, architecture guard, exact style debt и актуальные визуальные/функциональные сценарии выполняются перед commit/PR. Обновление реестра конечное и точечное, final mode остаётся FAIL при любом неперенесённом обычном долге. Native Meridian/SSO и production данные не входят в этот UI-срез.

[Журнал](../plans/tailwind-graphs.md), [Human View](tailwind-human-view.md), [план миграции](../proposals/react-vite-migration/migration-plan.md).
