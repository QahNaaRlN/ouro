# Журнал G3: Tailwind оформления runtime

2026-11-04. Base `3794aef`; отдельная история `codex/tailwind-runtime`. G2 worktree заморожен. Перед source changes прочитаны AGENTS и установленный Next CSS guide. Исходный production build и Vite fixture dependencies готовятся на Node24.19.

Scope:56 selectors runtime CSS, SpecFlow context/facts, существующие G2 run-state paints. Domain/runtime handlers не меняются. Обычный `flow-runtime.css` удалён целиком; нет пустого файла, скрытого legacy layer или нового exception. Общие стандартные HTML defaults пока остаются конечным долгом globals; термин legacy здесь означает браузерный Human View, а не native Meridian/WebView.

## Полная карта selectors

Номера соответствуют `postcss.walkRules` исходного `3794aef:components/flow-runtime.css`, включая пять mobile rules. Несколько selectors одной декларации считаются одним rule, как в действующем guard.

| Rules | Потребители и назначение | Явный владелец после переноса |
|---|---|---|
|1–4|Tracking choice, label, checkbox, small hint|runtimePresentation tracking/trackingLabel/checkbox/trackingHint; собственный JSX FlowTrackingChoice|
|5–8|Summary, strong, paragraphs, direct warning|summary/title/text/action/warning slots; warning margin0 и basis-full имеют последний приоритет|
|9–12|Inspection grid; четыре panel surfaces; headings и paragraphs/list items|inspection/panel/heading/text, точные surface defaults|
|13–17|Run status/code и ready/running/waiting/succeeded/failed left borders|status/statusCode + typed runtimeRunStatusClassName; skipped/cancelled сохраняют обычный border|
|18–21|Fields grid, div min-width, dt, dd|fields/field/term/definition; UA dd margin-left40 не сбрасывается|
|22–27|History section/trigger/list/item/author/raw pre|history, triggerClassName, historyList/Event/Author/Record; workspace accordion margin14 сохраняется|
|28–31|Agent action list, block title/reason, typography|actionList/actionTitle/actionReason, собственные li utilities|
|32–34|Form grid, textarea, submit alignment|form/surface.form, textarea, submit; workspace form gap16 сохраняется|
|35–40|Warning/success, code/span/strong, simulation note|message/warning/success/warningValue/warningTitle/simulation; generic muted не перекрывает message color|
|41|Runtime context paragraph в SpecFlow|processPresentation.runtimeContext/runtimeCode|
|42–45|Run evidence wrapping и четыре state paints|Уже принадлежат G2 processEvidenceClassName/trackedEvidence; has-facts priority не меняется|
|46–51|Facts section/title/list/item/author/evidence в SpecFlow|processPresentation.runtimeFacts* + собственный JSX, без импорта presentation родителя в runtime-панель|
|52–56|Inclusive max760: fields1fr, panel padding14, submit width/stretch, status column, summary button fullwidth/center|Те же slots с упорядоченным at-most-760 variant|

`runtime-inherited-presentation.ts` G2 продолжает владеть label/input/request companions. Public library/routing geometry здесь не меняется. Font/lineheight/margin defaults обоих browser surfaces сохранены по actual layout, включая workspace font-weight500 и specificity form gap16.

## Baseline и исправление стенда

Сначала создан свой canonical profile через публичные HTTP/MCP команды. Готовая команда `skipFlowStep` записана один раз. Её original actor/run/requestId/body/expectedVersion сохранены; test-only renderer допускает только этот точный повтор через production createProjectSession/createProjectHttpPorts/freezeProjectCommandIntent. Для кадра posting реальная cached receipt уже получена, затем ровно один ответ намеренно теряется. Explicit retry получает replay; after snapshot полностью равен before snapshot, включая events/version. Новых domain facts в comparative runs нет.

Ранние88, затем96 кадров `.operations/runtime-original` имели неправильный порядок component CSS/workspace defaults. Это обнаружил дополнительный actual Next workspace baseline: original runtime heading14px, в раннем renderer16px. Эти кадры и первый converted comparison сохраняются только как diagnostic evidence. Исправлен порядок imports, baseline снят из отдельного frozen worktree `tailwind-runtime-original` на3794aef. Дополнительно исходный simulation fixture изменён на настоящий agent-owned training step и дополнен assertion текста synthetic evidence; прежний human-owned вариант не доказывал simulation note. Окончательный профиль `.operations/runtime-profile-v2` создан отдельно. Старые evidence не удалены и не выданы за финальные.

