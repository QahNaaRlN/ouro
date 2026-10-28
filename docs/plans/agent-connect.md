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
| Credentials/registry | Ожидается | Ожидается | AC01, AC02, AC05 |
| Tools/lifecycle | Ожидается | Ожидается | AC05–AC09 |
| MCP HTTP/stdio | Ожидается | Ожидается | AC03, AC04, AC11 |
| UI onboarding | Ожидается | Ожидается | AC06, AC10 |
| Общие регрессии | Базовая версия: 24 + 4 tests | Ожидается | AC12 |

Только реально выполненные результаты заменяют «Ожидается». Сохранять короткие ссылки на test names/команды и причину ожидаемого падения; секреты в журнал не писать.
