# Статусы проходов · SDD/TDD

29.10.2026 · [SDD до реализации](../specs/flow-runtime.md) · база `70cb0fd`.

Рабочая копия `/workspace/ouro-flow-runtime`, ветка `feat/flow-runtime`. Предыдущие рабочие копии, preview и БД пользователя не используются для разработки. Исходная реализация имеет Action phases, attribution по flowNodeId и четыре независимых автомата; отдельного run/traversal lifecycle нет.

До кода зафиксированы FR01–FR12, opt-in совместимость, последовательный профиль, guards человека и повторов, отдельные pass IDs, конкретные DTO/установка и production browser acceptance. Реализация идёт отдельными пакетами core, MCP/протокол и UI; каждый сначала фиксирует meaningful RED, затем GREEN. Итоги записываются по фактическим проверкам, без объявления fixture/live smoke результатом реального LLM-исполнения.

Прочитаны актуальные локальные инструкции Next.js 16: Playwright рекомендует проверять production artifact; Server Actions выполняются по своей модели dispatch, приложение сохраняет существующие HTTP route handlers. Из первоисточников 29.10.2026 прочитаны SCXML transition guards/selection и run-to-completion, React Flow keyboard/ARIA; каталог OMG подтверждает нормативный BPMN 2.0.2. Принципы human task/exclusive gateway ранее изучены в [методологии](../diagram-methodology.md); новый пакет не объявляется стандартным BPMN/SCXML engine. Повторы в Ouro получают новые run IDs, не изменённую историю прежнего состояния.

Результаты RED/GREEN, ревью и окончательные gates будут дополнены после реализации.
