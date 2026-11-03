# Облачный Ouro · отдельный контур

03.11.2026. Этот runbook описывает подготовку и проверку. Фактические результаты выпуска фиксируются отдельно; наличие файлов не означает работающий HTTPS, проверенную почту или перенос локальных проектов.

Приложение beta.4 / protocol 0.3.0 / миграции 001–012. Один экземпляр Node24.19.0, отдельный PostgreSQL17.11, существующий Caddy. Локальные проекты остаются автономными; синхронизация, перенос данных и device bridge не включены. Первый облачный проект новый, закрытый и пустой. Локальные key/token/data-файлы не копируются на сервер.

## Подготовка и квалификация

- Собирать image на отдельной машине, а не на VPS с работающим Grace. [Dockerfile](../Dockerfile) исключает данные/секреты, собирает текущий protocol, SQL и production-зависимости с native Argon2. Production выполняется под `node`, без dev launcher и shared human/agent credentials.
- Собрать target `qualification` для проверок и target `runner` с меткой точного SHA. Испытать настоящий PostgreSQL, не PGlite, в отдельных disposable databases. Команда `npm run test:external-pg` требует два разных URL и `OURO_TEST_DB_CONFIRM=DEDICATED_DISPOSABLE_DATABASES`; `DATABASE_URL` не используется как неявная тестовая база. CI запускает отдельный обязательный PostgreSQL job.
- Проверить production image с ограничениями app384MiB/heap256MiB и db256MiB: health, password login/Argon2, несколько SSE, restart и данные. Эти лимиты — начальная конфигурация, достаточность подтверждается измерением. При OOM/таймаутах не объявлять готовность и не отнимать память у Grace.
- `scripts/smoke-hosted-image.mjs` запускается в изолированном CI либо с явным `OURO_RUNTIME_SMOKE_CONFIRM=ISOLATED_LOCAL_DOCKER`. Нужны квалификационный image, ID собственного disposable PostgreSQL container и app-only тестовый URL. Он создаёт собственные БД/network/container и удаляет только их; production credentials/серверы здесь не используются.
- Отдельно проверить HTTPS proxy: точный Host/Origin, Secure cookies, отказ чужого origin, неизвестного host, anonymous project API и изоляцию двух аккаунтов/проектов. Cloud runner/local filesystem capability недоступны без своего отдельного безопасного контура.

## Секреты и начальный Owner

Создать новый защищённый файл вне исходников по [шаблону](../deploy/hosting.env.example), mode600. `POSTGRES_ADMIN_PASSWORD` и `POSTGRES_PASSWORD` — два разных новых случайных hex-секрета. `ouro_admin` существует только в DB/операторском контуре; приложение подключается как `ouro` без SUPERUSER/CREATEDB/CREATEROLE и владеет только своей БД/DDL. Admin-секрет в app не передаётся. Старый `/opt/ouro/.env.hosting`, старые образы и данные других приложений сохраняются. В чат, Git, build args и image секреты не передаются.

Приложение запускается с `OURO_PUBLIC_URL=https://ouroapp.ru`, `OURO_DEPLOYMENT_MODE=cloud`, demo off и собственной `DATABASE_URL`. У `db`/`app` нет published ports. App подключён к своей внутренней сети и существующей edge-сети с alias `ouro-app`; DB не подключена к edge.

Owner создаётся отдельной операторской командой `.operations/bootstrap-cloud-owner.mjs` с:

```text
OURO_BOOTSTRAP_CONFIRM=CREATE_NEW_CLOSED_CLOUD_PROJECT
OURO_BOOTSTRAP_FILE=/private/owner-input.json
DATABASE_URL=<own protected PostgreSQL connection>
```

Входной JSON mode600 содержит только `email`, `name`, `password`, `projectName`; внутри контейнера он принадлежит UID1000 (`node`), иначе non-root процесс его не прочитает. Реальные значения не помещать в пример или аргументы shell. Password генерируется/вводится через защищённый канал. Команда выводит только IDs/роль, создаёт один аккаунт и отдельный проект через существующие guards. Она отказывается при существующих accounts: частичный результат нужно разобрать, повтор не создаёт нового владельца автоматически. Bootstrap не выдаёт владельцу права всех проектов и не назначает ему учебный legacy-проект. После успеха защищённый ввод нужно убрать из контейнера/временного файла по утверждённому операторскому порядку; пароль сохранить в менеджере пользователя.

