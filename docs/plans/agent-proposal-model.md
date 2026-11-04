# Журнал · read model агентских предложений

Дата: 2026-11-05. Статус: LOCAL_QUALIFIED / CI_PENDING. [SDD](../specs/agent-proposal-model.md).

До source правки зафиксированы два UI callers и existing scope test, server consumers0. На parent4b234e5 существующие2теста PASS; затем включён reviewed Tailwind preview76c8f63. Он не менял selector/test, а удалил оставшиеся static style props отдельным срезом. Final source move принадлежит только этой истории и должен интегрироваться после PR67.

Перенесён один чистый модуль в `entities/agent-proposal/model`, добавлен root named public API. В модели изменён только Core type import на public API и RU JSDoc. Два production callers и существующий test используют entity public index. Старый lib файл удалён, compatibility proxy не создан. UI source, scope semantics, callbacks, styles и данные не переписывались.

После переноса existing2/2 scope tests PASS: совместный project/spec/revision/attempt фильтр, все review states и порядок сохранены; foreign/unknown explicit IDs не подменяются, snapshot не мутирует. Полные normalized AST четырёх модулей (helper, оба UI consumers и test) совпали при исключении только imports/comments/CRLF. Новый index — только selector и scope type, без executable logic.

Root/web strict types PASS; architecture885/0violations/11existing legacy edges, historical47routes/59methods и style2CSS/112rules/3inline6/0 PASS. Ledger/locks/technical policies не менялись. Generated protocol output восстановлен только после semantic-zero proof. Активных imports старого пути в production0; новые exceptions/guard weakening не добавлены. Bounded read-only peer producer owner: blockers0, auth/command/query ownership не расширено.

Новые тесты физического размещения или копия алгоритма фильтра не добавлялись. Новая browser/Next/Vite квалификация этой history не запускалась: это type/import-only перенос с точным сохранением module bodies; соответствующие whole-tree builds/browser/source-package checks обязательны в полном CI. Локальные тяжёлые проверки других историй выполняются по выделенным окнам, не вместо CI.

Перенос одной entity read model не завершает физическую UI hFSD-миграцию, семантические host ports или native Meridian. Реальные профили, production и исходная dirty main worktree не затронуты. Push/PR/merge ещё не заявлены.
