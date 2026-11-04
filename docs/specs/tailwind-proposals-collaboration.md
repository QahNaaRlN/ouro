# Tailwind 4: предложения и совместные черновики

Дата: 2026-11-04. Статус: согласованный атомарный срез, аудит и исходные снимки. Ветка `codex/tailwind-proposals-collaboration`, основание `381ff34dacb35d90fb5b062b2a50b8866fd5e387`.

## Область и границы

Перенести `agent-proposals-panel.css` и `collaborative-drafts.css` в статические utilities конкретных TSX slots и явные presentation recipes. Проверить всех реальных потребителей, включая вложенные source disclosures, формы рассмотрения, mini Flow preview, редактор общего черновика, readonly/published/identity states и зависимые shared UI slots. Начальный реестр указывает102+41rules; parser-аудит уточнит declarations/media/important до source changes.

Сетевые handlers, request bodies, pending/UNKNOWN/receipt guards, identity/access scope, CRDT/Yjs transaction/update/caret logic, publish history, effects/cleanup и правила mount не меняются ради оформления. DTO type import collaborative-drafts сохраняется до получения принятого parent portable-DTO story. Backend, HTTP, protocol, native integration и будущий hFSD перенос не входят в область. L Human View и G1 graph stories не предполагаются уже объединёнными.

Реальная геометрия graph positions остаётся в layout-механизме. Четыре найденных статических node/edge `style`/`labelStyle`/`labelBgStyle` expressions собственного proposal preview переносятся в className/точные реальные child slots поддерживаемого renderer. Внешний React Flow CSS сохраняется как vendor dependency, не копируется. `workspace-proposals.tsx`, общие G1 graph files и business algorithms не редактируются этим срезом.

## Инварианты

- Ordinary CSS/static inline presentation удаляются после реальной привязки utilities к каждому слоту. Нет bulk `@apply`, runtime class converter, blanket ancestor selector dump или global important configuration.
- Сохраняются labels/roles/hooks/data attributes, текст, доступность, focus, selection/caret, native keyboard behavior и inactive-mounted state. Новые React components — PascalCase; новые public JSDoc — на русском без TS type duplication/`any`.
- Shared defaults переносятся явно у фактических child consumers; оставшиеся общие defaults продолжают числиться ordinary debt с owner, не становятся base exception.
- Baseline снимается до изменений UI на том же runtime, с неизменными IDs/датами/fixtures: dark/light, desktop1440×1000 и mobile390×844. Controlled presentation evidence отделяется от реальной backend/CRDT квалификации; исходные данные после baseline не изменяются неявно.
- Пользовательские профили `.ouro`, действующие подключения и внешние сообщения не используются. Только собственные profiles/processes/порты. Одна тяжёлая сборка/runtime-проверка за раз.

## Критерии

| ID | Проверяемый результат |
|---|---|
| PC01 | Оба stylesheet и все соответствующие imports удалены после переноса фактических consumers |
| PC02 | Предложения: pending spec/summary, история версии/рассмотренные состояния, source/JSON disclosures, Flow preview, review draft/readonly/error notices имеют сравнимый baseline обеих тем и размеров |
| PC03 | Совместный черновик: список/create, сохранённый редактор, несохранённый input/sync, publish/published/history и focus доступны и сохраняют исходное оформление |
| PC04 | Все собственные статические graph presentation objects удалены; алгоритм/positions/fit/handlers не меняются, actual renderer проверен в браузере |
| PC05 | Действующие proposals/collaboration browser regressions проходят; текст/DoD/caret, inactive views, identity recovery и exact pending intents не ослаблены |
| PC06 | Root/web types, Next/Vite builds и соответствующие guards проходят; pixel/computed сравнение сообщает фактические различия без сокрытия |
| PC07 | Exact style ledger обновлён только для реально перенесённого остатка; shared dependencies и техническая geometry указаны по выражениям; scoped local commit без push/PR после review |

Принятое уточнение baseline: на исходном CSS `.collab-create>label` имеет auto min-width и растягивает grid по длинному выбранному названию спеки. При390px воспроизведён459px document, DOM-only min-width:0 у этой точной label даёт390px; minmax только у panel оставляет440px. Root разрешил узкий `min-w-0` конкретной label в этом срезе. Исходная съёмка может лишь записывать известное переполнение в явном `OURO_CAPTURE_LEGACY_OVERFLOW=1`; обычный CI сохраняет строгий root invariant. Изменённые mobile frames классифицируются как намеренное исправление, а не полное pixel identity. Полное имя выбора/доступность/focus проверяются отдельно.

Результаты: [журнал](../plans/tailwind-proposals-collaboration.md). Контекст: [React стек](../proposals/react-vite-migration/react-stack.md), [реестр долга](../proposals/react-vite-migration/style-debt.md).
