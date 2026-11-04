# Tailwind 4: первый срез UI-примитивов

Дата: 2026-11-04. Статус: реализация отдельного согласованного среза. Основание — принятые [D01–D16](../proposals/react-vite-migration/decisions.md), [стек](../proposals/react-vite-migration/react-stack.md) и прямое поручение перевести обычные UI-стили в Tailwind 4 с сохранением интерфейса.

## Область

Первый атомарный срез переводит AppSelect/Combobox и WorkspaceDialog на реальные Tailwind utility-классы в TSX. Подключается закреплённая версия Tailwind 4 через PostCSS текущего Next runtime; последующий Vite entry получит собственный build adapter. Перенесённые обычные CSS-селекторы удаляются, а семантические hook-классы могут сохраняться без стилей для совместимости действующих тестов.

Пять статических inline style в ProjectSwitcher оставлены следующему срезу. Все остальные экраны, accordion/copy/history, графы и их CSS остаются явным остатком полного перевода. Story не меняет transport/backend, авторизацию, данные, runtime пользователей, протокол или внешний вид продукта.

## Инварианты

- Tailwind utilities находятся на конкретном JSX или в явной типизированной карте вариантов; перенос CSS в `@apply`/набор глобальных descendant-селекторов не считается конверсией.
- Tailwind не включает разрушающий существующую базу Preflight. Изменение cascade для временного сосуществования старых стилей и utilities имеет ограниченную область и не использует глобальный `important`.
- Временный порядок слоёв — `theme, base, ouro-legacy, utilities`: существующие stylesheets обёрнуты в `ouro-legacy`, внешний React Flow импортирован в этот же слой с сохранением порядка. Это bridge, а не конверсия оставшихся обычных CSS. `!important` имеет обратный приоритет слоёв и не используется для исправления конфликтов примитивов.
- Минимальные стили токенов, темы и базового документа описаны явно. Fonts и React Flow CSS остаются внешними стилями. Runtime-геометрия библиотек не превращается в синтетические динамические имена классов.
- AppSelect сохраняет Base UI, required/string value, доступность пустого/disabled списка, клавиатуру, typeahead/search, portal внутри native dialog и возврат фокуса.
- WorkspaceDialog сохраняет `showModal`/`close`, один close-flow, focus trap/restore и детей смонтированными при закрытии: не теряются неотправленные формы и одноразовые ключи.
- Публичные обработчики/данные не меняются ради CSS. Новый source/test-код не использует `any`; новые описания оформляются JSDoc.
- Consumer `className` имеет приоритет через `tailwind-merge`; единое оформление workspace передаёт стабильный React appearance provider без состояния. Контекстные размеры конкретных полей находятся в TSX потребителя, а не в shared-примитиве.

## Критерии приёмки

| Критерий | Проверка |
|---|---|
| TW01 Закреплённые Tailwind 4 и PostCSS adapter реально генерируют utilities | Lockfile, typecheck/build и computed styles в настоящем браузере |
| TW02 AppSelect обычные стили перенесены в TSX, старый stylesheet удалён | Diff и отсутствие его импорта/обычных селекторов; rendered search/non-search/disabled состояния |
| TW03 WorkspaceDialog обычные селекторы удалены из workspace-ui.css | Diff, rendered open/closed, keyboard trap/restore и сохранность формы |
| TW04 Внешний вид сохраняется в обеих темах и на мобильном viewport | До/после screenshots и ключевая геометрия при 1440×1000 и 390×844 |
| TW05 Popup корректно остаётся в dialog и доступен клавиатурой | `base-select`, `select-search`, `workspace-controls` browser regressions |
| TW06 Старый UI вне среза не получает сброса базовых стилей | Ограниченный cascade bridge и проверка каталога/диалога; отсутствие Preflight/global important |
| TW07 Результат не объявлен полным CSS-переносом | Журнал содержит точный выполненный срез, результаты/ограничения и остаток 21-файлового исходного инвентаря |

Browser-проверки запускаются только с новым изолированным fixture data directory и отдельным портом. Исторические PASS и сохранённые screenshots не подменяют результат текущего среза. Изменение snapshot/expected для сокрытия регрессии не допускается.

## Связи

[Журнал и план среза](../plans/tailwind-primitives.md), [существующий стандарт onboarding](client-onboarding.md), [поведение рабочего места](project-workspace.md).
