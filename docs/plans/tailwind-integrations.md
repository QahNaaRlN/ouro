# Журнал Tailwind integrations

Дата: 2026-11-04. Ветка `codex/tailwind-integrations`. [Спецификация](../specs/tailwind-integrations.md).

## План

1. Зафиксировать исходную ветку и исходники; прочитать установленный Next CSS guide и согласовать cross-owner slots.
2. Подготовить deterministic visual fixtures, снять реальный baseline всех трёх семейств при dark/light и desktop/mobile до source changes.
3. Перенести конкретные slots и native controls на utilities, static theme binding и измеряемые custom properties; согласовать с L controlled source switch.
4. Сопоставить PNG и computed geometry/theme/focus; выполнить относящиеся functional browser regressions.
5. Актуализировать только затронутые точные debt records, проверить build/types/guards и передать на review без commit/push.

## Исходное состояние и аудит

- Worktree создан по поручению root от `5175ee9de126a3f4449273c71137b7b0f0028899`; до установки зависимостей `git status --short` пуст.
- Точный Node 24.19.0 и bundled npm из согласованного foundation runtime. `npm ci --ignore-scripts`: 206 packages / 0 vulnerabilities; manifest/lock не менялись. Установленный `next/dist/docs/01-app/01-getting-started/11-css.md` прочитан до source changes.
- Scope уточнён с root и L: Meridian/GitHub/onboarding; methodology/HistoricalPanel/app global rewrite остаются отдельными owners. Participants/account не изменяются.

| Stylesheet | Rules | Declarations | `!important` | Media |
|---|---:|---:|---:|---|
| meridian-panel.css | 73 | 265 | 2 | max-width950, reduced-motion |
| github-panel.css | 73 | 257 | 3 | max-width950, reduced-motion |
| onboarding.css | 32 | 125 | 5 | max-width700/420, reduced-motion |
| Всего | 178 | 647 | 10 | 7 at-rules |

JSX presentation expressions: Meridian theme mapper — один; onboarding pane/highlight/card geometry — три. Ещё две прямые DOM writes — body overflow lock/restore. GitHub/Origin/ProjectOnboarding статических `style` attributes не содержат. Palette принадлежит `packages/meridian/src/theme.ts`; UI не должен выдавать explicit-theme rendering за native synchronization.

Четыре `integration-source-switch` selector rules — cross-owner consumer в `app/page.tsx:1443`. Root разрешил controlled pure component; L подтвердил sole ownership app/page и согласовал узкую замену import/JSX. Зависимый patch применяется после baseline и готовности компонента, до удаления Meridian CSS. Остальные hidden wrappers/state/handlers не меняются.

## Квалификация

| Проверка | Статус |
|---|---|
| Deterministic rendered baseline | PASS: production build, 60 PNG / 15 состояний × 2 темы × 2 viewport |
| Actual utility conversion / L switch handoff | IMPLEMENTED; L применил только import + controlled JSX в app/page |
| Pixel/computed/focus/theme parity | 60 rendered states PASS; 57/60 exact RGBA, три ограниченных raster-различия ниже приняты root в bounded review; canonical palette browser guard PASS |
| Functional Meridian/GitHub/onboarding browser | 21 PASS / 49.0 s; после уточнения Meridian border — ещё 5 Meridian PASS / 42.7 s; после review scroll lock — 11 onboarding PASS / 58.9 s |
| TypeScript/build/guards/debt ledger | Root tsc / production Next / strict web tsc / Vite build PASS; architecture 776 files / 0 violations / 16 exact legacy edges; conventions PASS; 38 gate tests PASS; styles check PASS; final ожидаемо FAIL |

Root source review выполнен; scoped local commit разрешён после palette parity PASS. Push/merge не разрешены и не выполнялись. Final Tailwind qualification не заявляется. Root-owned W и P1 ветки не изменяются.

## Исходные снимки и перенос

