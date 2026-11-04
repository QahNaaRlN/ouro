# Явное окружение проектного runtime

Статус: **DESIGN_ACCEPTED / IMPLEMENTATION_IN_PROGRESS**. Основание — принятые D03/D05/D07/D15; база `e93e34c56e792dcf28ee2e3cf98b96766f9e15da` включает отдельно проверяемую историю client error policy (PR70).

## Проблема и граница

`createProjectRuntime` уже принимает фабрику ports, но без неё молча выбирает HTTP, закрепляет `ouro:same-origin` и подписывается на `window`. Поэтому внедрение native ports само по себе не устраняет web authority и не позволяет честно назвать этот runtime переносимым.

В этом срезе фабрика требует неизменяемую конфигурацию: неприватный `sourceId`, semantic ports, reporter и источник connectivity-сигналов. Она не импортирует HTTP и не обращается к browser globals. Каждый экземпляр владеет прежними QueryClient/registry/bindings; source входит в существующий ключ session/cache. Текущие web shells собирают тот же HTTP/runtime через один явный временный compatibility adapter в `components`.

Значения зависимостей фиксируются при создании: последующее изменение переданного объекта не меняет source или transport существующего owner. Ports получают прежние scope/adopter/command presentation и режим текущего UI. Ни одна операция не отправляется при импорте или создании runtime; connectivity подключается при первой аренде и отключается после последней.

## Сохранение поведения

- Один registry/adopter/SSE owner на scope, прежние lease/disposal/read cancellation и Query defaults.
- Текущий web source `ouro:same-origin`, HTTP URLs, cookies, замороженное тело/receipt/UNKNOWN и labels без изменений.
- Reporter остаётся общим с принятой client error policy; runtime не создаёт дополнительный console sink.
- Отсутствующие dependencies отклоняются до создания cache/ports/listeners; fallback не выбирается.

Это **не** полный embedded export: остальные legacy операции всё ещё используют HTTP helpers. RAM pending-intent manager текущего web adapter не получает multi-host scope этой правкой. Нельзя подключать его к нескольким независимым источникам, считать конфигурацию полномочием или выдавать срез за готовый native bridge.

## Проверка

Нужны поведенческие проверки runtime с внедрёнными ports при запрещённых ambient fetch/EventSource/window; независимость source/host epochs; защита от изменения configuration object; сохранение single-owner lease/cleanup. Существующие pending UNKNOWN/exact-retry и response-loss случаи остаются обязательными. Types, architecture, migration/style guards и полный CI дополняют эти проверки. Локальная проверка выполняется; финальный integration CI ещё **NOT_RUN**.

Фактические локальные результаты описаны в [журнале](../plans/project-runtime-environment.md): baseline PRE01–04 RED и целевой набор34/34 GREEN. Ошибка подключения освобождает собственную lease и projection; если cleanup также завершится ошибкой, AggregateError сохраняет исходную setup failure первым элементом. Ошибка последнего connectivity cleanup не пропускает release session. Полный embedded/native режим этим не принимается.

Независимый peer выявил дополнительные ошибки lifecycle: исключение уже запущенной subscription мешало dispose/revocation; исключение state observer прерывало сам отзыв доступа или успешное чтение. PRE06–09 воспроизвели их до соответствующих исправлений. Terminal flags/view задаются до уведомлений и закрытия ресурсов. Ошибка state observer отдельно нормализуется как безопасная `async-operation`, без вымышленных access/host epochs, и не меняет исход чтения/команды. При ошибке port cleanup логический owner остаётся неактивным, но физическое закрытие неисправного транспорта **не подтверждено**; ошибка очистки сохраняется. Это не гарантия одного физического соединения при нарушенном adapter contract.
