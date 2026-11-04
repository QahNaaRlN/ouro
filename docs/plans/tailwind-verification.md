# Журнал · проверка работы и статусы

Дата: 2026-11-04. Статус: **IMPLEMENTED / BOUNDED_QUALIFICATION_PASS / REVIEW_ACCEPTED**. [Граница и критерии](../specs/tailwind-verification.md).

Создана отдельная ветка от общей композиции G3/A/G2/G1. Исходная фиксация перед реализацией: `verification.css`46 и `work-status.css`9 ordinary rules, UI source тогда ещё не менялся. Исходный общий ledger:7 CSS /445 rules /4 inline files /10 expressions, он не объявлял остальные families завершёнными.

Зависимости устанавливаются по существующим lockfiles; system Node не меняется. Все runtime/build/browser проверки используют закреплённый Node24.19.0 с process-local PATH. Состояния/fixtures создаются только в собственном worktree и temp directories. Source/dependency/setup errors учитываются отдельно от domain RED.

## Исходный immutable baseline

2026-11-04, до UI changes: production Next build и strict TS PASS. Собственный folder-bound проект создан публичными API/MCP. Snapshot43 содержит4 настоящих сохранённых прогона: local_runner PASS на изолированном тесте сложения; импорт его фактического Playwright JSON PASS; human_attested FAIL/PASS с явно test-only evidence. Сохранены1 observation с манифестом четырёх разрешённых файлов,1 TDD cycle, human reviews и phase facts. Токены не сохраняются в manifest. История до/после comparative run полностью совпала.

TWV01 original **104 PNG /26scenes ×dark/light ×1440/390 GREEN2.7m**. Actual legacy graph/две грани/read-only historical results+observation; workspace graph/две грани/list/table workface; stored-contract editor, slice/import/phase/cycle/refactor/manual/observations, run review/manifest/raw report; canonical neutral/blue/red/green status routes плюс amber work face. Сохранённый editor использует fixed IDs automated-case/manual-case/unlinked-case. Create/new-case/target-reset не открываются ради parity: production crypto.randomUUID не изменён, случайные новые ID не нормализуются и не выдаются за pixel-exact evidence. Draft datetime fields заполняются обычным UI фиксированными значениями.

Первые locator ошибки — generic labelled div ошибочно искался как role=region и неверное имя нового accordion в тесте — исправлены только в test harness до production changes; не являются product RED. Canonical seed не пересоздавался. Дополнительный bounded baseline selected faces/normal700ms transition готовится отдельно на том же snapshot. WorkTone purple объявлен public type/CSS, но нынешний core mapper/consumers его не выдают; finite compatibility recipe будет сохранён без выдуманных canonical facts.

Дополнительный baseline фактически GREEN:12 PNG selected verification/work faces и endpoints обычного поворота. Проверены реальные transitionDuration0.7s, завершённая DOMMatrix rotateY180 и reduced-motion возврат. Итого116 исходных кадров на одном собственном snapshot43; normal animation не выводится из одного reduced-motion кадра.

## Полная карта55 ordinary rules

Нумерация соответствует postcss.walkRules исходного48804f8. Несколько selectors одного declaration block считаются одним rule; reduced-motion rule учитывается отдельно.

|verification.css rules|Потребители|Владелец после переноса|
|---|---|---|
|1–4|Pair root, layer group/buttons и pressed face|verificationPairPresentation root/layers/layerButton; aria-pressed variants|
|5–12|Perspective, rotor/end pose, faces, footer, reduced motion|turntable/rotor/reversed/face/workFace/verificationFace/footer; side условие только в className;700ms/reduced-motion сохранены|
|13–14|Open title и summary|open/summary и optional readonly open/summary slots от workspace callers; legacy defaults отдельны|
|15–22|Panel, headings, forms/editor, labels, grid, cases, checkboxes, input/textarea width|verificationPresentation panel/heading/form/editor/label/grid/case/check/field на собственном JSX; checkbox flex/gap8 больше не требуют important|
|23–29|Runs/run/pre/code/run ol/readiness/small|runs/run/record/code/list/readiness/small. list применяется только к ol внутри verification-run; остальные списки сохраняют UA40. WorkspaceCopyValue получает один узкий code-tag slot через существующий public className, включая legacy readonly|
|30|Workspace table max540|readonly classNames.root у конкретного table caller|
|31,33|Graph node min/max geometry и прозрачная оболочка|Уже принадлежит более сильному G1 roadmapPresentation.pair:264px, minheight280, padding0/border0/bgtransparent/shadownone. Эти slots сохраняются, geometry/routing не меняются|
|32|Phase controls top separator|phase|
|34|Selected graph face border|classNames.face задаётся Roadmap из существующего data.selected|
|35|Graph buttons width/wrap|classNames.button от Roadmap, без знания родителя внутри Pair|
|36–37|Fieldset minwidth и observation grid|fieldset/observation|
|38–41|Table layout, cells,18%/30% columns|table/cell/column. Прежний общий tbody:last-child border0 сохраняется явным собственным cell variant, чтобы utilities не восстановили линию|
|42–43|dl row grid и dd reset/wrap|definitionRow/definition|
|44–46|Card context grid, buttons и last-updated|context/contextButton/updated; существующие parent attention/proposal/time/update slots имеют последний приоритет|

