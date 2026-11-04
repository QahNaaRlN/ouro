# Журнал · подключения агентов

Дата: 2026-11-04. Статус: **LOCAL_QUALIFIED / CI_PENDING**. [Граница](../specs/tailwind-agents.md).

Создана отдельная ветка от общей UI-композиции `48804f8`. Только `AgentsPanel` использует переносимое `.agent-*` семейство; другие prefixes и общие native controls не входят. UI source пока не менялся. Устанавливаются зависимости существующих root/web lockfiles, закреплённый Node24.19.0 используется только через process-local PATH.

## Реализация и границы доказательств

До UI changes сохранены36 состояний: dark/light ×1440/390 ×empty/loading/list/read-error/stdio/cursor-http/claude-http/clipboard-error/create-error. Записанные ответы получены реальными API на одном собственном folder project: настоящие одноразовые keys, регистрация/revoke и MCP SDK обращение для lastSeen. Повтор presentation прогонов подставляет только эти disposable ответы в настоящем route; он не доказывает новую запись на сервере. Секрет остаётся в ignored fixture, не печатается и не публикуется. Полный domain snapshot до/после каждого прогона одинаков.

Начальные ошибки harness сохранены: точный heading не учитывал0 в accessible name; cached fixture не создавала новую session cookie; loading/error interception захватывал ещё общий bootstrap; alert locator находил также Next announcer. Это setup failures до source changes, не domain RED. Полный исходный набор `.operations/agents-original-v5` PASS1/1 (51.7s total) после этих исправлений; прежние partial artifacts/logs не перезаписывались.

Удалены ровно40 `.agent-*` ordinary rules из globals,131→91. Все остальные selector/declaration/ancestor records совпали. `agents-presentation.ts` содержит только статические readonly utility slots. Полный non-presentation TypeScript AST компонента совпал после исключения imports/className attributes: запросы, key/config JSON, readOnly, polling, callbacks и тексты не менялись. Specificity direct issued paragraphs/helper сохраняется явно14px/1.8/max850; generic helper margin остаётся прежним. Новые parent/ancestor CSS resets не добавлялись.

- Before/after: **36/36 decoded RGBA PNG exact, все36 computed metric sets exact**; measured DOM одинаков до/после screenshot. Converted capture PASS1/1 (1.1m), без masks/threshold. Clipboard-error — test-only отсутствие capability; actual system clipboard success этим не объявляется.
- Реальные existing functional: **4/4 PASS одним прогоном25.3s**, новый собственный профиль. Project-bound Cursor/Claude configs после скрытия ключа, help, одноразовая выдача/присутствие/revoke с reload, назначение человеку и запрет simulator ACK сохранены.
- Next production/strict types и Vite strict types/build PASS; **95 новых Tailwind candidates** приняты реальным установленным compiler. Существующий Vite chunk warning500kB сохранён (entry582.78kB), порог не повышен.
- Read-only peer review IL owner: blockers не найдено; transient issued/config и readonly/revoked behavior подтверждены source review. После него обновлены только globals hash/count; остальные CSS и inline records точно совпали. **styles7CSS/405rules/4inline/10expressions/0violations**. Общие91 rules и21 shared defaults остаются ordinary debt, final Tailwind не заявлен.

После peer review объединён G3 `adfe46b861bf9024385a80306f6edff6a98868c6`, уже принятый эпиком через PR57. Повторные root/web strict types, architecture875/0/11, styles7CSS/4inline/0 и diff checks PASS; исходный presentation scope не расширен. Полный CI требуется до merge отдельной story. System Node, реальные profiles и production не менялись; pnpm/Next cutover/hFSD этой историей не завершаются.
