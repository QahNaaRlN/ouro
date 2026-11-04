# SPP · Атомарная первая публикация mutex marker

Дата: 2026-11-04. Реализация отдельной истории разрешена владельцем эпика. Ветка `codex/service-profile-publication`, база `2d34db8`. Рабочие профили, HTTP/URI и production cutover не входят в задачу.

## Проблема и результат

Текущий owner создаёт canonical SQLite mutex-файл через `wx`, затем инициализирует схему и делает первый COMMIT. Kill до COMMIT может оставить canonical файл пустым или неполным: следующий startup корректно отказывает, но обычный restart уже невозможен без отдельной recovery. Graceful cleanup этой ситуации не доказывает crash recovery.

Новый marker сначала создаётся через `wx` в уникальном собственном sibling temp-файле, получает прежнюю v1 metadata, COMMIT и закрытие SQLite. Затем `fs.link(temp, canonical)` атомарно публикует готовый inode без overwrite. EEXIST означает проверку уже опубликованного canonical marker. После публикации удаляется только собственное temp-имя с проверенной identity. Copy, rename-overwrite, удаление/reclaim canonical marker и обход foreign/symlink guards запрещены. Unsupported hardlink — явная ошибка без fallback.

## Сохраняемые границы

- Формат v1, application_id, единственная таблица/kind и rollback DELETE остаются прежними. Новый persisted profile/path hash не добавляется; существующий формат не содержит такого hash.
- Canonical/sidecar file identity, header/schema и final dataDir/marker symlink guards сохраняются. Принятый platform scope final-component alias остаётся прежним; это не новая filesystem sandbox или поддержка alias.
- После публикации canonical SQLite держит BEGIN EXCLUSIVE до PGlite.close. Освобождение после штатного shutdown и OS освобождение после kill сохраняются. Предметные данные остаются PGlite/PostgreSQL; mutex хранит только metadata.
- Memory и внешний PostgreSQL не получают нового filesystem ownership. Store lifecycle и HTTP файлы не изменяются.
- Crash до публикации может оставить собственный orphan temp/journal; canonical отсутствует, обычный следующий startup создаёт новый marker. Orphan не ищется, не переиспользуется и не удаляется автоматически. Если canonical уже существовал и повреждён, fail-closed остаётся: эта история не предоставляет generic repair/reclaim.
- Пути temp вычисляются только из canonical sibling + случайного имени. Cleanup проверяет собственную file identity; foreign/replaced temp не удаляется. Защита от произвольного враждебного изменения filesystem между отдельными syscalls не обещается.

## Наблюдаемые критерии

1. Meaningful RED на настоящем current owner: отдельный Node child прерывается на явном барьере до первого marker COMMIT; после kill canonical не должен быть неполным, обычный повторный owner должен запускаться. Ошибка окружения не считается RED.
2. Crash до COMMIT и crash после COMMIT/close, но до link не публикуют canonical. Новый процесс запускается; оставшиеся orphan bytes/identity не меняются им.
3. Два настоящих Node процесса одновременно полностью готовят разные temp markers и разрешаются на одном link-барьере. Ровно один canonical inode публикуется, второй link получает EEXIST; одновременно приобретается ровно один BEGIN EXCLUSIVE owner. После release следующий owner запускается. Windows hardlink фактически проверяется, Linux остаётся CI gate.
4. Crash после link, до acquire оставляет уже валидный canonical marker и допускает ordinary restart. Существующие kill-after-readiness и PGlite.close ordering tests сохраняют GREEN.
5. Unsupported link не создаёт canonical и не переключается на copy/rename; normal failure удаляет только свой проверенный temp. Подмена temp или появление foreign canonical во время публикации не приводит к удалению/перезаписи чужих bytes.
6. Existing foreign header/schema/empty marker, symlink/sidecar, migration failure, ownership contention и startup cleanup checks проходят; типизация, service artifact build и compatibility guards проходят.
7. Уникальный sibling temp использует basename `.ouro-` + 20 hex (80 случайных бит): всего 26 ASCII, не длиннее минимального прежнего canonical suffix. Ни profile basename, ни длинный parent не теряют прежний SQLite path/filename budget. `wx` collision — fail-closed, чужой файл не удаляется.

Только synthetic temp fixtures и собственные Node children. Node **24.19.0** остаётся обязательным tested runtime. Доказательство относится к process kill, не power loss или произвольной порче filesystem. Linux filesystem/SQLite qualification, installer/P5 enforcement, URI parity, browser/native acceptance и общая приёмка миграции не повышаются этой историей.