|work-status.css rules|Владелец после переноса|
|---|---|
|1–4|workStatusPresentation root/icon/label/code; SVG flex-none, span minwidth0, code10/opacity.85/wrap|
|5–9|Typed finite workStatusTone: blue fallback variables, amber, green, red, purple compatibility. Канонический mapper не изменён|

Карточка не импортирует roadmap presentation или parent context. Workspace callers передают pure verificationPairWorkspacePresentation через optional readonly open/auto/summary slots; default legacy presentation сохраняется. Shared WorkspaceAccordion/WorkspaceCopyValue API, Query ownership, transport, capability/receipt guards и parent source families не менялись.

## Обнаруженные расхождения и исправления

Первое actual104 comparison сохранено `.operations/verification-converted`:28 PNG exact,92 measured views отличались. Это реальный промежуточный visual RED, не финальный PASS. Более специфичный `.ws-shell button` выигрывал у одиночных .verification-open/.verification-auto, а `.ws-shell p` — у summary leading. Первые utilities некорректно подняли проигрывавшие декларации выше этих defaults. Исправлено явными workspace open/auto/summary props, без нового parent import или global important. Base border0 выражен border-0/border-none/border-current, чтобы typed caller slots могли корректно заменить его через twMerge.

Второе расхождение — ошибочное применение20px ко всем advanced ol вместо прежнего verification-run ol. Aggregate/cycle lists вернули существующий UA40; стили остаются у своего потребителя. После поправки source bodies и155 callbacks снова совпали по AST. Ранний comparison/PNG/log не удалялись; final116 comparison выполняется отдельно на прежнем snapshot.

SSR fixture показал отдельный assertion anchor RED0vs1: прежний regex требовал class="verification-rotor" без дополнительных utilities. Изменён только этот anchor с сохранением количества1. Assertions двух faces/inert/aria-hidden/readonly/no-forms/disabled/draft inputs не ослаблялись. Test-only QueryClientProvider wrapper перенесён идентично принятому root62e0ab3; production provider fallback не добавлялся. **4/4 verification SSR GREEN**; здесь не заявляются отсутствующие в48804f8 дополнительные catalog-query tests родительской ветки.

## Текущая квалификация

После поправки **existing3/3 verification browser suites GREEN1.3m** на свежем отдельном `.operations/verification-functional-corrected-profile`,3392: реальные imports/RED/partialGREEN/stale/keyboard flip; server-owned observation/runner/manual/mutation/stale; exact paired request/proposal navigation и immutable timestamps. Assertions/timeouts этих трёх suites сохранены. Первый прогон до correction тоже3/3GREEN1.1m и не заменяет final evidence.

**155 on* bindings и non-presentation AST шести файлов identical**: panel44,advanced40,pair5,status0,Roadmap9,workspace-project-view57. Исключены только imports, className/classNames presentation props и type alias расширенных readonly slots; canonical условия/JSX bodies/handlers/local state/commands не исключались. **117 actual Tailwind candidates accepted**. Next strict TS/build PASS, Vite strict TS/build PASS10.54s; architecture870files/0violations/11 exact legacy edges.

Перед ledger update styles guard сообщал ровно2 expected stale CSS entries: удалённые verification.css/work-status.css. Root bounded review принят; после него удалены ровно две эти записи, без регенерации других hashes/policies. Actual remainder5CSS/390rules,4inline-files/10expressions. Финальный116 comparison записан ниже.

## Финальное comparison и границы

После принятого root peer review **styles:check PASS0violations**, actual5CSS/390rules и4inline-files/10expressions. **styles:final ожидаемо FAIL8** по оставшимся ordinary styles/legacy layers, а не полный Tailwind PASS. Ledger изменён удалением ровно2 CSS records, остальные hashes/expressions/policies проверены как неизменные. Generated protocol drift восстановлен только после semantic diff0. Root разрешил scoped commit без push/PR.

