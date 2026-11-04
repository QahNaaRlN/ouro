# SPP · Журнал atomic marker publication

Дата: 2026-11-04. Ветка `codex/service-profile-publication`, база `2d34db8`. [SDD](../specs/service-profile-publication.md) создан до тестов и кода. Push до review не выполняется.

## До реализации

Прочитаны текущий shared `lib/storage/profile-owner.ts`, service facade, `openDatabase` ownership и существующие lifecycle/artifact tests; исторический first-marker crash gate сохранён в SR journal. Owner подтвердил сохранение v1 формата без нового profile/path hash. URI story выполняется отдельно, HTTP файлы этой историей не меняются.

Проверки используют отдельные Node children и явные fixture-only барьеры вокруг настоящего SQLite exec/link; production fault-injection API не добавляется. Kill выполняется только для принадлежащего тесту процесса. Orphans исследуются только в собственном temp fixture, не в рабочих профилях.

## Результаты

- Crash-before-COMMIT RED: **FAIL**, 194 ms. Настоящий child остановлен после SQL writes до первого COMMIT; canonical уже существовал, ожидаемое отсутствие неоднозначного marker нарушено. `.operations/profile-publication-red.log`. Ошибки установки/окружения не засчитывались RED.
- Реализация: прежний v1 metadata и guard helpers сохранены; новый unique wx sibling temp инициализируется, COMMIT/validate/close предшествуют fs.link. EEXIST читает опубликованный canonical; canonical никогда не удаляется этим алгоритмом. Своё temp-имя удаляется только после проверки dev/ino. Нет copy/rename fallback, reclaim или нового profile/path hash.
- Windows hardlink/concurrent initializers/process kill: **PASS**. Барьеры до COMMIT, после COMMIT/close до link и после link проверены реальным kill/restart. Orphan bytes/inode остаются прежними. Два отдельных Node initializers получили ровно один linked и один EEXIST, опубликовали inode одного temp и одновременно держали ровно одного owner. Fixture фиксирует закрытый SQLite initializer перед link.
- Negative/compatibility: **PASS**. Unsupported hardlink отказывает без fallback и удаляет только собственный temp; подменённый temp/foreign canonical сохраняются. Прежние v1 header/schema, sidecar/dataDir junction guards и reuse legacy v1 без замены bytes/inode проверены. Дополнительный настоящий PGlite.close barrier подтверждает, что exclusive mutex ещё занят до завершения close.
- Итоговый artifact/startup/ownership run после path fixes: **20/20 PASS**, без SKIP, 51.5 s; `.operations/profile-final-service.log`. Сюда входят 12 новых cases и 8 прежних: ready child kill/restart, migration failure cleanup и удержание mutex при неподтверждённом drain. Дополнительный guard SPP13 проверяет, что failed same-process probe не снимает exclusion против другого процесса; окончательная новая группа **13/13 PASS**, без SKIP (`.operations/profile-publication-new-tests.log`). Это 21 уникальный case; прогоны пересекаются, их счётчики не складываются. Прежняя полная transport/runner группа повторно не запускалась.
- Service strict typecheck/checkJs/build, root TypeScript, architecture/migration/styles/conventions и Next production compatibility build: **PASS**. Protocol dist сначала штатно собрана для зависимых type checks; отсутствующая dist не считается product RED.
- Linux CI: NOT_RUN.

Root package/lock, store lifecycle/SQL, HTTP routes, frontend и URI не менялись. External PostgreSQL по прежнему возвращает Pool до вызова embedded owner, memory возвращается до filesystem IO; изменение этих политик не входило в diff. Тестирование использует Node 24.19 и текущий Windows temp filesystem; power loss, generic orphan cleanup и Node 20 compatibility не заявляются.

## Дополнительный path-budget review

После первой группы найден настоящий Windows regression temp naming: canonical v1 длиной 222 chars успешно создавался и приобретался, а добавленный UUID suffix давал 264 chars и ERR_SQLITE_ERROR на init. Отдельный тест воспроизвёл RED. Fixed basename с полным UUID исправил длинный profile basename, но root review потребовал сохранить также длинный parent + короткий profile; этот второй сценарий тоже подтверждён RED до исправления (`profile-length-red.log`, `profile-parent-length-red.log`).

Окончательное private имя — `.ouro-` + 20 hex из `randomBytes(10)`: 26 ASCII / 80 случайных бит, не длиннее минимального прежнего canonical suffix. Оба regression profiles GREEN. `wx` collision проверен отдельно: EEXIST отказывает, preexisting file сохраняется и link не вызывается. Это не новый формат persisted marker или profile hash. Root review основной публикации не нашёл blockers; уточнение длины temp выполнено в этой же ограниченной истории.
## Linux CI: сохранение POSIX lock при повторном обращении процесса

CI41832292162: browser и PostgreSQL PASS; service55/56, SPP13 FAIL — внешний процесс получил `acquired` после отказа повторного обращения текущего процесса. Это настоящий product RED. Причина: header validation открывала/закрывала fd canonical inode; на POSIX close снимает process-associated SQLite fcntl lock первого владельца.

Перед любым canonical open добавлены синхронные process-local claims пути и dev/ino. Они предохраняют существующий OS lock; SQLite остаётся межпроцессным authority. Path claim покрывает concurrent initialization; inode claim отклоняет hardlink alias до header open. Release очищает claims только после ROLLBACK и успешного SQLite close; ошибка закрытия сохраняет fail-closed reservation. Отказ alias не снимает чужой claim. Независимый source review: blockers не найдены.

Windows Node24.19: service strict types/build PASS; финальный запуск15SPP+6lifecycle =21/21 PASS (132.2s). SPP14 покрывает hardlink alias и внешний процесс, SPP15 — два concurrent same-process initializer, единственного владельца, idempotent release и повторный запуск. Linux повторный CI_PENDING; Windows GREEN не выдаётся за POSIX GREEN. В локальной подготовке исправлена опечатка type predicate до запуска тестов; ранняя команда с неверным именем файла теста не запускала domain cases и не является RED.

