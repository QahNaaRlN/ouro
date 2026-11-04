# Журнал переносимых типов чтения

Дата: 2026-11-04. Статус: реализация и локальные проверки PASS; независимое review PASS; CI и merge PENDING.

База: `ee80be6228e66e992182431828a21706bbbda07c`, отдельный worktree. Ветка первоначально создана пустой для инструментария, затем до source edits переименована под изолированный prerequisite физического hFSD-переноса. pnpm не включён преждевременно: его окончательный переход связан с самостоятельным npm release tree и P5.

План: зафиксировать spec; перенести единственные декларации; сохранить server type exports; перевести пять UI imports; удалить ровно пять конечных исключений; выполнить типы, architecture fixtures, protocol/package и затронутые regression checks; independent review и CI перед merge.

Первый offline install в ограниченном окружении не нашёл cache entry `forwarded`; это setup failure, не RED и не изменение зависимостей. Повтор использует существующий пользовательский cache и тот же lockfile. Исходное dirty main и профили пользователей не затрагиваются.

## Результат

Канонические project/participant/binding/recovery declarations вынесены в отдельный `@ouro/protocol/http` type subpath; runtime namespace пустой. Это HTTP type surface, не новые MCP tools, schema coverage или изменение protocol version. `CollaborativeDraft` и summary принадлежат чистому collaboration, сохраняя разрешённый type-only импорт `RevisionContent` из Core. Прежние server type exports сохранены именованными re-exports; UI использует те же декларации. Дубли `WorkspaceBinding`/`WorkspaceIdentity` в server helpers удалены. Pure platform union равна установленной `NodeJS.Platform`, что отдельно контролируется серверной компиляцией.

После нормализации только Git EOL и стирания TypeScript/comments исполняемый output всех11 затронутых TS/TSX файлов совпал с исходным. Первая частная проверка сравнивала raw CRLF/LF в многострочных SQL templates; исправлена область сравнения, production SQL не менялся. Это проверка type-only границы, не product RED.

Node24.19.0:

- Root/web/service strict types и production Vite build — PASS. Существующее предупреждение ~580kB initial chunk не скрыто и не ослаблено.
- Architecture **838 files / 0 violations / 11 exact legacy framework edges**. Удалены ровно5 server-type исключений; существующие отрицательные fixtures по-прежнему запрещают такие импорты.
- Шесть затронутых regression/guard файлов: **54/54 PASS**, включая права/last Owner, revocation, CRDT и workspace binding recovery HTTP/files.
- Independent protocol installation/package smoke — **PASS (47.9s)**. Реальный tarball проверен через `/http` в ESM/CJS, TypeScript `.ts/.cts` и без Node/React types; dependency tree по-прежнему только protocol/zod.
- Protocol **71 schemas verified**, historical HTTP **47routes/59methods**, styles finite gate и conventions — PASS. `protocol:check` сначала обнаружил CRLF после собственного restore generated files; после обычного build→check PASS, нормализованное содержимое схем осталось исходным. Собственные EOL-only generated changes убраны перед commit.
- Независимое read-only source review: существенных ошибок нет; предложенный packaging smoke добавлен и реально выполнен. Linux/PG/full browser CI_PENDING, final Next removal/physical hFSD/SSO/native/production acceptance не заявлены.