- Исходный production Next build PASS на неизменном UI. TI01 PASS за 59.4 s: `.operations/integration-before` содержит 60 PNG и `presentation.json`, trace — `.operations/integration-before-results`. Fixtures/profile/идентификаторы/даты сохранены и используются повторно; реальная рабочая `.ouro` не открывалась.
- До этого были два setup/capture отказа, не product RED: узкая legacy-навигация требовала открытия фактического hamburger; hard-entry workspace в исходном Next не задаёт html data-theme. Capture helper теперь открывает меню и явно задаёт workspace-тему, как W baseline. Timeout/retry/semantic assertions не ослаблены; production bootstrap не изменён.
- Перенесены реальные слоты Meridian/GitHub/onboarding в три явных presentation modules. Три CSS-файла удалены после узкого L patch. `IntegrationSourceSwitch` сохраняет прежние group/aria/buttons, setter и оба hidden-mounted wrappers принадлежат Home. Business/transport logic не меняется.
- Каноническая Meridian palette содержит **16** переменных, локальный utility binding проверяется по `getMeridianThemeVariables` при обеих темах и противоположной теме документа. Валидатор закрытого theme contract сохранён; новые `--text-faint`/color-scheme не назначаются.
- Первая after-съёмка: TI01 PASS, 34/60 decoded RGBA совпали. Сравнение выявило настоящую presentation-регрессию: без preflight одиночный `border-left/top` вместе с `border-solid` создавал initial medium borders на остальных сторонах. Исправление назначает `border-0` перед конкретной стороной; семантические проверки не изменялись. Повторные production-сборка/съёмка выполнены на замороженном UI source.
- Исходная рамка focus-visible заголовка обучения и особая close-button typography на mobile сохранены явно. Broad reduced-motion selectors заменены utilities действительных animation/transition/scroll slots; внешний WorkStatus статичен, AppSelect/WorkspaceAccordion уже имеют собственный reduced-motion contract.

## Итоговая проверка и ограничения

Итоговый TI01 PASS / 1.5 min с тем же сохранённым profile/fixture, артефакты `.operations/integration-after`, trace `.operations/integration-after-results`. По decoded RGBA **57/60** PNG идентичны, размеры всех 60 совпадают. Остальные: light-1440-meridian-error — 21 пиксель у закруглённых badges (максимум 1/255 на канал); light-1440-onboarding-catalog — 7 пикселей закруглённого фонового блока (1/255); light-390-meridian-error — 36 пикселей закруглённой error border (2/255). Это полный оставшийся факт raster-сравнения, а не заявление о 60/60 identity. Прежний прогон после border fix имел другой набор из двух малых raster-различий; причина этой вариации не доказана. Семантические assertions не ослаблялись, screenshots не подменялись.

Computed width/height/padding/margin/border/color/background/font/display/gap/outline видимых собственных slots совпадают. Единственная metadata-разница — BaseUI 1×1 hidden input выбора execution: после удаления parent `input` selector font стал 12px/18px вместо 13px/19.5px. Видимый trigger остаётся 13px, native validity и keyboard availability проходят functional tests. P не добавляет CSS для невидимого внутреннего узла библиотеки. File-selector-button computed props также совпали. Вручную просмотрены Meridian preview light390, GitHub deliveries dark1440, missing tour light390, keyboard tour dark1440. Ни native Meridian, ни внешний GitHub не квалифицировались.

Существующие browser regressions: GitHub UI3 + GitHub3 + Meridian5 + onboarding10 — **21 PASS / 49.0 s** на отдельном `.operations/integration-functional-profile`, без visual EventSource stub. После финального `border-none` уточнения контейнера Meridian повторены только его 5 tests на новом `.operations/integration-functional-final-profile`: **5 PASS / 42.7 s**. Во время M06 revoke старой подписки сервер вывел subscription-denial diagnostic; соответствующие receipt/identity assertions прошли, исходники stream не менялись. Структурное AST-сопоставление четырёх компонентных файлов после исключения `className`/`triggerClassName`/`style` подтвердило неизменность функций, JSX text, handlers/keys/refs/effects; это дополняет реальные browser tests, а не подменяет их.

Root TypeScript, production Next webpack build, strict apps/web TypeScript и Vite build PASS. Web dependency installation из собственного lock: 81 packages / 0 vulnerabilities, manifest/lock не изменены. Первое architecture чтение до этой установки не разрешало четыре TanStack Router imports; после установки — 776 files / 0 violations / 16 exact legacy edges. Существующие architecture + UI-style fixtures — **38 PASS**. Conventions и `git diff --check` PASS. Vite выдаёт прежние Zod pure-annotation warnings, build успешен.