Основной повтор `.operations/verification-corrected`: **103/104 PNG pixel-identical, все104 metric sets exact**. Единственное отличие light390 legacy-readonly-observation —10 pixels max1/255 на сглаживании правого края прежней страницы. Masks/threshold и исключения metric fields не применялись; records содержат DOM tag/count, geometry, font/color/border/layout, transform/perspective/backface/transition.

Дополнительный selected12 сначала имел все PNG exact, но четыре normal-motion metric sets выявили особенность Tailwind4: transition-transform включает translate/scale/rotate, тогда как исходный CSS переходил только transform. Уточнён ровно один token на transition-[transform]. После локального build/compiler и targeted12 repeat `.operations/verification-pair-final` **12/12 PNG и12 metric sets exact**, GREEN18.8s. Полные104/3functional не повторялись без причины: это единственная последующая property-поправка, reduced-motion продолжает transition:none и реально проверен тем же targeted12 набором. Финальные117 candidates accepted, обе production builds PASS; Vite9.00s.

Итого **115/116 PNG pixel-identical; все116 measured metric sets exact**. Before/after canonical snapshot43, включая events, не изменился. Отдельные profiles/ports не смешивают seed, visual и functional evidence. Первый ошибочный comparison не заменён финальным задним числом.

**Исходное ограничение узкого экрана:**28 original results/form/read-only PNG приviewport390 имеютfullPage width547–548; metadata с длинными неразрывными значениями уже расширяли исходную страницу. Corrected snapshots сохраняют те же размеры. Поэтому это bounded mobile layout parity с известным pre-existing overflow, не full mobile usability PASS. Устранение overflow требует отдельного ограниченного изменения после parity; его не скрывают кадрированием/masking или неявным redesign в данном CSS срезе. Purple остаётся сохранённой finite public compatibility variant без claim canonical/browser state, которого текущий mapper не выдаёт.

## Новый защищённый before-parent baseline и CI boundary

После описанной ниже диагностики отдельно проверена самодостаточность actual route helper на **новом** default temp profile:104 scenes GREEN2.2m, selected/normal12 GREEN13.8s. Это новый before-parent baseline текущего UI source с иными project/event IDs, не подмена исходных116 comparisons и не дополнительное доказательство old-CSS parity. Новый immutable snapshot43 прошёл deep before/after в обоих runs; metadata находятся в .operations/verification-ci-route-baseline/qualification.json и .operations/verification-ci-pair-baseline/qualification.json. Node24/NPM PATH pipeline сохранил исходный pathDigest a53b43af….

После подтверждённого завершения server process создана cold copy собственного нового SQL profile в .operations/verification-ci-profile-frozen; pointer находится в .operations/verification-ci-profile-frozen.json. Новые source profile/backup не использовались для дальнейших probes. Старая история43→45 сохранена отдельно. Backup является сохранённым offline evidence, не claim отдельно квалифицированного runtime clone.

TWV остаётся обычным production-route test и сам создаёт свой canonical fixture безTWP/globalmanifest dependency; skip не вводится. Test явно включает reduced-motion в основном наборе и переключает normal mode только в специальных12 scenes. Dedicated verification config создаёт свой temp DataDir по умолчанию, сохраняя возможность явно выбрать существующий профиль. Без explicit visual output screenshots/metrics пишутся в стандартный testInfo.outputPath для CI artifacts. Root отдельно оформляет routing Vite-only TWR renderer в собственный .browser.ts/CI step; blanket testIgnore не применяется.

## Последующая диагностическая оговорка о старом профиле

**После завершения всех116 final comparisons** выполнен отдельный operational DOM-overflow probe вне Playwright launcher. Это лишний диагностический шаг агента: иной PATH изменил capabilities.pathDigest. Автоматический observer корректно записал новые VerificationWorkspaceObserved44/45 и пересмотрел environment slice/readiness. Approved file hashes, product/test/fixture revisions и прежние immutable runs сохранились; различались только environmentDigest, observation digest и pathDigest. SQL/events не откатывались и не переписывались. Probe подтвердил document width547, без изменения DOM styles.

Следовательно, comparison artifacts и их deep before/after43 assertions остаются фактическим evidence квалификации, а **сохранённый рабочий профиль после этой последующей диагностики уже имеет45**. Original manifest43 намеренно оставлен прежним и заблокирует дальнейший сравнительный запуск на изменившемся профиле; это fail-closed guard, не повод автоматически принять новый snapshot. Для будущего parent qualification при изменённых CSS inputs нужен новый явно парный baseline либо отдельный защищённый fixture, а не подмена manifest/masking или удаление canonical events. Сведения о probe и snapshot delta сохранены в ignored .operations; собственный profile не является данными пользователя/production. Учитываем этот operational limitation отдельно от финальных UI source checks.

