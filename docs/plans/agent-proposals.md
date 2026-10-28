# SDD/TDD · OURO-ENG-000009

[Контракт](../specs/agent-proposals.md) зафиксирован коммитом929b5e4 до кода.

| Область | Наблюдавшийся RED | GREEN |
|---|---|---|
| Домен/источники/версии/adoption | 5/6 failed с «Неизвестная команда»; один отрицательный schema case уже отвергал неизвестную команду и отдельно не доказывал новую валидацию | 7/7 после реализации: строгие схемы, окно/исполнение, immutable версии, поздняяr1, review/adopt/provenance, ordered union/GitHub source |
| Настоящий SQL | Первые3 SQL проверки добавлены после доменного RED; затем фактический RED requestId NUL → SQL UTF8 failure | 4/4: reopen/receipt-before-version, rollback Spec/proposal/dependency/outbox/receipt, captured revoked identity и requestId Unicode |
| Общая регрессия | База alpha.5:129 | Финальные142/142 unit/integration,32/32 полных E2E; typecheck успешен, production gate ниже |
| Human UI + MCP SDK | На отдельном3239: настоящий SDK создал предложение, затем отсутствовала навигация «Предложения агента» | 4/4: HTTP+stdio, source/Flow/exact lost-response adoption, uncertain navigation/retry, concurrentr2/focus/rebase, mobile/light summary review |

MCP content schema используется и опубликованным инструментом, и core. Citation predicate отдельно ограничивает выбранное execution; обычная aggregate get_updates visibility остаётся совместимой. В источники не входят Proposal/Lesson/shared drafts; требуется хотя бы один первичный observation/lifecycle/decision факт.

SQL-проверка использует отличимое PRIVATE HUMAN EDITED DESTINATION и проверяет отсутствие этого тела в агентских get_updates/get_context; AgentProposalAdopted несёт только destination IDs и комментарий агенту. Исходное предложение, human draft и источник не смешиваются.

Первый browser запуск ошибочно подключился к уже занятому тестовому3210 и увидел прежний MCP inventory. Это ошибка окружения, не предметный RED; пользовательский preview/БД не затронуты. Для пакета закреплены3239 и /tmp/ouro-proposals-e2e, затем включён CI=1 (запрет reuse занятого сервера). Отдельный реальный UI RED выше воспроизведён уже на собственном сервере. Последующий UI прогон выявил accessible name textarea, включавший подсказку; поле получило явное имя «Комментарий агенту», проверка не ослаблена.

## Реально прочитанные ориентиры

[MCP Tools 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools): inputSchema/закрытые объекты, structuredContent с TextContent для совместимости, annotations как недоверенные подсказки, серверные validation/access controls. Отсюда общая strict runtime schema и авторитет доменных guards, а не tool annotations. StructuredContent не является утверждением о schema-constrained генерации модели. Читались соответствующие разделы Tools, не весь стандарт и не все клиенты.

Текущие Next.js16.4.3 Server/Client Components и Route Handler streaming изучены из установленного node_modules/next/dist/docs. Stateful review form работает в Client Component; сервер остаётся владельцем receipt/version/identity. Принадлежность цитаты проверяется машинно, семантический вывод — человеком. Тест SDK не считается оценкой качества LLM или доказательством фонового provider.

