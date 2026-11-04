# Tailwind: показатели ожиданий и архив уроков

Статус: реализация разрешена, 2026-11-04. Ветка `codex/tailwind-impact-lessons` от чистого `8c11e9f2a1dc3d18e0387ab5d31a00bf1158ea9f`. [Журнал](../plans/tailwind-impact-lessons.md).

## Результат

Перенести `impact-panel.css` и `lessons-panel.css` в реальные статические Tailwind 4 utilities конкретных TSX-слотов и небольшие presentation recipes. Исходный parser count: Impact 98 rules / 294 declarations / 5 important; Lessons 82 / 292 / 2. Всего 180 правил, 586 деклараций, 7 important и 6 media blocks. Оба stylesheet/import удаляются после переноса реальных consumers.

Impact имеет один inline expression: вычисляемую ширину процентной шкалы. Формула `Math.max(0,Math.min(100,report.percent??0))` сохраняется буквально; значение передаётся через одну типизированную CSS custom property, а width задаётся utility. Expression остаётся в консервативном style ledger до отдельного root review технических исключений.

## Инварианты

- Без изменений queries, команд, расчёта `calculateExpectationImpact`, Intl, timestamp formatting, SQL facts, lesson sources, авторства, публикации, UNKNOWN/exact retry и lifecycle.
- Без новых API permissions, пользовательских профилей, внешних сообщений, bulk `@apply`, runtime class conversion, blanket ancestor CSS, global important или reverse imports из `app/human-view`.
- Сохраняются hooks, labels/roles, раскрытия источников, focus/selection, unsaved forms, filter selection и readOnly controls. Shared/native defaults переносятся явно на реальные child slots; остаток не объявляется base.
- Сначала production baseline неизменённого legacy UI на одном сохранённом собственном fixture: dark/light × desktop 1440×1000 / mobile 390×844. Domain facts и даты неизменны между before/after; auth sessions отделены от domain facts.
- Own config/artifacts: общий multiproject temporary file и чужие profiles не используются. Не более одной тяжёлой runtime-проверки одновременно. Новые компоненты — PascalCase; public JSDoc на русском, без `any` и дублирования TS types.

## Критерии

| ID | Результат |
|---|---|
| IL01 | Оба stylesheet/import удалены, все обычные presentation slots используют utilities |
| IL02 | Impact: no-baseline, unknown/unavailable, доступные 0/50/100%, scoped/historical window, 0 counters, false в реальном JSON, длинные названия и источники сравнимы с baseline |
| IL03 | Lessons: candidates, persisted draft/published/history, filters/empty/details/source JSON, unsaved editors, errors/UNKNOWN и реальные Viewer readOnly доступны без изменения фактов |
| IL04 | Шкала сохраняет точную формулу и rendered width; единственный inline CSS custom property остаётся точным ledger debt |
| IL05 | Действующие impact/lessons browser regressions, keyboard/focus и сохранность форм проходят без ослабления assertions/timeouts |
| IL06 | Nonpresentation source AST до/после совпадает; новые utility candidates принимаются настоящим compiler; root/web types, Next/Vite builds и guards проходят |
| IL07 | Literal counts/remaining debt и actual visual differences записаны; локальный scoped commit без push/PR передан root для review |

Full Tailwind completion, backend/transport/hFSD migration и CI acceptance этим срезом не заявляются.
