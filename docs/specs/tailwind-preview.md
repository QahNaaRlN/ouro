# Tailwind: статическое оформление workspace Flow preview

Статус: LOCAL_QUALIFIED / CI_PENDING. Исходное сравнение и conversion выполнены на одном disposable snapshot; результаты и setup failures сохранены в [журнале](../plans/tailwind-preview.md). Родитель epic5070a0a; отдельная ветка `codex/tailwind-preview`.

Срез удаляет ровно четыре статических React Flow style expressions из `components/workspace-proposals.tsx`: node, edge, edge label и label background. Конечные readonly utility slots принадлежат этому preview. Layout dagre, размеры его расчёта, node IDs/positions/data, topology, marker API, controls, callbacks, review forms и command lifecycle сохраняются. Общие native defaults и другие inline expressions не входят в scope.

До правки UI фиксируется один настоящий snapshot через существующий disposable API/MCP fixture. Из него существующий WorkspaceProposals рендерится в отдельной test-only Vite entry; command callback намеренно отказывает и не создаёт фактов. Сравнение двух тем, desktop/mobile и исходного/zoomed/details состояний сохраняет PNG и computed node/edge/label metrics до и после screenshot. Renderer proof не подменяет существующий реальный PW09/PW10 browser scenario.

После исходного capture: utility conversion, точное nonpresentation AST сравнение, реальный Tailwind compiler, before/after, PW09/PW10, root/web strict types и обе сборки. Style ledger удаляет только workspace-proposals entry после review; остальные hashes и technical policies неизменны. Полный CI обязателен до merge. Это не полный Tailwind, native Meridian или production acceptance.