Две ранние setup попытки получили UNAUTHENTICATED до штатного GET /api/session; ещё одна setup ошибка — не собранный local protocol package frozen renderer. Синтаксическая ошибка первого TWR02 исправлена только в новом тесте. Это ошибки подготовки стенда, не product RED. Ни UUID override, ни fake canonical state, ни production hooks, ни копия domain guards не применялись.

## Финальная квалификация

- **TWR01:96/96 PNG pixel-identical,96 metric sets exact**: dark/light ×1440/390 ×legacy/workspace ×12 scenes. Legacy/no-tracking, ready, running, failed, succeeded/historical, simulation, another pending, held pending, expanded raw history, posting, UNKNOWN, success. `.operations/runtime-original-qualified` → `.operations/runtime-final`; actual renderer assertions включают replay=true, simulation notice и неизменность полного canonical snapshot.
- **TWR02:4/4 PNG pixel-identical,4 metric sets exact**: настоящий Next workspace selected-node runtime inspector, свой сохранённый process profile. `.operations/runtime-workspace-original` → `.operations/runtime-workspace-converted`.
- **TWP01:96/100 PNG pixel-identical; все100 metric sets exact**. Четыре отличия — dark1440 chosen-node, states-request-all, states-roadmap-all, states-roadmap: каждый12 AA pixels max2/255. `.operations/runtime-process-original` → `.operations/runtime-process-converted`. Без масок/threshold; comparison исключает только diagnostic classname hook, остальные поля/tag/count точны. Runtime renderer/TWR02 не имеют этого diagnostic field и сравниваются полностью.
- **Existing functional20/20 PASS, один прогон1.7m**, отдельный `.operations/runtime-functional-profile`, порт3384. UNKNOWN receipt/SSE recovery, teaching, strict tracking, retries/loops/history, fork decisions/application/resume, legacy mobile, draft/base updates, process forms, workspace proposal adoption, оба F11, F09, paired navigation, GR01–06. Assertions/timeouts существующих тестов не менялись. Global multiproject setup не использовался.
- **120 on* JSX expressions identical**, включая13 FlowRuntimePanel;361 реальный Tailwind candidate принят установленным compiler; Next/Vite strict TS/build PASS, architecture856files/0violations/11 exact legacy edges.
- Полные non-presentation AST `flow-runtime-panel.tsx` и `spec-flow.tsx` совпали после удаления import declarations, только новых surface presentation const и className/triggerClassName attributes; нормализованы только CRLF. Следовательно, совпали не только callbacks, но и остальные условия/commands/local state/guards/markup. Helper и diff evidence сохранены в ignored `.operations`, в приложение не входят.
- До обновления ledger guard показывал ровно один ожидаемый stale ordinary CSS entry: удалённый flow-runtime.css. После принятого root bounded review удалена только эта запись, без регенерации других hashes/policies. Фактический остаток13CSS/797rules и6inline-files/17expressions. **styles:check PASS0violations**. **styles:final ожидаемо FAIL16** из-за остального обычного долга/legacy layers; это не полный Tailwind PASS. Generated protocol CRLF/stat drift восстановлен только после доказанного semantic diff0; unrelated исходники не менялись.

Это bounded browser qualification указанного G3 среза. Весь Tailwind/React migration, native Meridian/WebView/SSO, реальные profiles и production не квалифицируются этим fixture. Root bounded review принят; scoped commit без push/PR разрешён. Parent sync и публикацией PR/CI управляет владелец эпика.

## Интеграция перед публикацией

Root объединил финальную A/G2/G1/P3/P42 композицию и client/runtime contracts. Source конфликтов не было; ledger сверен трёхсторонне по каждой записи относительно merge base. Остаток **7 CSS-файлов /445 правил /4 inline-файла /10 выражений**, styles0violations. Root/web strict types PASS; architecture867/0/11 и diff check PASS. Новая техническая policy пока не содержит production inline exceptions.

Унаследован финальный A capture guard, проверяющий неизменность measured DOM до/после screenshot; его source delta только test/docs. Исходные200 сравнений G3 и20 functional сохраняют свои границы; новый полный CI комбинированного head обязателен. Родительская история A объединяется раньше G3. Обновлённые статусы общего плана различают уже реализованные contracts/session/service и ещё открытые hFSD, Tailwind final, consumer/pnpm, coherent host и Next cutover.