`styles:check` до review: **14 ordinary CSS files / 1345 rules; 9 inline files / 34 expressions; 0 violations**. После review и удаления двух body style writes — **32 expressions**. `styles:final` ожидаемо FAIL / 17 violations: конечный остаток ordinary CSS/inline и transitional legacy layers ещё не перенесён. Удалены только три CSS records и Meridian theme inline record; обновлён ровно onboarding source/expression record. Другие family hashes не переписывались. После сборки проверены 75 generated protocol файлов: 74 byte-identical HEAD, bin EOL-only, semantic diff0. Только эти 75 восстановлены через git; `.operations/generated-output-proof.json` хранит exact paths/hashes. Worktree изначально создан чистым, чужие пользовательские изменения не восстанавливались.

## Точный runtime remainder и зависимости

| Expression в onboarding.tsx | Обоснование и неизменный расчёт |
|---|---|
| `style={tourRectVariables(pane)}` | Измеренные mask panes: left/top/width/height передаются как `--ouro-tour-*` с `px`, без обычных inline properties |
| `style={tourRectVariables(highlight)}` | Измеренная рамка фактической цели; тот же helper и четыре точных custom properties |
| `style={tourCardVariables(geometry)}` | card.left/top; width=`max(0,min(360,view.width-32))`; max-width=`max(0,view.width-32)`; max-height=`max(0,view.height-32)`, все `px`; null возвращает undefined |

Geometry helpers находятся в `components/onboarding-presentation.ts`; все три expressions всё ещё обычные exact debt records, **не автоматическое разрешение final gate**. Будущий technical-expression gate должен проверить helper body и каждый AST expression с причиной; glob exemption компонента не допускается. Две body style writes из исходного аудита удалены после review и не получают technical exception.

| Оставшаяся ordinary зависимость | Consumers / следующий owner |
|---|---|
| Global native input/textarea/reset/типографика, `.btn`/`.btn-primary`/`.btn-small`/`.text-btn`, `.page-heading`, `.section-heading`, `.eyebrow`, `.quiet-label` | Meridian/GitHub конечные slots сохраняют эти действующие shared contracts; дальнейший finite global/L-срез должен явно перенести их recipes перед удалением defaults |
| `legacy-shared-defaults.css` — 21 правило | Остальные auth/verification/panel/graph consumers сохраняются у своих owners; onboarding уже назначает собственные UI slots явно; defaults не классифицируются как base |
| `WorkStatus` / `work-status.css` | GitHub execution context использует внешний shared status; G owner переносит сам primitive отдельно |
| `@keyframes spin` | Собственные spinner icons уже задают точную `animate-[spin_1.5s_linear_infinite]`; keyframes остаются допустимым будущим техническим остатком, не селекторным CSS |
| Methodology/HistoricalPanel, participants/account, специализированные graphs/panels, app globals | Не входят в этот срез; root/L/G/следующие P owners сохраняют собственную область и результаты |

P добавил только ordered variants 950/700/420. При объединении с L порядок должен быть 1250,1100,1050,1000,950,900,760,700,680,560,520,420. Ни preflight, ни global important не включались.

## Исправления после root review

