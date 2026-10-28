# OURO-ENG-000004 · GitHub commit → проверяемый Action

SDD · 29.10.2026 · после realtime. GitHub connector разработчика не является токеном запущенного приложения. Runtime использует собственный OURO_GITHUB_TOKEN (необязателен для публичного репозитория) и OURO_GITHUB_WEBHOOK_SECRET; секреты остаются на сервере.

## Контракт

Человек создаёт GitHubBinding для конкретного существующего execution, repositoryFullName, ref refs/heads/*. Сервер проверяет репозиторий GitHub API и фиксирует repositoryId и immutable spec/revision/execution контекст. Не более одного активного binding repositoryId/ref в проекте. Создание/отзыв — новые human domain events. Подмена назначения, repositoryID или перенос binding на активную r2 не допускаются.

Webhook получает ограниченное raw JSON тело, проверяет sha256 HMAC timingSafeEqual до parsing, event/delivery headers и signed payload. Нет secret/signature/raw-body в domain events/receipts. Чужой repository/ref не создаёт работу; delete/tag push игнорируется с явным исходом. Доставка сохраняется в durable техническую inbox-таблицу и получает202 до GitHub API verification. После ответа worker в том же Node/PGlite процессе проверяет commit через фиксированный api.github.com, точный полный SHA и repositoryId; не загружает произвольные URL payload. verificationMethod=github-api-sha означает существование объекта, не GPG-подпись, качество кода или доказательство выполнения DoD.

Техническая queue имеет durable pending/processing/retryable/processed/needs_review состояние, ограниченные leases и attempts. Периодический worker восстанавливает pending/истёкшие leases после старта и не открывает второй владелец PGlite. Временная ошибка API/rate-limit/timeout не превращается в факт; человек видит причину и может повторить. Нельзя объявлять обработанным обрезанный большой push: предел сырого тела2MiB/списка2048; payload с неполным списком или граничным лимитом требует явной дозагрузки/needs_review вместо молчаливой потери хвоста. Не принятый сервером webhook GitHub автоматически не повторяет; это описывается в инструкции redelivery.

Предметный commit сохраняется как обычный completed Action с проверенным GitHub source и service actor, но без завершения execution/приёмки/ACK. Все context-поля берутся из binding; поздний commit остаётся на исходной ревизии. source: kind github_commit, bindingId, repositoryId/fullName, ref, fullSha, canonical commit URL, deliveryId, payloadDigest, verificationMethod, verifiedAt. Агентские report tools не принимают произвольный verified source.

Ingest выполняется транзакционно под существующим project lock: immutable transport receipt по deliveryId/digest и semantic receipt по bindingId/repositoryId/fullSha проверяются ДО построения команды с текущей expectedVersion. Повтор после последующих человеческих команд не даёт IDEMPOTENCY_CONFLICT и не создаёт новый Action. Другой delivery ID с тем же SHA также не дублирует факт. Тот же deliveryID/другое тело конфликтует. Outbox+Action+receipt атомарны. Отзыв binding проверяется повторно при commit после внешнего API await.

UI показывает bindings/точный контекст, настройку окружения без секретов, очередь/ошибки/retry и ссылки на проверенный commit. Источники не выдаются за работу LLM. Один проект, без GitHub OAuth App flow и внешнего broker; необходимые ограничения видны человеку.

## Приёмка/TDD

G01 raw Unicode HMAC/изменённый байт/oversize/неподписанный payload без эффектов. G02 verified binding+scope/unique/revoke. G03 несовпавший API SHA/repo не создаёт Action, remote URL не используется. G04 оба dedupe уровня после последующих команд и конкурентных worker. G05 outbox rollback без semantic receipt. G06 queue/reopen/lease/retry/revoke во время API await. G07 поздний commit сохраняет immutable revision и не принимает DoD. G08 incomplete/delete/tag/unknown repo исходы явны. G09 browser binding/source/retry без ключей + прежние регрессии/typecheck/build.

Ориентиры реально изучены: [HMAC validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), [webhook best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks), [push payload](https://docs.github.com/en/webhooks/webhook-events-and-payloads#push), [get commit](https://docs.github.com/en/rest/commits/commits#get-a-commit), [failed deliveries](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries). Технический дизайн очереди — решение Ouro, не утверждение о наличии токена у runtime.
