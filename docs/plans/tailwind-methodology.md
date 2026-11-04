# Журнал: историческое состояние и восстановление

2026-11-04. Branch/worktree `codex/tailwind-methodology` / `tailwind-methodology`, base frozen G3 `e8a909f`. Actual AGENTS и установленный Next CSS guide прочитаны; Node24.19, offline закреплённые зависимости установлены. До source changes audit подтвердил58 rules methodology.css и ровно два JSX owners: HistoricalPanel, app/page private maintenance/recovery/cursor и исторический shell. Статьи Methodology уже принадлежат L и вне области этого файла.

SDD и actual immutable baseline созданы до UI source changes. После переноса удалён весь methodology.css; локальные readonly recipes находятся в components/historical-presentation.ts и app/human-view/maintenance-presentation.ts. Private business components не извлекались; JSX дополнен только собственными utilities. Обработчики, state, guards, commands, projectAtCursor и export unchanged.

## Полная карта исходных58 правил

Номера — последовательность postcss.walkRules исходного e8a909f:components/methodology.css; mobile selectors учитываются отдельно. Значения соответствуют winning cascade в actual production layout.

|Rules|Старые slots|Владелец результата|
|---|---|---|
|1|Historical panel width/maxwidth/margin|historicalPresentation.root|
|2–5|Banner/body/title/copy|banner/bannerBody/bannerTitle/bannerCopy + собственный JSX|
|6–7|Summary layout/strong|summary/summaryValue|
|8–11|Picker/spec heading/title/mono|picker/specHeading/specTitle/specId|
|12–14|Tabs/buttons/grid|tabs/tab/grid; общие segmented defaults остаются конечным global debt|
|15–19|Card, h3/h4, p/li, ul/ol|card/cardTitle/cardSubtitle/copy/list у каждого собственного элемента|
|20–23|Fact, first-of-type reset, title, code|fact/factTitle/factCode; первый border-top сбрасывается shorthand0, сохраняя style/color reset|
|24–26|Source accordion/version/pre|source/sourceVersion/sourceRecord; triggerClassName использует прежние собственные utilities|
|27–30|History cursor form/label/input/copy|humanMaintenance cursorForm/cursorLabel/cursorInput/cursorCopy|
|31–34|Decision maintenance/heading/form/labels|decisions/heading/form/label. Actual request-detail heading выигрывал12px/mb9 над старым14px/mb14; перенесено фактическое значение|
|35–38|Clarification list/article/p/small|clarificationList/clarification/clarificationCopy/clarificationAuthor|
|39–40|Lineage surface/strong|lineage/lineageTitle; вложенные p продолжают получать конечный общий request-detail default|
|41–46|Recovery surface/form/label/textarea/p/unknown|recovery/recoveryForm/recoveryField/recoveryCopy/unconfirmed; label text12 уже принадлежал L utilities и сохраняется|
|47|Recovery code|В существующем OperatorRecovery нет code descendants. Dead selector удалён; новый скрытый wrapper или unused recipe не добавляется|
|48|Recovery .btn wrapping/lineheight|recoveryAction у собственных .btn; text-btn этим rule не затрагивается|
|49|Historical preview main-content maxwidth none|Уже перенесено L в humanShell.historicalContent и условный className; winning utility сохраняется без повторной реализации|
|50|Historical preview workspace-body grid columns1fr|После L body имеет display:flex, grid-template-columns не участвует в layout. Инертный остаток удалён; display/geometry не меняются|
|51–56|Inclusive max900 banner/grid/card/button/tabs|Упорядоченные at-most-900 variants у тех же slots|
|57–58|Inclusive max600 historical heading/export button|Новый named at-most-600 variant между680 и560; heading/export slots. Остальной вариантный порядок не меняется|

Общие globals, стандартные HTML controls, shared WorkspaceAccordion и canonical/domain code не переписывались. Source-only dead/inert selectors не выданы за перенос используемого DOM. Исторические статьи Methodology к этому CSS файлу не относятся и не менялись.

## Actual baseline

Production Next build на исходном e8a909f. Собственный `.operations/methodology-profile` создан один раз публичными HTTP/MCP командами: пять независимых question состояний, три blocker состояния, три operator recovery состояния. Manifest хранит snapshot112 и IDs, без bearer credentials. Токены остаются только в seed процессе. Повторные comparative runs только открывают routes/forms и возвращаются без отправки команд; перед/после полностью совпадает canonical state включая events/version.

TWM01:25 сцен ×dark/light ×1440×1000/390×844 =100 PNG. Cursor form; cursor0 empty; rich history expectation/state/source/raw record; pending/clarification pending/replied/resolved/corrected/original/withdrawn/retireable/retired decisions; clarification source; clarify/correct/reopen/retire forms; revoked/UNKNOWN/attested recovery и cancel/attestation forms. Физическая остановка и неприменимость блокера не подменяются декларацией authorization.

Ранние setup попытки сохранились: plain Base UI trigger имеет combobox semantics, поэтому заменён ошибочный role=button locator на штатный getByLabel; на mobile context aside скрыт<=900, поэтому recovery снимается через реальную вкладку «Реальность», где смонтирован ExecutionPanel, с timeline вместо причинного графа. Эти изменения затронули только новый тест до source migration, не приложение. Ошибки setup не являются product RED. После этого исходный TWM01 GREEN1.3m, final GREEN1.2m на том же manifest.

## Финальные результаты

- **93/100 PNG pixel-identical; все100 measured metric sets exact**. Полные PNG сравниваются без masks/threshold; в новых metric records нет diagnostic classname hook и ничего не исключается. `.operations/methodology-original` → `.operations/methodology-converted`.
- Семь отличий: dark1440 form-resolved/form-withdrawn — по12pixels max2; dark1440 operator-form-revoked —1pixel max3; light1440 decision-withdrawn/form-retireable/operator-form-unknown/operator-revoked — по11pixels max1. Первые/последние группы находятся на существующей границе sidebar; отдельная точка x250,y818 — на сглаживании края контрола. Все100 measured geometry/font/border/color/margins совпадают.
- **Existing methodology5/5 PASS одним прогоном1.1m**, отдельный `.operations/methodology-functional-profile`,3388. M06 pinned historical prefix при живом commit, readonly/export/return; M07 clarification/correction; M05 revoked authorization→UNKNOWN→separate attestation; M08 withdrawal/reopen/retirement без ложного physical clearance; lightmobile history. Assertions/timeouts существующих tests не менялись; global multiproject setup не использовался.
- **136 on* bindings identical**: app/page129, HistoricalPanel7. Полные AST обоих файлов после удаления imports/presentation attributes совпадают; helper нормализует только CRLF, никакие условия, callbacks или body expressions не исключаются.
- **109 Tailwind candidates accepted**, Next strict TS/build PASS, Vite strict TS/build PASS10.20s; architecture858files/0violations/11 exact legacy edges.
- До ledger update styles guard сообщал ровно один ожидаемый stale CSS entry: удалённый methodology.css. Root bounded review принят; после него удалена только эта запись, без регенерации чужих hashes или изменения policies. Фактический остаток12CSS/739rules,6inline-files/17expressions. **styles:check PASS0violations; styles:final ожидаемо FAIL15** из-за оставшегося долга/legacy layers. Generated protocol output восстановлен только после semantic diff0; unrelated source не менялся.

Это bounded qualification browser legacy Human View, не native Meridian/WebView/SSO/production. Нет test hooks/clock или UUID overrides, masking, дополнительного domain logic или запуска внешних агентов. Root разрешил scoped commit без push/PR после review; публикацией и parent sync управляет владелец эпика.
