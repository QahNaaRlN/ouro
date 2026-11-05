# Журнал · статическое оформление Flow preview

Дата: 2026-11-05. Статус: LOCAL_QUALIFIED / CI_PENDING. [SDD](../specs/tailwind-preview.md). Изолированная ветка `codex/tailwind-preview` от epic5070a0a.

До UI source changes существующий API/MCP fixture создал один настоящий snapshot с предложением. Test-only renderer показывает существующий WorkspaceProposals; его command callback отказывает и не пишет факты. Четыре сочетания theme/viewport × fit/zoom/details дают12PNG. Snapshot до/после каждого набора одинаков, измеренный DOM до/после каждого screenshot точно равен.

Ранний harness искал неправильный case-sensitive accessible name controls; исправлен на штатные Zoom Out/Fit View до изменения UI. Исходный v2 capture завершил assertions, но Windows Playwright shell teardown завис; его два собственных дерева остановлены после проверки PID/command ancestry. Conditional gracefulShutdown не устранил проблему окончательно. После перехода на test-only global setup с прямыми owned Node children полный after прогон завершается самостоятельно22.8s; final renderer20.6s. Прежние13–14min captures/manual cleanup не выдаются за доказательство исправного teardown. CJS import.meta и required NODE_ENV были отдельными setup/type errors и исправлены только в harness.

Из FlowPreview удалены ровно четыре статических style/labelStyle/labelBgStyle expressions. Readonly local recipe задаёт Node.className и Edge.className через публичные DOM slots React Flow. String.raw сохраняет escaped underscores; markerEnd API/color, dagre размеры/позиции/ID/data, topology, controls и selectable/drag/connect flags не меняются. Никакого нового global/vendor CSS или technical exception.

- Final before/after: **12/12 decoded RGBA PNG exact, все12 computed metric sets exact**, без masks/threshold; исходный before-v3 и final-after сохранены.
- Полный AST модуля после удаления imports, именно4old presentation props/2new slots и нормализации CRLF совпадает. Все19callback bindings, JSX, условия, тексты и payload expressions сохранены. Первое сравнение без EOL normalization было setup mismatch, не product RED.
- Все12новых utility candidates приняты реальным Tailwind4.3.3 compiler. Root/web strict types и Next/Vite production builds PASS; исходная первая Next сборка потребовала разрешённого запуска вне ограничителя записи для служебного bracket directory, без изменения кода.
- Реальный existing PW09/PW10: **1case PASS16.0s**, total22.9s, отдельный собственный профиль. SDK proposal → человеческий draft/activation → Flow/решения проверяются исходными assertions, не renderer callbacks. Command guards/UNKNOWN не ослаблялись.
- Bounded read-only peer L принят: public wrappers, descendant specificity, disabled selection, geometry/data/control semantics сохранены; actual rendered parity подтверждает library priority.

После peer удаляется только exact workspace-proposals ledger entry. Остальные source hashes, CSS records и technical policies не пересчитываются. Фактические6оставшихся expressions — Impact meter, три onboarding geometry и две textarea height; они ещё не получили production exceptions. Полный Tailwind, shared defaults, physical hFSD, native Meridian и production этой историей не завершаются. Full combined CI требуется до merge.
