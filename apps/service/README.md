# Ouro service: HTTP qualification boundary

Первый отдельный backend story предоставляет Hono/Node HTTP adapter с явными Web handlers и loopback listener. Это transport foundation; production launcher, DB composition и переключение 47 маршрутов сюда ещё не выполнены.

## Воспроизводимый запуск проверок

Из корня репозитория, используя Node **24.19.0** из `.nvmrc`:

```sh
npm ci
npm run protocol:build
npm --prefix apps/service ci
npm --prefix apps/service test
npm --prefix apps/service run typecheck
npm --prefix apps/service run build
```

Сервис имеет собственный `package-lock.json`; Hono **4.13.16**, `@hono/node-server` **2.1.6** и инструменты закреплены exact versions. Root package не получает Hono. До перехода на общий workspace этот пакет устанавливается отдельно. В CI эти service steps обязательны; root Next tsconfig исключает `apps/service`, его strict check выполняется самостоятельно.

Tests создают реальные TCP-соединения с listener `127.0.0.1` на свободном порту и подключают существующие factories auth, GitHub webhook, SSE и health через typed fixtures. Они не открывают пользовательские DATABASE_URL/OURO_DATA_DIR, не отправляют почту/GitHub запросы и не создают production credentials. Существующие модули Ouro пока CommonJS; tests используют typed `createRequire` bridge, не меняя root module contract.

Сборка создаёт `dist/index.js` и declarations. Публичный API — `createServiceApp`, `startHttpServer` и framework-independent handler/route types. Отдельной команды, автоматически запускающей сервер или выбирающей профиль БД, нет. Listener запускается только явным вызовом с заданной серверным кодом таблицей обработчиков.

## Lifecycle и пределы

- Route table владеет методами и индивидуальным body limit; body bytes сохраняются до подписанного webhook parsing. Обработчики не получают generic URL proxy.
- Методная граница сохраняет Next HEAD/OPTIONS/405; body, полученный для HEAD, отменяется до возврата пустого ответа.
- `afterResponse` резервирует ограниченное место и запускает задачу после Node `finish`, передавая `AbortSignal`. Задача обязана кооперативно очистить свои таймеры, сеть и другие ресурсы при abort; signal может быть уже отменён к началу callback. Это owner выполняемых callbacks, а не замена SQL queue/leases GitHub. Capacity refusal после уже совершённого прикладного эффекта нельзя интерпретировать как доказанный rollback.
- `stop()` прекращает admission, отменяет активные request/task signals, дожидается кооперативного cleanup соединений/задач в пределах deadline и освобождает сокеты. При незавершённой задаче deadline возвращает ошибку; adapter не утверждает, что прервал произвольное Promise, принудительно очистил чужой ресурс или отменил выполненную команду. Существующий GitHub kick не имеет собственного signal-контракта; здесь проверяется его вызов, а полная worker cancellation относится к extraction story.
- Перед подключением SQL owner полный сервис должен отдельно учитывать незавершённые application handlers/queries. Закрытый socket и abort signal не доказывают завершения query; текущий callback drain не даёт права немедленно выполнить DB.close. Такое владение и общий cutover относятся к P2 extraction.
- Reporter получает безопасные code/operation; его отказ изолирован. Durable logging, SQL lifecycle и политика worker recovery относятся к следующим server composition stories.

Проверка Secure cookie моделирует настроенный HTTPS public origin перед HTTP loopback transport; TLS handshake/reverse proxy deployment не проверялись. Квалификация этого adapter не доказывает поведение всех 47 маршрутов, durable SQL jobs, PostgreSQL, полного memory/backpressure stress, verification child processes или Meridian/WebView2.

`maxBodyBytes` означает транспортный admission до вызова handler. При полной extraction его нельзя назначать всем маршрутам автоматически: существующие helpers сохраняют порядок auth/content-type/body checks и приоритет ответов об ошибках. Этот story не переключает такие рабочие маршруты на новую политику.

Контракт и фактические команды: [SDD](../../docs/specs/service-qualification.md), [журнал](../../docs/plans/service-qualification.md).