## Почта

Настройки: отдельные `OURO_SMTP_HOST/PORT/SECURE/USER/PASSWORD` и `OURO_MAIL_FROM`; прежний `OURO_SMTP_URL` поддерживается как альтернативный формат. Для отдельного формата нужны все пять полей; `SECURE=true` включает implicit TLS, `false` требует STARTTLS. Смешанная/частичная конфигурация и отключение проверки сертификатов отклоняются. URL поддерживает smtp/smtps и optional `secure=true/false`; пароль внутри URL кодируется как URL-компонент. Адрес отправителя и доменная авторизация проверяются у провайдера. Доступы Ouro выдаются отдельно; секреты Grace не переиспользуются.

Пока отдельные SMTP-доступы не предоставлены, поля остаются пустыми. Login с подготовленным паролем проверяется отдельно. Invitation/password reset, доставка писем и многопользовательская эксплуатационная готовность не объявляются проверенными. Тестовые отправки выполняются после явного согласования адресата; сообщения коллегам сами не отправляются. Прямой UI смены пароля без reset-процедуры этим пакетом не добавляется.

## Сервер и Caddy без перезапуска Grace

1. Сохранить существующий `/opt/ouro` snapshot и `.env.hosting`; новый релиз разместить отдельным каталогом. Использовать только Ouro compose project `ouro-production`, свой volume и новый проверенный image. Не применять старый PGlite migrator001–005 к текущей истории.
2. До включения домена запустить только `db/app` Ouro. Дождаться healthy и проверить account/project access. Исходный локальный Ouro продолжает обслуживать свои проекты; его данные не направляются в облако.
3. Общие80/443 уже принадлежат работающему Caddy Grace. Его конфигурация содержит `import /data/ouro/*.caddy`. Новый [точный site](../deploy/ouroapp.ru.caddy) использует `ouroapp.ru`, а не необъявленную переменную Caddy; только `/` перенаправляется на `/projects`.
4. Подготовить отдельный файл Ouro, проверить объединённую candidate-конфигурацию через `caddy validate`, затем атомарно включить `.caddy` import и выполнить reload существующего Caddy. Candidate обязан включать новый site при проверке. Перед/после проверить health и IDs Grace. Не делать Grace `compose up/down/restart`, не менять его mounts/секреты и не занимать его порты вторым Caddy.
5. Проверить настоящий внешний TLS/HTTP, login/logout, запрещённые Origin/Host и доступ к выбранному проекту. При отказе откатить только собственный Ouro site через проверку/reload, сохранив Grace. DNS/redirect сами не доказывают готовый TLS.

## Резервная копия и восстановление

Из каталога конкретного Ouro deployment задать `OURO_HOSTING_ENV_FILE` и приватный `OURO_BACKUP_DIR`, затем выполнить `sh scripts/backup-hosted.sh`. Скрипт создаёт custom-format dump, проверяет читаемость и пишет SHA256; права ограничены. Это копия на том же сервере: offsite-хранилище, retention и расписание требуют отдельной настройки.

`sh scripts/restore-hosted-drill.sh /private/ouro.dump` восстанавливает только в уникальную `ouro_restore_*` БД, проверяет SQL/schema и реальный replay обычным store. Успешная тестовая БД удаляется, отказ оставляет её для разбора. Рабочая `ouro` не перезаписывается. Для доказательства точного совпадения source/restore сравнить все table fingerprints и stateFingerprint из verifier на неизменяемой/приостановленной на запись исходной базе; один успешный replay не доказывает идентичность исходнику.

При проверке схемы/migration ошибка не должна печатать connection URL или сырые строки. Миграция существующей БД требует проверенной копии и отдельного gate. Откат старой БД поверх новых событий запрещён: сохраните новые факты и восстановите отдельный контур с явной сверкой. Shared Caddy и Grace при этих действиях не останавливаются.