[W3C PROV-DM](https://www.w3.org/TR/prov-dm/) фактически прочитан в разделах2.1.1–2.1.3 (entity/activity, derivation, agent/responsibility) и5.2.2/5.2.4/5.3.2 (revision, primary source, attribution). Применение: отдельные immutable версии предложения и новой спеки; агент — автор интерпретации, человек — автор отредактированного ожидания; явная связь с исходными фактами и точной версией. PROV прямо различает использование источника и достаточность основания для derivation, а определение primary source зависит от предметных соглашений. Поэтому ссылка не выдаётся за семантическую проверку, а спековая derived_from добавляется явно человеком. PROV-N/RDF экспорт и полное соответствие PROV-CONSTRAINTS не заявляются.

## Независимое ревью

Root обнаружил обратную несовместимость: новые proposal arrays читались в конце любого tool response, а старые immutable SQL receipts их не содержат. Независимый reviewer создал append-only legacy receipt fixture и получил фактический RED0/1: повтор старого report_action отвечал INTERNAL_ERROR после последующих человеческих команд. Теперь массивы нужны только submit_proposal; старый receipt не переписывается. GREEN1/1, выбранная регрессия старых tools+SQL12/12 и полный140/140 успешны; ID события, прежний cursor и отсутствие чужого тела сохранены.

Reviewer также указал на потерю локального unresolved intent при размонтировании панели. Запрос перенесён в Home-owned memory registry по project/proposal, cleanup проверяет requestId. Browser3/3 подтверждает переход «История»→назад с прежним телом/requestId/readonly lock; отдельный UI RED этой находки не заявляется. Origin link выбирает точный proposal/revision, а HTTP/stdio metadata теперь берётся из package.json и проверяется настоящими SDK.

Второй независимый SQL RED: lone high/low surrogate и NUL в proposal content давали INTERNAL_ERROR вместо VALIDATION_ERROR; включён также nested Flow title. Общая Zod text factory теперь отвергает строки, которые не проходят точный JSONB round-trip. После этого отдельный human adoption test показал NUL requestId ещё до core validation: SQL receipt query отвечал ошибкой UTF8. Минимальная primitive gate в store проверяет requestId до первого SQL-запроса. Оба пути теперь дают controlled VALIDATION_ERROR без cursor/effect; invalid request не становится внутренней ошибкой БД. Совместимость валидных старых receipts подтверждена отдельно.

Четвёртый browser scenario доказывает второй исход неуверенного сохранения: запрос не дошёл до сервера → повтор с тем же ID получает VERSION_CONFLICT без receipt → только тогда форма разрешает явный rebase и новый requestId. Создаётся ровно одна спека. Финальные32/32 выполнены на отдельном /tmp/ouro-proposals-final-e2e; прежние test fixtures сохранены, пользовательские данные не менялись.

Итог изолированного пакета на базе239d6de:142/142 unit/integration,32/32 E2E, typecheck и повторная production build успешны. Нативный модельный runner/качество всех LLM не проверялись и не заявляются. Rebase поверх предыдущих пакетов дорожной карты и финальный version bump выполняются отдельным gate перед публикацией draft PR.

## Объединение с collaboration

Предварительный rebase на f6ec28f сохранил Lesson origin, метрику, decision lineage, replay visitor, исторический read-only guard и participant auth/transaction helper. AI panel монтируется только в live fragment; инвентарь объединён до15 инструментов, metadata берётся из package.json. Typecheck выявил три прежних lesson-only обращения к origin; добавлен явный discriminator без ослабления assertions. Targeted AI/старые tools/Lessons/metric/history/maintenance46/46 успешны.

Новый интеграционный browser RED: после неуверенной записи ответ401 на повтор очищал сохранённый intent, хотя auth выполняется до receipt lookup. Теперь auth/rate failures сохраняют прежнее тело/requestId; переосмысление основы разрешается после receipt-aware domain rejection. Сценарий проверяет lost response→навигация→auth denial→тот же retry→точный черновик. Финальный collaboration head и общий gate ожидаются отдельно.

После исправления интеграционного RED все4/4 proposal browser scenarios прошли на f6ec28f. Это targeted gate, не заявление о завершённой проверке ещё не полученного final collaboration head.


## Итоговый объединённый gate alpha.10 · 28.10.2026 UTC

Пакет перебазирован на финальный collaboration head81b4e5a. Код ea3e668 сохраняет participant authentication, технические Yjs-черновики, Lesson/proposal origin, replay visitor, историю и операторские guards. Проверки завершены:219/219 unit/integration, typecheck и production build успешны;50/50 полных production E2E прошли за4 минуты на отдельном3239. Использовалась сохранённая тестовая БД /tmp/ouro-proposals-alpha10-production-e2e; fixtures добавлялись в её историю, прежние данные не удалялись. JSON-отчёт контрольного прогона сохранён в /tmp/ouro-alpha10-final-e2e.json. Это проверка всей объединённой alpha.10, в отличие от прежних142/32 изолированного пакета и targeted46/4.

MCP HTTP и stdio через официальный SDK подтвердили15 инструментов и metadata0.1.0-alpha.10. Отдельный production preview3008 запущен с NODE_USE_ENV_PROXY=1 и собственной .ouro/preview-postgres. Read-only browser smoke в тёмной desktop и светлой390px теме:0 page errors, горизонтального переполнения нет, SSE подключён, domain cursor35→35. Скриншоты /tmp/ouro-alpha10-proposals-dark.png и /tmp/ouro-alpha10-proposals-mobile-light.png; светлый мобильный экран осмотрен. Preview/БД пользовательской alpha.2 на3000 не изменялись.

После gate независимый разбор выявил ещё один сценарий для заключительного интеграционного пакета: смена participant cookie A→B в другой вкладке при невыясненном A-запросе и устаревшей React identity. AI review intent этой версии не закрепляет actorId; повтор от B может получить чужой VERSION_CONFLICT и ошибочно снять блокировку A или записать незаписанный запрос от имени B. Этот сценарий не покрыт указанными50 E2E и не считается исправленным в alpha.10. На финальную интеграцию передан конкретный guard: закреплённый автор запроса, expected participant header и серверная проверка actual actor до receipt lookup. Результат и регрессия фиксируются в заключительном журнале; успешный gate выше не подменяет эту проверку.
