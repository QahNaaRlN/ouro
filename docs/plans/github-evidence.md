# SDD/TDD · OURO-ENG-000004

[Контракт](../specs/github-evidence.md). До реализации проверяются наблюдаемые RED, затем минимальный код/GREEN.

| Область | RED | GREEN |
|---|---|---|
| Binding/Action/revision | Ожидается | Ожидается |
| HMAC/API/provenance | Ожидается | Ожидается |
| Durable queue/dedupe/rollback | Ожидается | Ожидается |
| UI и общие регрессии | Ожидается | Ожидается |

Данные и процессы preview3000/3001 не изменяются. Тесты независимы от секретов, реальные внешние доставки отмечаются отдельно от controlled-server fixtures.
