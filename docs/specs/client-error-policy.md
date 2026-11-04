# Клиентские ошибки · проект минимального среза D04/D06

Планирование: 2026-11-04; реализация: 2026-11-05. Статус: **IMPLEMENTED_LOCAL / BOUNDED_QUALIFICATION_PASS / REVIEW_ACCEPTED**. Ветка `codex/client-error-policy`, база `f0b25b32c1d1d22f21722d6a81cfcd22e0552716`. Root принял минимальный scope до реализации и bounded source peer после конкретных capture/UNKNOWN fixes: один ClientError/AppError контракт, injected reporter, Query ownership и renderer/async capture. Основание — принятые [D04/D06](../proposals/react-vite-migration/decisions.md) и [контракт стека](../proposals/react-vite-migration/react-stack.md#11-ошибки-диагностика-и-деградация-данных).

## Что уже реализовано

| Часть | Фактическое состояние на planning base |
|---|---|
| Клиентский контракт | `ports/client-error.types.ts`: один `ClientError` с code/message/kind/status; пять kinds: access/contract/network/cancelled/rejected. Existing `ErrorReporterPort` принимает ограниченный occurrence DTO. |
| Чистая нормализация | `lifecycle/normalize-client-error.ts`: normalizer не логирует; проверяет формат code локального ClientError, отличает AbortError, остальное считает network. `reportClientError` отдельно изолирует sync throw и async reject sink. |
| Project capture | ProjectSession нормализует read/stream/command ошибки и формирует occurrence ID; command result UNKNOWN остаётся значением outcome, а не ошибкой Query. |
| Catalog capture | Query function нормализует до throw, не принимает raw body/message как UI-ошибку, очищает sourceId, самостоятельно вызывает reporter. Query cache поэтому уже получает ClientError. Cancelled catalog reads не репортятся. |
| Query defaults | Один QueryClient; автоматические mutation retries отключены. Нет общей QueryCache/MutationCache error policy, типизированных UI ownership meta или suppressToast. |
| Локальный sink | В createProjectRuntime и ProjectRuntimeProvider независимо создаются console reporter. Общего dedupe occurrence и единой injected instance пока нет. |
| Backend | `lib/http.ts` уже сообщает ограниченный HTTP_INTERNAL_ERROR occurrence; service transport/background owner изолирует reporter failures, service main пишет structured JSON в stderr. Повторный backend reporter здесь не нужен. |
| React | Общего renderer ErrorBoundary не найдено. Async project/catalog capture существует; это не обещание перехвата всех обработчиков и Promise приложения. |

Следовательно, прежний текст стека NOT_STARTED описывает целевую полную систему, но часть D04/D06 уже IMPLEMENTED. Эта история должна дополнить существующие контракты, а не создавать второй класс ошибок, второй QueryClient или ещё одного владельца snapshot.

## Принятый минимальный дизайн

### Один контракт, два контекста нормализации

Сохранить runtime класс `ClientError`, его constructor и текущие code/kind/status semantics. Имя `AppError` использовать как type alias этого единственного клиентского контракта, без параллельного класса/второй таблицы категорий. Для renderer/programming failure добавить отдельный kind `unexpected`; существующие пять kinds и их transport semantics не переименовывать. Severity детерминированно выводится из kind, а не из raw stack/message. Field-error/Form API отложить: в выбранном срезе нет миграции форм, поэтому не нужен неиспользуемый общий контракт полей.

Добавить чистую универсальную нормализацию `unknown → AppError` с нейтральным unexpected fallback. Existing `normalizeClientError` сохранить как compatibility transport entry с прежним network fallback: ошибка рендера больше не маскируется под сеть, а текущие read/command ветки не меняют смысл. Unknown Error/string/object не переносит raw message/stack/cause/payload в пользовательское сообщение или diagnostic. Локальный существующий ClientError сохраняет принятый безопасный контракт; cross-process/plain DTO проверяется структурно и не считается доверенным только из-за name/instanceof. Неподтверждённые DTO messages не отображаются как готовый безопасный текст. Конкретные поля DTO должны переиспользовать тот же kind/code контракт, без нового wire protocol.

Нормализатор не создаёт occurrence ID и не вызывает logger, UI, сеть, clock или ID factory. Повторная нормализация не является новой ошибкой и не создаёт второе диагностическое событие.

### Общий безопасный reporter

Развить existing `ErrorReporterPort`/`ClientErrorOccurrence`; не объявлять несовместимый второй порт. Scoped project/catalog occurrence сохраняет настоящие source/epoch metadata. Для renderer/общего async capture нужен явный unscoped вариант: нельзя подставлять вымышленный accessEpoch0 или текущего actor старому событию. Допустимы только объявленные operation/code/kind/severity и проверенные occurrence/correlation/request identifiers; raw exception, URL query, cookie, request body, документ, actor name и stack не входят в событие.

Reporter заново строит whitelist DTO, не сериализует вход целиком. Dedupe key — явный occurrence ID, не текст ошибки и не только объект Error. Один ID, повторно предъявленный UI/диагностикой, регистрируется один раз; две независимые ошибки с одинаковым текстом и разными IDs сохраняются обе. Рекомендуемый первый предел —256seen IDs на instance с FIFO eviction; это bounded-window dedupe, не обещание вечной дедупликации. Очереди, автоматического resend и сетевого sink в этом срезе нет. Локальный structured console sink подключается в composition root; будущие retention/delivery/telemetry требуют отдельной квалификации.

В ProjectRuntimeProvider создать одну reporter instance и передать её project runtime, catalog environment и render boundary. Убрать дублированный implicit console sink из common runtime: отсутствие injected reporter вне browser bootstrap означает отсутствие sink, а не новый скрытый global singleton. Существующий protective `reportClientError` сохраняет изоляцию sync/async failures; reporter failure не вызывает report самого себя и не меняет return/reject пользовательской операции.

### Query: выбранный UI-путь и владелец диагностики

Добавить узкую policy factory для QueryCache/MutationCache и typed meta: primary path `field | inline | boundary | toast | silent`, `suppressToast`, diagnostic owner `operation | cache | boundary`. `throwOnError` остаётся верхнеуровневой Query/mutation option. Cache callbacks не заменяют хранимую Query ошибку: normalization выполняется в operation/queryFn/mutationFn до throw. Нельзя превращать command outcome `unknown`/`rejected` в throw ради общего обработчика.

Текущим project/catalog queries назначить inline/operation ownership: они уже имеют capture point, поэтому cache не создаёт второе событие. Будущая cache-owned операция получает единый capture; boundary-owned Query не получает параллельный toast/report от cache. Классификация и диагностика не зависят от suppressToast. Cancelled не вызывает тревожное уведомление; contract error не обходит выбранного владельца. При выбранном boundary notification также не вызывается.

**Toast UI не добавлять.** Policy может иметь необязательный внедряемый notification callback для проверки маршрутизации и будущего подключения; production callback отсутствует. Tests проверяют правило0/1 вызова на query и mutation, включая schema error и suppressToast. Это основание политики, а не объявление готовой системы уведомлений.

### React boundary и явный async capture

Новый public shared UI leaf `shared/ui/error-boundary` содержит AppErrorBoundary без project/router/context imports. Boundary оборачивает children внутри существующего ProjectRuntimeProvider, сохраняя runtime/Query owner снаружи fallback. Показывается безопасный доступный fallback без raw exception/stack. Он не выполняет reload, повтор команды или автоматический reset: это могло бы потерять или повторить UNKNOWN intent. Расширенный recovery UI и reset по scope требуют отдельного явного контракта.

Render boundary покрывает клиентский render/lifecycle descendants. Он не покрывает SSR exceptions, собственный bootstrap failure, event handler или произвольный async callback; tests не должны обещать обратное. Для async используется явный capture helper с операцией/occurrence: нормализует rejection, безопасно репортит и возвращает ClientError для прежнего throw существующего async owner. Первый реальный integration point — уже принадлежащий catalog queryFn capture; project session сохраняет свои existing capture points и outcome semantics. Обход всех legacy handlers и глобальные window error/unhandledrejection listeners в минимальный срез не входят; этот остаток нельзя назвать завершённым приложенческим async monitoring.

## Неприкосновенные границы

Не менять авторизацию, identity tickets, source/access/host epoch ownership, Query keys/freshness/cancellation, общий snapshot adopter, HTTP/MCP/DB/protocol, command request/body/receipt/UNKNOWN/exact retry, CRDT и service lifecycle. Не добавлять toast UI, Form/i18n migration, telemetry, production sink, shared styles/AppearanceContext или глобальные browser listeners. Existing backend structured reporting остаётся на месте; сквозная client↔service correlation пока не объявляется реализованной.

## Допуск к реализации

Root проверил минимальный scope до реализации: alias вместо второго класса, unexpected fallback/transport compatibility, unscoped occurrence, diagnostic ownership и отсутствие автоматического boundary recovery. Baseline и meaningful RED из [плана](../plans/client-error-policy.md) сохранены. Исходный план был записан до source changes. Локальная реализация и bounded результаты зафиксированы в журнале; final source peer принят. Этот документ не утверждает завершённый D04/D06, production observability или native integration.
