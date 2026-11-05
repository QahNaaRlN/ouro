# Журнал среза Tailwind 4: AppSelect и WorkspaceDialog

Дата: 2026-11-04. Рабочая ветка: `codex/tailwind-primitives`. [Спецификация и критерии](../specs/tailwind-primitives.md).

Статус: bounded implementation и перечисленные проверки выполнены; передача на review корневому исполнителю. Полный CSS-переход остаётся незавершённым.

## План

1. Зафиксировать исходные стили и browser-состояния примитивов на отдельных fixture-данных.
2. Подключить закреплённый Tailwind 4/PostCSS без Preflight; отделить минимальные token/base стили и ограниченный временный cascade bridge.
3. Перевести AppSelect и WorkspaceDialog на конкретные TSX utilities и удалить их перенесённые обычные CSS-селекторы.
4. Проверить required/search/disabled, native dialog, focus/keyboard, mounted drafts, обе темы и мобильную геометрию; выполнить подходящие typecheck/build и действующие browser regressions.
5. Сопоставить до/после, описать фактические результаты и оставшуюся область полного CSS-перехода. Передать diff корневому исполнителю без commit/push/merge.

## Исходный инвентарь

В исходном Ouro прочитаны 21 собственный CSS-файл (20 global + 1 CSS module), 1977 CSS rules, 6004 declarations, 698 уникальных class tokens и 45 `!important`. Эти значения получены чтением PostCSS AST, а не запуском приложения. 40 TSX-файлов имеют 1304 атрибута className; найдены 15 JSX style и 22 объекта graph style/labelStyle/labelBgStyle. CSS класса теста не является пользовательским контрактом, но его удаление требует одновременной замены соответствующего locator на семантический hook.

## Контроль видов

| Вид | Исходная проверка | После переноса |
|---|---|---|
| Навигация workspace и task dialog, dark/light, desktop/mobile | PASS: 12 PNG и presentation.json, 1 browser case | PASS: те же 12 PNG и метрики |
| Task dialog: open, closed, draft retained, focus restore | PASS: исходный browser case | PASS: TW, BS02, workspace-controls |
| Обычный список, required/string/disabled/empty | Исходные действующие тесты прочитаны | PASS: BS01–02, 3 focused unit cases, aria-description сохранён |
| Search popup, query/empty result/clear/Escape | PASS: исходный browser case, поиск и Escape | PASS: SS01 и TW; popup остаётся в native dialog |
| Consumer className override, dark/light, desktop/mobile | Исходные filter CSS: 4px 5px, 12px, height 34px | PASS: computed styles и клавиатура во всех четырёх состояниях |
| React Flow и onboarding вне примитивов | Исходные действующие тесты прочитаны | PASS: 6 graph + 10 onboarding browser cases |
| Typecheck, production build, Git conventions, CSS syntax | Не объявлялись baseline PASS | PASS: tsc, Next webpack build, conventions, PostCSS parse |

## Выполнение

