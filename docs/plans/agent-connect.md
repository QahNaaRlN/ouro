# План SDD/TDD · OURO-ENG-000001

Основание: [спецификация пакета](../specs/agent-connect.md), редакция 1. Не расширять пакет на соседние функции backlog.

1. Зафиксировать контракт/AC и изучить официальный MCP SDK/транспорты.
2. RED/GREEN: persistent agent registry, hashed credentials, revocation, isolation.
3. RED/GREEN: runtime tool schemas и agent facade поверх существующего домена.
4. RED/GREEN: настоящий SDK HTTP endpoint и stdio bridge.
5. RED/GREEN: onboarding и назначение агента в Human View.
6. Проверить полный цикл независимым SDK-клиентом, регрессии, build; подготовить отдельный PR.

## Журнал проверяемых свидетельств

| Область | RED | GREEN | Критерии |
|---|---|---|---|
| Credentials/registry | 0/4: NOT_IMPLEMENTED и ожидаемые FORBIDDEN/VALIDATION assertions; assignment ещё 0/2 missing rejection | 8 новых registry tests + 2 старых storage: 10/10 | AC01, AC02, AC05 |
| Tools/lifecycle | 0/7: пустой inventory и NOT_IMPLEMENTED при рабочем SQL fixture | 8/8: context/isolation, Question, Blocker, receipts, historical facts, revision controls | AC05–AC09 |
| MCP HTTP/stdio | HTTP SDK inventory не содержал get_context; Next boundary ожидал401, получил404 | 2 transport/real-agent tests + 2 настоящих HTTP/stdio E2E: успешно; SDK lifecycle включает Question, Fork, Blocker/remediation, stop/resume | AC03, AC04, AC07, AC08, AC11 |
| UI onboarding | Браузер открыл приложение, навигации «Агенты» не было | 2/2 новых E2E; 4/4 прежних E2E | AC06, AC10 |
| Общие регрессии | Базовая версия: 24 + 4 tests | 47/47 unit/integration, 8/8 E2E, typecheck, production build и db:check прошли | AC12 |

Только реально выполненные результаты заменяют «Ожидается». Сохранять короткие ссылки на test names/команды и причину ожидаемого падения; секреты в журнал не писать.

## Итоговая проверка 28.10.2026

- `npm test`: 47/47, включая 24 прежних теста, registry/auth, агентские tools, независимый review, официальный SDK и отделение реального результата от симуляции.
- `npm run test:e2e`: 8/8, включая 4 прежних сценария; после расширения AC08 повторно `npm run test:e2e -- e2e/mcp.spec.ts`: 2/2. Независимый SDK проходит initialize/listTools/get_context по HTTP и через stdio subprocess; полный lifecycle проверен по HTTP, включая Fork и успешную remediation Blocker. Read-only `agent:check` также выполнен subprocess-тестом.
- `npm run typecheck` и `npm run build`: успешно. `npm run db:check`: миграции, append-only guards и durable replay 35 событий успешно; отдельно `tests/agents.test.ts` проверяет upgrade базы alpha.1, сохранение регистраций и отзыв после reopen.
- Отдельный read-only аудит quickstart/SDD/реализации не нашёл существенных противоречий; пробел SDK-свидетельства AC08 закрыт сценарием выше.

Среда: Node.js 24.19.0, Next.js 16.4.3, официальный MCP SDK 1.32.2, локальный PGlite и системный Chromium. Внешний PostgreSQL, реальные установки Cursor/Claude Code, OAuth-only клиенты и управление LLM-процессом этой проверкой не охвачены.

## Найденные регрессии

- `tests/real-agent.test.ts`: RED `simulation:true !== false` → GREEN после привязки признака к действительному симулятору; реальный зарегистрированный агент не маркируется учебным результатом.
- Независимый `tests/agent-review.test.ts`: RED3/3 — старый HTTP Inbox раскрывал полный snapshot зарегистрированному агенту; два ACK tools допускали чужую фазу. Исправление выдаёт компактный scoped ответ, а ackPhase проверяется доменом после receipt lookup (идемпотентный повтор сохраняется).
- Тот же review: новый запрос старой ревизии был принят (RED). Добавлен guard до создания запроса; late Action остался допустимым историческим фактом. Итог независимого review5/5 GREEN, включая malformed/oversized/Origin/Host HTTP boundary.
- Контракт ошибок уточнён по фактическому официальному SDK: доменные ошибки содержат structured code, schema/unknown-tool могут иметь стандартный MCP text error. Это протокольно допустимое поведение, не скрытая подмена человеческого решения.
