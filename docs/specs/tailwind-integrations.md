# Tailwind 4: интеграции и обучение

Дата: 2026-11-04. Ветка `codex/tailwind-integrations`, исходный commit `5175ee9de126a3f4449273c71137b7b0f0028899`. Статус: реализация, bounded technical checks и root source review выполнены; scoped local commit разрешён после palette parity check, push запрещён. Зависимость — опубликованный W-срез; его CI не подменяется результатами этой работы.

## Область

Перенести обычное оформление `meridian-panel.css`, `github-panel.css`, `onboarding.css` в реальные utilities конкретных TSX slots. Потребители: `MeridianPanel`, `MeridianPin`, `MeridianOrigin`, `GitHubPanel`, `WorkspaceOnboarding`/`GuidedTour`, действующий `ProjectOnboarding`. Не менять сетевые функции, request/UNKNOWN/retry/receipt semantics, серверные данные, тексты и состояние форм ради CSS.

`methodology.css`/HistoricalPanel остаются отдельным срезом: private Methodology и остальной `app/page.tsx`/`app/globals.css` принадлежат L. Participants/account не входят в область. После аудита обнаружен ровно один необходимый companion handoff: четыре правила `integration-source-switch` из Meridian stylesheet обслуживают `app/page.tsx`. Новый controlled `IntegrationSourceSwitch(value,onValueChange)` принадлежит P, а L остаётся единственным writer `app/page.tsx` и меняет только import/существующий JSX. Существующие state setter, hidden-mounted wrappers и оба panel drafts сохраняются. Stylesheet не удаляется до этой замены.

## Инварианты

- Utility strings статические, доступны scanner и привязаны к конкретным элементам; устойчивые recipes допустимы. Runtime converter старых классов, bulk `@apply` и blanket ancestor utility dump не считаются переносом.
- Hook classes, semantic labels, `data-onboarding`, refs, handlers, keys, effects и cleanup сохраняются. Общие элементы используют существующий `twMerge` и явные presentation props.
- Точная палитра и отдельная theme boundary Meridian сохраняются без заявления о native-соединении или синхронизации темы. Предпочтение — явный static light/dark utility binding вместо JSX theme style; соответствие проверяется с существующим portable theme adapter.
- Статическое JSX `style` удаляется. Измеряемая viewport/highlight/card geometry переводится только в CSS custom properties без изменения расчёта/наблюдателей. Body scroll lock/restore выполняется узкой utility lease без inline style writes, с сохранением прежних классов/inline значений и безопасным перекрытием владельцев.
- Keyboard/focus, native dialog/inert, Escape/focus restore, сохранённые предпочтения, недоступный target, visualViewport/resize/scroll и reduced-motion поведение сохраняются.
- Общие workspace defaults и legacy native/global controls остаются явно учтённым ordinary CSS до переноса последнего потребителя. Их нельзя объявлять новым base exception. Частичный срез не объявляет полный Tailwind rewrite завершённым.
- Только новые изолированные fixtures/profiles/порты; реальный `.ouro`, native Meridian, действующие подключения и внешние GitHub deliveries не используются. Новые public JSDoc — на русском, без `any` и дублирования TS types.

## Критерии

| ID | Проверяемый результат |
|---|---|
| TI01 | Три обычных stylesheet удалены после переноса всех фактических slots и switch handoff |
| TI02 | Реальные исходные и итоговые снимки Meridian/GitHub/onboarding используют те же IDs/даты/data, dark/light, 1440×1000 и 390×844 |
| TI03 | Theme boundary, read-only/disabled/error/success/loading states и responsive значения сохраняются |
| TI04 | Tour geometry/focus/scroll lock/Escape/restore и оба integration drafts сохраняются при пользовательских переходах |
| TI05 | Существующие Meridian-context/GitHub/onboarding browser regressions проходят; synthetic DTO/controlled HTTP evidence не объявляются native или external qualification |
| TI06 | TypeScript/build/architecture/style debt checks проходят, а final CSS gate по-прежнему честно показывает общий остаток |
| TI07 | Exact runtime expressions и оставшиеся общие consumers отражены в ledger; никаких новых зависимостей/версий или публикации до review |

Связи: [журнал](../plans/tailwind-integrations.md), [W-срез](tailwind-workspace.md), [принятый React стек](../proposals/react-vite-migration/react-stack.md), [реестр долга](../proposals/react-vite-migration/style-debt.md).
