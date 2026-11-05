# Tailwind 4: процесс и диаграммы состояний

Дата: 2026-11-04. Статус: IMPLEMENTED / BOUNDED_QUALIFICATION_PASS / review addressed. Отдельная история G2 `codex/tailwind-process` от проверенного G1 `ff4f138`; G1 source принадлежит владельцу эпика. Исправление fullscreen G1 `c83ed7b` сохранено в G2 идентичной строкой до последующего history sync. Точные границы full/targeted evidence и оставшийся G3/C/P долг находятся в журнале.

## Область и границы

Перенесены `spec-flow.css`98 rules, `state-transitions.css`68 rules и оставшиеся два глобальных handle rules. SpecFlow4 и StateTransitions3 ordinary style expressions удалены после переноса. `flow-runtime.css`56 rules остаётся G3-долгом; необходимые label/input/request companions панели теперь владеют своими utilities в `runtime-inherited-presentation.ts`, без импорта recipes родительского процесса. Исходный общий долг G1:16CSS/1021rules и8inline-files/24expressions; фактический остаток G2:14CSS/853rules,6inline-files/17expressions, без новых exceptions.

Все обработчики, команды, версии, drafts/base epochs, UNKNOWN intent/recovery, selection, keyboard и routing сохраняются. Geometry positions/routed ports, public label padding и marker descriptors не переписываются ради CSS. Перенос касается finite presentation variants и собственного JSX. Библиотечные Handle/Controls/labels используют публичные component slots и className, с сохранением installed implementations.

Снятие двух handle globals затрагивает Roadmap, process/state и генерируемые default-node handles Reality и двух proposal previews. Их точные companions входят в G2. В process handles имеют8px, в state7px, остальные5px; более специфичный прежний selected-node selector меняет background независимо от этих размеров. Эта winning cascade должна сохраниться.

Статические node widths/heights и finite edge paints переносятся в явные readonly recipes. Stroke/width/dash/opacity относятся только к видимому edge path; label text/background являются отдельными slots. Opacity видимого path не распространяется на label group или interaction path. Семантические edge states и их вычисление остаются прежними.

StateNode.width206/height92 остаются прежней библиотечной routing geometry, аналогично Roadmap geometry G1; собственные CSS width/min-height карточки перенесены. Label padding/border radius и marker dimensions остаются public SVG geometry descriptors. Собственных style/labelStyle/labelBgStyle expressions в обоих компонентах больше нет; blanket component exception не вводится.

`process-presentation.ts` и `state-presentation.ts` содержат локальные typed recipes. Цвет evidence сохраняет прежний приоритет has-facts над runtime state. State details используют index только для прежнего adjacent-spacing, последняя строка таблицы явно сохраняет прежний `tbody tr:last-child td` reset. Shared public graph module оформляет собственные Handle props и узкие slots default-node handles Reality/proposal preview. Дубли reduced-motion process/state selectors удалены; действующий общий reduce-motion rule в globals остаётся точным обычным долгом и продолжает покрывать эти элементы.

## Квалификация

До source changes создаются SDD, consumer inventory и production baseline на отдельном профиле/порту. Одни и те же данные используются до и после переноса, без изменения серверного времени. Dark/light1440×1000/390×844: planned graph со всеми видами узлов, selected node/edge inspector, table/draft forms, chosen/applied/fact paints; execution/spec/request/roadmap diagrams, выбранное/current/reserved состояние и list view. G1 TWG01 сохраняется как проверка affected shared handles.

Baseline фактически включает100 TWP01 PNG (25views×4) и24 shared TWG01 PNG. Для computed-style сравнения исключается только diagnostic classname hook, который закономерно появляется у прежде бесклассовых DOM-узлов; все измеренные поля, DOM tags и counts сравниваются без нормализации значений. PNG сравниваются полностью, без масок/threshold.

Existing functional gates: F04/F07 immutable draft/base updates; F08 chosen/applied/unbound/separate attempts; F07/F10 editing nodes/connections; F09 four state axes/human permission/agent ACK/DoD; F11 exact roadmap process; GR01–GR06 measured/hidden graphs, keyboard/fullscreen. Дополнительный scope и повтор определяются фактическим diff, без переписывания assertions ради GREEN.

Root/Vite strict TS/build, architecture, exact style debt, visual comparison и functional gates выполняются перед review/commit. Ledger меняется после review точечно; остальной долг и technical boundaries не расширяются. Весь G/Tailwind/React migration этим срезом не объявляется завершённым; native Meridian/SSO и реальные данные вне области.

[Журнал](../plans/tailwind-process.md), [G1](tailwind-graphs.md), [план миграции](../proposals/react-vite-migration/migration-plan.md).
