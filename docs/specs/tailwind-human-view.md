# Tailwind 4: legacy Human View

Дата: 2026-11-04. Ветка: `codex/tailwind-human-view`, исходная база `5a66071` (общая ProjectSession уже подключена). Основание — принятый React/Vite-план и прямое поручение перенести обычные стили в Tailwind 4.

## Область и границы

История переносит оформление собственных элементов `app/page.tsx`: shell/navigation, roadmap toolbar/table, spec detail/expectation/comparison, decisions, history, context и формы/модалки. В JSX используются реальные utilities и явные презентационные recipes; обычные перенесённые selectors удаляются из `app/globals.css` после проверки потребителей.

Исходный CSS содержит611 обычных правил. Он также оформляет Roadmap/ReactFlow, Agents, HistoricalPanel и другие самостоятельные панели. Их обработчики/компоненты не входят в этот срез. Общие native control/typography/button/status defaults и доказанные внешние consumers остаются точным конечным долгом, пока соответствующие семейства не переведены. Перенос общего CSS в technical base не допускается. Окончательный CSS-переход этим срезом автоматически не объявляется.

## Критерии

- Сохраняются текущие обработчики, identity/query/session lifecycle, права, URL, команды, DOM-порядок, `hidden`/dialog/keyboard и server contracts.
- Нет bulk `@apply`, глобального important, runtime class-to-utility converter или оформления всего экрана одной глобальной descendant utility.
- Исходные production snapshots на отдельном профиле сравниваются с теми же данными после переноса: dark/light,1440×1000 и390×844, shell/graph/table/spec/decisions/history/forms. Измеряются геометрия, typography, цвета, margins/padding/gaps и focus.
- Responsive условия сохраняют исходные inclusive breakpoints и порядок cascade. `display:none` не теряет приоритет над оформлением при hidden; mounted subtree сохраняет свой lifecycle.
- Выполняются профильные существующие browser regressions, строгий TypeScript/build и styles:check с точным reviewed остатком. Исходные FAIL не превращаются в PASS за счёт смены expected.

[Журнал](../plans/tailwind-human-view.md), [общая миграция](../proposals/react-vite-migration/migration-plan.md).
