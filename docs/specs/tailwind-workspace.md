# Tailwind 4: представление workspace

Дата: 2026-11-04. Ветка: `codex/tailwind-workspace`, исходный commit `72b70be462e73a50731c0e78a517d71a7bc81617`. Статус: согласованный срез реализован, готов к review; открытый C06 воспроизведён на исходном UI и отдельно учтён в журнале. Полный Tailwind rewrite и owner acceptance не объявлены завершёнными.

## Цель и область

Перевести собственное представление workspace на конкретные Tailwind utilities рядом с JSX: оболочка, каталог, проектные разделы, overview/activity/sources, подключения и задания, решения/предложения/история, shared accordion/copy/textarea и пять статических inline styles ProjectSwitcher. В область входят `workspace-styles.css`, `workspace-redesign.css`, `workspace-ui.css` и `workspace-grouped-review.module.css` с их потребителями. AppSelect и WorkspaceDialog используют уже проверенную реализацию предыдущего среза.

`app/globals.css`, legacy `app/page.tsx`, специализированные panel/graph styles и их самостоятельная конверсия принадлежат другим срезам. Ни transport, ни server state, ни request/UNKNOWN/retry/session semantics, ни контракт внешнего API здесь не меняются. Новые зависимости не предполагаются.

После peer review согласовано узкое сохранение consumer-паритета общего аккордеона: явный `triggerClassName`, передача оформления вложенному facts slot в `SpecFlow` и удаление девяти соответствующих legacy trigger rules. Полная конверсия этих panel/graph семейств в область не добавляется; точный список находится в журнале.

## Явная общая зависимость

Исходные workspace styles содержат общие `.ws-shell button/input/textarea/label/h2/h3/h4/p/code/pre/form/details/summary` defaults, которые действуют и на вложенные специализированные панели, графы и onboarding. Корневой исполнитель разрешил временный конечный файл `legacy-shared-defaults.css` для ещё не перенесённых семейств. Это обычный legacy CSS с точным ledger selector/consumer/owner; он не становится base exception и не считается конверсией. Следующие владельцы применяют shared utility recipes к своим конкретным элементам, после чего финальный CSS gate удаляет этот файл.

В собственных workspace TSX defaults задаются явно. Набор ancestor utilities на оболочке, `@apply` и runtime converter старых class names в utilities не заменяют перенос представления.

## Инварианты

- Shared utility recipes описывают устойчивые элементы и варианты UI; одноразовая геометрия и presentation остаются в конкретных компонентах. Строки классов статические и видны Tailwind scanner. `twMerge` даёт явному consumer override приоритет.
- Действующие hook classes, `data-onboarding`, DOM region names и semantic labels сохраняются. Hook classes могут остаться без стилей. Реальные child slots допускают узкие arbitrary variants, а целое семейство native elements не оформляется через общий ancestor dump.
- Один session scope, существующие обработчики/keys/effects и порядок domain actions сохраняются. Native dialogs, mounted forms/hidden graph views, одноразовые ключи, accordion `inert`, clipboard fallback и focus restore не упрощаются ради CSS.
- Dark/light palette, workspace accent, hover/focus/disabled states, ширины и исходные responsive thresholds сохраняются. Снятие старого `[hidden] !important` требует явного сохранения скрытых смонтированных областей.
- Статическая presentation не остаётся в JSX `style`. Измеряемая textarea geometry передаётся только через CSS custom property; resize effect и его cleanup сохраняются.
- Только новые изолированные fixture directories/порты; действующий `.ouro`, реальные назначения и пользовательские профили не используются. Новые source/test описания — JSDoc на русском, без `any` и дублирования TypeScript типов.

## Критерии

| ID | Наблюдаемый результат |
|---|---|
| WTW01 | Workspace-specific ordinary CSS перенесён в собственные TSX/recipes; остаток общих defaults конечен и отдельно учтён |
| WTW02 | Grouped review CSS module удалён после переноса его конкретных slots |
| WTW03 | Все пять статических inline styles ProjectSwitcher заменены utilities; handlers/session/cookie behavior не изменены |
| WTW04 | Каталог, проектные разделы и dialog controls сохраняют вид при dark/light и desktop/mobile; имеются сопоставимые исходные и итоговые снимки |
| WTW05 | Сохраняются keyboard/focus, hidden-mounted views, несохранённые формы при SSE и одноразовый ключ до явного скрытия |
| WTW06 | Действующие workspace/controls/grouped-review/onboarding/graph browser regressions и соответствующие typecheck/build проходят |
| WTW07 | Журнал различает выполненную конверсию, legacy defaults для следующих owners и полный оставшийся CSS-переход |

Связи: [журнал](../plans/tailwind-workspace.md), [предыдущие примитивы](tailwind-primitives.md), [рабочее место](project-workspace.md), [принятый стек](../proposals/react-vite-migration/react-stack.md).