- Спецификация и этот журнал созданы до изменения исходного кода.
- До изменения кода полностью прочитано установленное руководство Next `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`, сверены принятый стек и существующие Base UI/dialog contracts.
- Закреплены `tailwindcss@4.3.3`, `@tailwindcss/postcss@4.3.3`, `postcss@8.5.32`, `tailwind-merge@3.7.0`; lockfile обновлён через npm точной Node 24.19.0. Tailwind подключён через PostCSS текущего Next runtime. Vite adapter относится к следующему интеграционному срезу. Совместимость tailwind-merge с Tailwind 4.0–4.3 сверена с [официальным README](https://github.com/dcastil/tailwind-merge).
- `app/tailwind.css` содержит theme mapping существующей палитры, два явных source-каталога и utilities без Preflight. Шаг spacing явно равен 4px, чтобы исходный document font-size 14px не уменьшал размеры rem-based utilities. `app/theme.css` сохраняет исходные dark/light variables и минимальную базу документа.
- Временный bridge оборачивает 20 оставшихся собственных stylesheets в `ouro-legacy`; внешний React Flow stylesheet импортирован в этот же слой на исходном месте. Объявлен порядок `theme, base, ouro-legacy, utilities`; fonts остаются внешними импортами. Эти обёртки не считаются конверсией CSS. Глобального `!important` и `@apply` нет.
- AppSelect/Combobox используют явные utilities в TSX; `components/app-select.css` удалён. Контекстные размеры полей перенесены в потребителей (8 TSX-файлов), 31 правило со старыми select/filter selector branches удалено целиком или с сохранением ветвей других элементов. Общие workspace defaults задаёт стабильный `AppSelectAppearanceProvider`; `WorkspaceSelect` сохраняет прежний alias. Consumer `className` объединяется через tailwind-merge после defaults.
- WorkspaceDialog переведён на utilities, его CSS-селекторы удалены из `workspace-ui.css`. showModal/close, focus trap/restore, portal-container и mounted children не изменялись. Сохранены styleless hooks `ouro-select*`, `filter-select`, `ws-dialog*`, используемые действующими locators. Общий `ws-icon-button` остаётся для copy controls вне среза.
- Действующий SSR-тест проверял точное равенство единственного class атрибута. Он адаптирован к проверке hook token вместе с теми же связанными id/aria-describedby и текстом объяснения; доступность не ослаблена.

## Фактические проверки

Проверки выполнялись на Node 24.19.0, с отдельным портом 3364 и новыми `.operations/e2e-*` data directories. Реальный `.ouro` и профили пользователя не использовались.

- До миграции: новый rendered baseline case — **1 passed, 27.8s**. Локальные артефакты: `.operations/visual-before/` (12 PNG, `presentation.json`).
- После миграции: `tailwind-primitives`, `base-select`, `select-search`, `workspace-controls` — **7 passed, 58.7s**. Артефакты сравнения: `.operations/visual-after/` (12 PNG, `presentation.json`).
- Проверка bridge: `onboarding` и `workspace-graphs` — **16 passed, 59.6s**, включая 50 узлов, zoom/minimap/fullscreen, hidden-mounted graphs, narrow viewport, keyboard/inert и onboarding geometry.
- Финальная воспроизводимая `playwright.tailwind.config.ts`: два TW cases — **2 passed, 30.9s**. Повтор требовался для проверки добавленной конфигурации; артефакты `.operations/visual-final/` и `test-results/`.
- `tests/select-availability.test.ts` и `tests/app-select-render.test.ts` — **3 passed** после описанной адаптации class assertion. Direct `tsc --noEmit`, `npm run build` (Next webpack), `node scripts/check-conventions.mjs` — **PASS**. Conventions проверяет Git naming; это не заявление о внедрении будущего architectural lint.
- Все 22 текущих CSS-файла успешно разобраны PostCSS, ordinary селекторы `.ouro-select*`, `.filter-select`, `.ws-dialog*` отсутствуют. Source syntax и отсутствие перенесённых selectors проверены отдельно от rendered behavior.
- Побочные generated outputs исключены после read-only проверки с HEAD: из 75 protocol outputs 74 совпадали побайтово, один отличался только CRLF/LF; `next-env.d.ts` содержал только два dev/types import-пути от Next. В финальном diff protocol и Next declarations отсутствуют. `git diff --check` — PASS.

Сравнены все 12 наборов computed geometry/font/colors до/после: размеры, display, padding, border, radius, background, color и font совпадают. `box-shadow` сериализуется Tailwind с дополнительными прозрачными нулевыми shadows; видимая тень сохранена. Все 12 PNG просмотрены. Четыре navigation PNG совпадают попиксельно; различия в dialog/popup приходятся на случайные ID новых fixture-agents. Дополнительно у light desktop dialog 71 пограничный пиксель округления отличается максимум на 2/255 RGB; геометрия и видимые состояния сохранены. Это проверка перечисленных видов, а не screenshot coverage всех экранов.

В этой Windows-среде Turbopack остановился на создании PGlite junction (`os error 5`), поэтому bounded конфигурация использует webpack и не меняет default launcher. Обычный запуск production build остановился на `EPERM` создания `.next` subdirectory; тот же build с разрешённым локальным доступом завершился успешно. Browser tests также требовали разрешённого доступа к локальным sockets. Эти ограничения не исправлялись изменением продуктового кода.

Для повторения browser suite из данного worktree задаются новый `OURO_E2E_DATA_DIR`, свободный `OURO_E2E_PORT` и, при необходимости, `OURO_TAILWIND_VISUAL_DIR`, затем запускается `npm exec -- playwright test e2e/tailwind-primitives.spec.ts e2e/base-select.spec.ts e2e/select-search.spec.ts e2e/workspace-controls.spec.ts e2e/onboarding.spec.ts e2e/workspace-graphs.spec.ts --config playwright.tailwind.config.ts --workers=1`. Путь точной Node 24.19.0 должен предшествовать системной Node в PATH. Browser output и screenshots являются локальными игнорируемыми артефактами, а не включёнными в Git эталонами.

## Оставшаяся область

Из исходного 21 CSS-файла полностью заменён только `app-select.css`; `workspace-ui.css` переведён лишь в части диалога. **20 исходных файлов всё ещё содержат обычные UI-стили** и временно остаются в legacy-слое:

- `app/globals.css`: legacy shell, таблицы, формы, кнопки, typography и responsive rules за вычетом перенесённых select branches и token/base блока.
- `workspace-styles.css`, `workspace-redesign.css`, `workspace-ui.css`: workspace shell, панели, карточки, формы, accordion/copy/history и прочие controls.
- `workspace-graphs.css`, `workspace-grouped-review.module.css`, `flow-runtime.css`, `spec-flow.css`, `state-transitions.css`: графы, inspector, flow/state presentation и grouped review.
- `agent-proposals-panel.css`, `collaborative-drafts.css`, `github-panel.css`, `impact-panel.css`, `lessons-panel.css`, `participants-panel.css`: соответствующие панели и формы, за исключением перенесённых select branches.
- `meridian-panel.css`, `methodology.css`, `onboarding.css`, `verification.css`, `work-status.css`: остальные специализированные представления.

Пять статических inline styles ProjectSwitcher, остальные JSX presentation styles, графические style/labelStyle/labelBgStyle и оставшиеся media/keyframes требуют следующих атомарных срезов. Fonts, внешний React Flow stylesheet, разрешённые token/base стили и измеряемая runtime geometry учитываются отдельно. Удаление legacy bridge возможно только после реального переноса этого остатка и проверки соответствующих экранов. Срез не заявляет завершение React/Vite/backend migration или интеграции Meridian.
