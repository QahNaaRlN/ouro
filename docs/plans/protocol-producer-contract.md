# Журнал protocol producer contract

Дата: 2026-11-05. Ветка `codex/protocol-producer-contract`; exact base `b957bc95926543e79b4d45f3723f052eaaa04f62`. [SDD](../specs/protocol-producer-contract.md) записан и добавлен в Git index до нового test definition.

| Участок | Статус |
|---|---|
| Граница и ownership proposal | Принята root, согласована с CCLI owner |
| SDD/journal | PREPARED_FIRST |
| Один новый PPC01 test | PREPARED, builtin-only .mjs |
| Pure/Git-blob RED | ACTUAL_RED:1FAIL, CONSUMER_SOURCE_INVALID,2.68s |
| Shared production source / release inputs | NOT_STARTED |
| Install/build/SQL/browser | NOT_RUN / не входят в разрешённый текущий этап |

## Порядок

1. Создать отдельную worktree от указанного base; записать tracked SDD/journal. Frozen D08 и отложенный D10 не менять.
2. Добавить только tests/protocol-producer-contract.test.mjs. Тест использует Node builtins и существующий reader; копирует real canonical protocol blobs из frozen commit в собственный Git-fixture, перемещая только lock в новый namespace и создавая hash metadata.
3. Передать root definition и запросить выделенное pure/Git-blob окно. Actual RED должен дойти до старого reader и показать CONSUMER_SOURCE_INVALID при валидном новом committed input; setup failure не повышается до RED.
4. Сохранить точный вывод/exit status в ignored evidence и journal, без production fix. Дождаться collector handoff CCLI и root peer.
5. Отдельным разрешённым следующим шагом добавить pure contract, finite source harvest и scratch integration; получить negatives/GREEN и необходимые artifact tests без изменения protocol semantics.
6. Только после обоих producer contracts переключать developer workspace. Form/Turbo/новый resolver сюда не входят.

## Фактическая подготовка

Base отсутствовал в object DB; выполнен только разрешённый git fetch exact SHA, затем создана worktree D:/PersonalProjects/ouro-worktrees/protocol-producer-contract. Actual AGENTS прочитан; Next APIs в этом builtin/Git test не используются. Сверены существующий reader и source CI: исходный guard всё ещё требует packages/protocol/package-lock.json; source job получает полную историю. Canonical protocol tree содержит101tracked files, включая старый lock.

До выдачи окна новый test не запускается. Shared committed-source/materialize-build-tree/fixture helper, package files и общие templates не редактировались. Source reader и будущий helper не обязаны угадывать package manager по окружению: композиция использует явную npm-задачу, как принято root.

## Фактический bounded RED

Root выдал отдельное короткое окно только builtin Node/Git. Выполнен `node --test tests/protocol-producer-contract.test.mjs` собственным Node24.19.0 с process-local PATH. Никаких ci/install/compiler/store/SDK/SQL/browser/application builds. Первый run1FAIL2.54s достиг old guard; затем к новому тесту добавлена безопасная input diagnostic, final repeat1FAIL2.68s с тем же code/stack. Это не ослабление assertions и не новый production change.

Перед вызовом reader доказано: frozen base b957,100canonical protocol files, product/protocol manifests без изменения bytes, development protocol lock отсутствует в самом fixture Git commit; новый release lock byte-equal прежнему. Registry entries реальные: TypeScript5.9.3 и Zod4.6.7. Metadata diagnostic:

- manifestSha256: `9dbd31132e4f3588683d44b2ac59380fc9eb4f65e0ee1ff94b5434304e207707`
- lockfileSha256: `51bb76e4f05d360800dbc98ad9c8498475163f99c410bc1dc00c435e9ce6d4ea`
- registryTupleSha256: `7fb06965e7da62c7bb27ccb1775c2b8300eaaae52139c1055ceab32371d261a8`, entries2

Actual failure: `ConsumerSourceError`, code`CONSUMER_SOURCE_INVALID`, existing `scripts/consumer-delivery/committed-source.mjs:79`, caller PPC01 reader invocation. Все preceding setup/precondition assertions прошли; missing-module/setup failure не выдаётся за RED. Логи/exit JSON сохранены в ignored `.operations/ppc01-old-reader-red-with-inputs.*`; временный fixture удалён только после проверки его resolved temp-root/prefix. Дополнительных фоновых процессов нет.

После RED production source по-прежнему NOT_STARTED. Два новых release input существуют только в test fixture, реальные pins/locks/shared fixture helper не изменены. Source harvest/materializer/negative validation tests ждут CCLI collector handoff и root peer. Никаких commit/push/PR из этого этапа нет.
