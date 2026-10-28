# OURO-ENG-000001 · Подключение MCP-совместимого агента

Редакция 1 · 28.10.2026 · пакет `0.1.0-alpha.2`. SDD: этот документ задаёт объём до реализации. Идентификатор инженерного пакета не резервирует Human ID пользовательской спеки.

## Цель

Человек регистрирует логического агента, копирует конфигурацию в MCP-клиент и назначает ему разрешённую попытку. Агент читает актуальное ожидание, сообщает факты/вопросы, получает решения и подтверждает исполнение стандартными tools. Менять код Ouro под конкретного провайдера не требуется.

Совместимость означает MCP-клиент с tools и stdio либо Streamable HTTP с настраиваемым Authorization. Произвольные приложения без MCP, OAuth-only клиенты и установка конкретного LLM/IDE в объём не входят.

## Границы

Включено: onboarding в UI, отдельная идентичность/ключ на агента, отзыв ключа, назначение попытки, HTTP MCP и stdio bridge, чтение контекста/обновлений и полный агентский lifecycle, инструкции/конфигурации, реальная проверка SDK-клиентами обоих транспортов. Один существующий проект и текущий PostgreSQL-store сохраняются.

Отложено: запуск LLM/терминала от имени пользователя, оркестратор процессов, realtime UI через WS/SSE, OAuth/SSO, multi-tenant, автоответы человеку, редактор блок-схем и остальные пункты предыдущего backlog. MCP передаёт команды/факты и не гарантирует физическую остановку внешнего процесса без ACK.

## Контракт

- Человек создаёт агента через `POST /api/agents` с именем. Сервер выдаёт случайный ключ один раз; хранится только SHA-256 высокоэнтропийного ключа. Список возвращает ID/имя/время создания/последнего обращения/отзыв, без ключа/хеша. Отзыв сохраняется отдельным фактом и немедленно запрещает дальнейшую авторизацию.
- Назначение агента в human `startExecution`/remediation выбирается из действующих регистраций. Существующий учебный симулятор отделён от зарегистрированных агентов. Агент не назначает себе работу и не становится человеком через аргументы tools.
- `POST /api/mcp`: официальный TypeScript SDK, stateless Streamable HTTP, bearer-agent auth на каждом запросе, проверка Host/Origin и размера, JSON-ответы. GET/DELETE возвращают 405; долговременной серверной SSE-подписки в этом пакете нет.
- Stdio bridge `packages/mcp/bin/ouro-mcp.mjs` использует официальный SDK и обращается к HTTP MCP; собственной БД/копии истории не открывает. `OURO_URL`, `OURO_AGENT_TOKEN` либо `OURO_AGENT_TOKEN_FILE`; stdout только MCP, диагностика stderr без секретов. HTTPS для удалённого адреса, HTTP только loopback.
- Read tools: `ouro.get_context` (доступные этому агенту назначения, immutable ревизия, цель/DoD, состояние/разрешения/решения, текущая версия); `ouro.get_updates` (committed cursor, только разрешённый контекст). Чужое назначение недоступно.
- Report tools: `ouro.report_action`, `ouro.report_question`, `ouro.report_fork`, `ouro.report_blocker`.
- Lifecycle tools: `ouro.confirm_started`, `ouro.confirm_resumed`, `ouro.confirm_stopped`, `ouro.confirm_decision_applied`, `ouro.complete_execution`, `ouro.clear_blocker`.
- Запись требует `requestId` и `expectedVersion`. Контекст спеки/ревизии связывается сервером с назначенным execution. Человек отвечает/разрешает продолжение/принимает DoD отдельно. Конфликт возвращается без автоматической подмены версии или решения. Повтор принятой команды сохраняет исходный результат.
- Tool schemas публикуются через `tools/list`, вход проверяется runtime. Ошибки tools возвращают `isError` и структурированный доменный code; транспортные ошибки и 401/403 отделены от предметных. Секрет не входит в domain payload/receipts/конфигурационные логи.

## Критерии приёмки

| ID | Наблюдаемое поведение | Проверка до реализации |
|---|---|---|
| AC01 | Человек создаёт два независимых agent ID/ключа; сохраняется только хеш | credential tests |
| AC02 | Ключ отозван после restart; старый ключ получает 401, human-права недоступны | credential/auth tests |
| AC03 | SDK HTTP Client выполняет initialize → tools/list → get_context | MCP integration |
| AC04 | SDK Stdio Client выполняет тот же протокол через bridge; stdout не загрязнён | subprocess integration |
| AC05 | Агент видит только собственные назначения; spoofed execution/actor/project отвергаются | isolation tests |
| AC06 | Человек создаёт/активирует спеку и назначает агента; агент ACK и Action попадают в UI/историю | full protocol scenario |
| AC07 | Question → человеческий ответ → read решения → разрешение продолжения → agent ACK/application → result; DoD остаётся человеку | domain + SDK integration |
| AC08 | Fork/Blocker имеют типовые схемы/guards; remediation и evidence работают внешними tools | SDK lifecycle tests |
| AC09 | Повтор requestId не создаёт дубль; stale version и иное тело дают conflict | idempotency tests |
| AC10 | Onboarding даёт готовые stdio/HTTP JSON-конфигурации и инструкцию; отзыв доступен человеку | browser test |
| AC11 | Пустой/чужой ключ, чужой Origin, слишком большой/неверный JSON не меняют историю | HTTP boundary tests |
| AC12 | Старые 24 unit/integration и 4 E2E сценария остаются зелёными; typecheck/build успешны | regression gate |

## Метод разработки

TDD по каждому модулю: тест наблюдаемого поведения → зафиксированный RED → минимальная реализация → GREEN → рефакторинг при зелёных тестах. Итоги и трассировка AC→tests фиксируются в [плане](../plans/agent-connect.md); ошибки установки/окружения не считаются RED предметного поведения.

Ориентиры: [официальный TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), [MCP transports](https://modelcontextprotocol.io/specification/latest/basic/transports), [MCP tools](https://modelcontextprotocol.io/specification/latest/server/tools), [Claude Code MCP](https://code.claude.com/docs/en/mcp), [Cursor MCP](https://docs.cursor.com/context/model-context-protocol). Пакет не объявляет реализацию OAuth authorization server.