## Синхронизация с текущим эпиком

По назначению root исходная принятая история4586a696 синхронизирована merge с exact epic `5070a0a9a04a1227b9317364bc5a3b2f9a80b679`. Merge прошёл автоматически, без конфликтов. Сохранены родительские scoped catalog reads/providers, routing production tests и отдельный CI owner Vite-only runtime renderer; существующие TWV route body/config и SSR assertions не переписывались. Девять собственных verification/status JSX/presentation файлов идентичны4586a696; дополнительные проверки UI не выдаются за новый полный паритет объединённого дерева.

Machine style ledger побайтово сохранён из принятого verification среза: **5CSS/390ordinary rules,4inline files/10expressions**. Удалённые verification.css/work-status.css не восстановлены, чужие hashes/policies/entries не регенерировались. Текстовый ledger сохранил обе стороны: verification qualification и актуальную родительскую запись о механизме technicalInline; новые production исключения не добавлены.

На объединённом дереве с закреплённым Node24.19/process-local PATH реально прошли root/web strict types, existing verification SSR **4/4PASS**, architecture **877files/0violations/11exactlegacyedges**, style guard **5CSS/4inline/0violations**. JSON отдельно подтвердил390rules/10expressions. `git diff --check` обнаружил единственный родительский whitespace defect: лишнюю пустую строку на EOF `e2e/process-presentation-fixture.ts`; удалена только эта строка, исполняемое тело fixture сохранено. После этого staged/working diff checks PASS.

Синхронизация ограничена названными types/SSR/guards и проверкой diff. Новые production builds, повтор browser116/3, полный CI, Linux/native/production acceptance **NOT_RUN** в этом parent шаге; ранние результаты остаются привязаны к исходному квалифицированному source. Защищённые profiles/backup не открывались и не изменялись; observer и launcher не запускались. Scoped merge commit передаётся root для публикации, без push/PR со стороны агента.

## CI fixture: Git metadata и размер импорта

2026-11-05. Actual PR62 run41891141980/job126788543093 прошёл18/19presentation tests; TWV01 остановился в setup. Полный stack указывает не createSpec, а `verificationPresentationFixture` line50: `reportVerificationRun` с вложенным `rawReport`. HTTP endpoint правильно вернул PAYLOAD_TOO_LARGE при256000bytes. Это **fixture/setup RED**, не доказательство дефекта production ограничения или семантики verification; лимит и backend не изменяются.

В installed Playwright runner Git metadata по умолчанию включаются при GITHUB_ACTIONS. JSON report получает `config.metadata.gitDiff` до100000символов PR diff; UTF8 и JSON encoding раздувают отчёт, особенно при русскоязычном diff. Standalone Windows baseline без GitHub environment этого не имел. Shared presentation profile и порядок предыдущих сценариев не являются причиной найденного oversized caller.

Причинный proof выполнен на immutable CI source head879453ecdbee87117ee9c32b5912b40de2a7a9bf в отдельной `verification-report-size` worktree. Настоящий nested Playwright использовал test-only GitHub environment и реальный diff base bddc33da8ef3b23b9b1700a64848e2186ffc09c6→HEAD. Без настройки rawReport352875bytes, даже минимальный command envelope359483bytes. С `captureGitInfo:{commit:false,diff:false}` report5386bytes/envelope6300bytes. **Тот же case ID**, expected1/skipped0/unexpected0/flaky0 в обоих настоящих прогонах. Evidence `.operations/report-default.json`, `report-fixed.json`, `report-size-comparison.json`; это Windows producer proof с GitHub env, **не Linux/native/browser acceptance**.

Исправлена только генерируемая конфигурация собственного однотестового fixture: Git commit/diff metadata отключены до выполнения теста. Отчёт не обрезается после формирования, результаты/идентификаторы/проверки не удаляются, общий production Playwright config и остальные reports сохраняют свои настройки. Собственные observed config bytes меняются явно и будут наблюдаться новым fixture; ранние immutable baseline не переписываются. Command helper дополнительно сообщает только bounded command type (до80символов), фактические UTF8bytes JSON и HTTP status при прежней обязательной проверке response.ok; raw command payload не печатается.

Root принял причинный proof и разрешил scoped fixture fix. Полный Linux CI и production-route TWV01 после cherry-pick выполняет root/foundation owner. Новые browser qualification или Linux dependency checks в этой диагностической ветке **NOT_RUN**; Windows node_modules не использовались как Linux native dependencies. Backend limit, normalization, API contracts, application UI и незавершённая error-policy story не входят в diff.
