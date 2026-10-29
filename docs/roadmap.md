# План разработки Ouro

29.10.2026. Основание: ТЗ §6, ТС §3–8 и прямые уточнения пользователя. Учебные карточки seed-проекта не являются этим инженерным backlog. Работа выполняется последовательно пакетами SDD → RED → GREEN → независимое ревью → отдельный draft PR. Тестируемая пользователем alpha.2 и её данные не меняются: разработка ведётся в отдельном worktree и БД.

| Порядок | Результат | Статус |
|---|---|---|
| 0 | Human View, статусное ядро, immutable история, Roadmap/Reality | alpha.1, PR #1 |
| 0 | Реальные MCP HTTP/stdio, регистрации и назначения агентов | alpha.2, PR #2 |
| 1 | Процессные схемы внутри ревизий и визуальные статусные переходы | alpha.3: OURO-ENG-000002, 63 unit/integration +13 E2E |
| 2 | Realtime с cursor/reconnect и фильтры по агенту/запросу | alpha.4: OURO-ENG-000003, 88 unit/integration +22 E2E |
| 3 | Проверяемый GitHub commit → Action с явным контекстом | alpha.5: OURO-ENG-000004, 129 unit/integration;25 прежних +3 controlled UI E2E; production build |
| 4 | Архив основанных на фактах уроков и связанные черновики спек | alpha.6: OURO-ENG-000005, 134 unit/integration +32 E2E; production build |
| 5 | Объяснимые показатели расхождений и метрика дрейфа | alpha.7: OURO-ENG-000006,147 unit/integration +34 E2E; production build; [правила и примеры](proposals/drift-metric.md) |
| 5.1 | Уточнения/исправления решений, исторический cursor, восстановление отозванного агента | alpha.8: OURO-ENG-000007,172 unit/integration +39 production E2E; production build и browser/SSE smoke |
| 6 | Совместное редактирование черновиков с идентичностью участников | alpha.9: OURO-ENG-000008,206 unit/integration +46 production E2E; отдельные человеческие сессии, Yjs и атомарная публикация |
| 7 | AI-сводки Reality и предложения новых спек с источниками | alpha.10: OURO-ENG-000009,219 unit/integration +50 production E2E; предложения внешнего MCP-агента, human review/adoption в idea, активация отдельно; [контракт](specs/agent-proposals.md) |
| 8 | Адаптер Meridian на стороне Ouro | alpha.11: OURO-ENG-000010,245 unit/integration +57 production E2E; строгий pinned import, человеческий idea-черновик, статические light/dark tokens; [инструкция](meridian-guide.md). Native IPC/SSO/theme sync и Windows-приёмка остаются отдельным [RFC](proposals/meridian-native-bridge.md) |
| 9 | Подготовка полной версии к локальному запуску | OURO-ENG-000011:247 unit/integration +57 dev E2E; чистый клон с GitHub, переносимые npm-команды, build/start с сохранением БД; [инструкция и проверки](plans/local-start.md) |

Исправление входа в детальный процесс из дорожной карты — [OURO-ENG-000012](plans/roadmap-process-navigation.md): точная активная ревизия по клику/Enter/пробелу, явное пустое состояние, 2 новых + 10 прежних browser-сценариев; без изменения доменной истории.

Дополнительные требования действующей методологии реализованы пакетом [OURO-ENG-000007](specs/methodology-recovery.md): отзыв/уточнение и исправление решения новыми фактами, read-only проекция на выбранном cursor, операторское восстановление после экстренного отзыва ключа. Физические Blocker и неизвестная остановка сохраняют отдельные guards; [сценарии и ограничения](methodology-guide.md).

Ouro-side пакеты этой последовательности реализованы и проверены в указанных границах; нативный пакет Meridian остаётся открытым по конкретному RFC. Ограничения внешних интеграций документируются по фактической проверке; fixture не считается live-интеграцией. Встроенный LLM runner, production SSO/RBAC/tenancy, внешний PostgreSQL acceptance, release/tag и публичное развёртывание в этот срез не входят. Каждый следующий пакет фиксирует собственные AC до кода.
