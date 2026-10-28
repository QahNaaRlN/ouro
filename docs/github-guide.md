# GitHub: коммит как проверяемый факт

Пакет alpha.5 · [контракт](specs/github-evidence.md) · [проверки](plans/github-evidence.md).

## Подключение

1. Разрешите попытку по активной ревизии спеки. В «Интеграции» выберите эту попытку, `owner/repository` и полную ветку `refs/heads/main`.
2. Сервер проверит репозиторий через GitHub API и сохранит его ID вместе с неизменяемыми spec/revision/execution. Одна пара repository ID/ветка имеет одну активную привязку в проекте.
3. На сервере задайте `OURO_GITHUB_WEBHOOK_SECRET`. При закрытом репозитории добавьте собственный `OURO_GITHUB_TOKEN` с доступом на чтение коммитов. Доступ разработчика через GitHub connector не передаётся запущенному приложению.
4. Настройте в GitHub webhook с URL из экрана, Content type `application/json`, тем же секретом и событием `push`. Для GitHub сервер должен быть доступен по HTTPS; локальный loopback сам по себе доставку не принимает.
5. Проверьте delivery в GitHub и состояние в Ouro. «Секрет задан» означает только наличие серверной настройки. Пустая очередь не доказывает успешное подключение.

На Node 24 в окружении с HTTP(S)-прокси нужен `NODE_USE_ENV_PROXY=1`, действующие proxy/CA настройки и исключение loopback в `NO_PROXY`. Без выхода к `api.github.com` факт не считается проверенным. Секреты задаются окружением, в браузере их значения не показываются.

## Смысл результата

После проверки HMAC сервер долговечно принимает доставку и возвращает202. Worker в том же Node-процессе проверяет репозиторий и полный SHA через фиксированный GitHub API. Успешный результат — completed Action с источником `github_commit`, URL и методом `github-api-sha`. Это проверка существования объекта, а не криптографической подписи автора, качества изменения или выполнения DoD. Завершение execution и человеческая приёмка не происходят автоматически.

Поздний коммит сохраняет ревизию исходной привязки. Повтор delivery и другой delivery с тем же SHA для той же привязки не создают второй Action. Отзыв привязки запрещает последующую запись, включая доставку, которая уже ожидала внешний API.

## Ошибки и восстановление

- `pending`/`processing`: очередь ожидает или проверяет. После перезапуска worker восстанавливает работу по истечении lease.
- `retryable`: временная ошибка API, timeout или rate limit. Очередь повторяет проверку с задержкой; человек может запросить повтор в интерфейсе.
- `needs_review`: неполный/предельный список коммитов или неоднозначная доставка. Обычный повтор не восстанавливает отсутствующий хвост; нужна проверка и полная доставка из GitHub.
- Неподписанное/слишком большое/некорректное тело не принимается и не создаёт факт. GitHub не гарантирует автоматический повтор неудачных доставок: используйте [redelivery](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries).

Тело ограничено2MiB, список2048 элементами; достижение предела не выдаётся за полную обработку. Webhook tags/deletion и посторонний repository/ref имеют явный игнорируемый исход. Приложение не загружает произвольные URL из payload.

Проверено: HMAC, реальный SQL/reopen/rollback/lease/dedupe и управляемые HTTP/worker fixtures; отдельный runtime-запрос к публичному GitHub API подтвердил repository ID и SHA Ouro. Реальная установка webhook в GitHub и внешняя push-доставка в этот preview не выполнялись.

## Изученные ориентиры

- [GitHub: validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries): HMAC над исходными байтами и безопасное сравнение.
- [Best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks): быстрый ответ и фоновая обработка; durable inbox и leases — конкретное решение Ouro.
- [Push payload](https://docs.github.com/en/webhooks/webhook-events-and-payloads#push) и [Get a commit](https://docs.github.com/en/rest/commits/commits#get-a-commit): пределы списка, ID репозитория и полный SHA.
- [Failed deliveries](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries): явная redelivery после непринятой доставки.