- Новый React-компонент переименован в `components/IntegrationSourceSwitch.tsx` по D11. L применил только соответствующий import path в своём `app/page.tsx`; legacy имена не переименованы.
- `onboarding-scroll-lock.ts` выдаёт локальную lease на `overflow-hidden!`. Это одна важная utility declaration для победы над существующими обычными inline overflow values, без global important configuration. WeakMap хранит только количество активных leases конкретного элемента и прежнее наличие класса. Последний release удаляет только свой ранее отсутствовавший класс; повторный release безвреден, чужие классы/inline style не читаются и не изменяются. Это presentation ownership, не project/global UI datastore.
- GuidedTour сохраняет showModal/close, effect mount/cleanup, observers, scroll/focus restoration и network/actor handlers. Меняется только механизм scroll lock. Структурное сравнение неизменных функций выше относится к состоянию до этой явно запрошенной review-адаптации.
- Три tests перекрывающихся leases, прежнего класса, повторного cleanup и независимых документов: PASS. Новая ON11 проверяет фактическую остановку wheel scrolling, возврат прокрутки/фокуса и прежних inline значений, сохранение уже существовавшего lock-класса. TI01 теперь проверяет computed overflow вместо implementation string `body.style.overflow`.
- После review: production Next build и его TypeScript PASS, strict web TypeScript PASS; **11 onboarding browser PASS / 58.9 s**, включая ON11. Артефакты `.operations/integration-review-tour-results`, профиль `.operations/integration-review-tour-profile`. Computed overflow и реальная wheel-блокировка/восстановление подтверждены, прежние inline style и lock ownership сохранены. Окончательный styles check PASS / 14 CSS / 9 inline files / **32 expressions** / 0 violations; `git diff --check` PASS. 60 PNG повторно не снимались, поскольку геометрия/presentation не менялись.
- По последнему review добавлен независимый контрактный guard в действующий M05 invalid-source browser case: все 16 computed CSS custom properties сравниваются с `getMeridianThemeVariables` для **dark и light**. Он проверяет реально скомпилированные static Tailwind literals; production class parser/generator не вводился. Существующие invalid-source/no-history assertions сохранены. Проверка PASS / 5.4 s (29.7 s вместе с запуском); trace `.operations/integration-palette-review-results`. Изменение канонической палитры теперь обнаруживается этим действующим функциональным тестом без запуска всей 60-PNG съёмки.

## Объединение с актуальным эпиком

После scoped commit `4429506` выполнен разрешённый merge `origin/codex/react-vite-epic` = `d0206db7a86f1af199a6f0f479687c092e183675` (P1 session ownership, runner artifact, URI). Merge прошёл автоматически без конфликтов. Source diff Home относительно эпика содержит только импорт PascalCase `IntegrationSourceSwitch` и замену прежней группы на controlled component; session/identity/receipt/UNKNOWN logic, providers и accepted GitHub actor fixture совпадают с эпиком. Публичные P3 palettes/validator, geometry, scroll lease и canonical browser parity сохранились без изменений.

Текущий фактический union W+P variants:1100,1000,950,900,760,700,560,520,420. L variants1250/1050/680 ещё не входят в этот parent; полный будущий порядок сохраняется в записи выше. Ledger остался **14 CSS /1345 rules /9 inline files /32 expressions**, без второго W parent. Root `npm ci --ignore-scripts` по принятому lockfile:208 packages /0 vulnerabilities; manifest/lock не редактировались вручную. Protocol dist штатно собрана; generated proof снова74 byte-identical +1 EOL-only /0semantic diff, восстановлены только эти75outputs.

Combined root TypeScript, strict web TypeScript, production Next webpack и Vite build PASS. Архитектурный guard:836 files /0 violations /16 exact legacy edges; migration:47 routes /59 explicit method exports; styles:14 ordinary CSS files /9 inline files /0 violations; conventions и diff whitespace PASS. Vite сохранил Zod annotation warnings и сообщил о combined index chunk579.77kB /175.96kB gzip (>500kB); warning не подавлялся, оптимизация chunking не входила в merge scope.

На новом `.operations/integration-combined-functional-profile`, port3393, неизменном объединённом production build: **Meridian5 +onboarding11 =16/16 PASS /33.7s**, без SKIP/retry. Trace/results `.operations/integration-combined-functional-results`. Подтверждены canonical16-variable palette parity обеих тем, exact receipt recovery/proven absence, participant switching/revocation, native focus/geometry/zoom/scroll lock/restore и сохранение prior inline values/lock class. Accepted P1 actor fixture и handlers не ослаблялись. Тяжёлые сборки/проверки выполнялись по одной; прежние60PNG не снимались повторно. Protocol generated diff после доказанного восстановления пуст.

Merge commit создаётся локально с родителями `4429506` и `d0206db`; дополнительно изменён только этот журнал результатов. Публикация, push/PR и native qualification этим объединением не разрешаются; полный CI объединённого P3 ещё не запускался.
