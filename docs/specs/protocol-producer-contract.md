# Независимый npm-контракт protocol producer

Дата: 2026-11-05. Статус: **ACTUAL_READER_RED_CONFIRMED / PRODUCTION_NOT_STARTED / GREEN_PENDING_HANDOFF**. Ветка `codex/protocol-producer-contract`, база `b957bc95926543e79b4d45f3723f052eaaa04f62`. Эта история предшествует переключению четырёх development graphs на pnpm; Form остаётся отложенным C2. Новый planning framework не вводится.

## Минимальная граница

Canonical protocol source и `packages/protocol/package.json` читаются из одного immutable commit. Независимый producer получает два дополнительных committed input:

- `release/protocol-producer/package-lock.json` — точные прежние bytes development protocol lock, с нынешними TypeScript5.9.3 и Zod4.6.7; без resolver/update и placeholders.
- `release/protocol-producer/metadata.json` — `schemaVersion:1`, LF-canonical `manifestSha256`, `lockfileSha256`, `registryTupleSha256`, `registryPackageEntries`. Второй package manifest и self-referential sourceCommit не нужны.

В source inventory добавляется конечный `protocolProducerFiles`; development `packages/protocol/package-lock.json` перестаёт быть обязательным и не копируется как producer input. Полный Git path/mode/private audit сохраняется. Новые inputs и canonical source берутся из того же выбранного commit, без dirty checkout fallback.

Будущий pure API `materializeProtocolProducerDependencies({manifest,lockfile,metadata}):{lockfile}` принимает строки и проверяет hashes, identity/version, lock root dependency/devDependency contract и registry-only package entries без links/file/git resolutions. Validation завершается до FS/install effects. Existing materializeConsumerBuildTree копирует source и проверенный lock в собственный scratch, затем использует прежние npm ci/build/portable pack. Его public options/return не меняются. Canonical ESM/CJS/bin/modes и runtime protocol contract сохраняются.

Manager выбирается конечной npm-задачей на поддерживаемом Node24. pnpm development graph может вызывать такую отдельную npm-задачу; `pnpm.cjs` не передаётся как npmCli. Универсальный npm/PATH resolver не добавляется.

## Владение и текущий предел

Producer CCLI владеет materialize-envelope, CLI supplement/helper и своим agentToolFiles collector. После его handoff этот срез получает materialize-build-tree, новый pure contract и независимое finite protocolProducerFiles дополнение committed-source/types. Envelope уже передаёт `ref:source.commit`; повторное исправление не требуется.

Сейчас разрешены только этот SDD/journal и **один новый builtin-only test**. Shared production files, общий fixture helper, release inputs в основном дереве, manifests/locks, installs и builds не меняются. Два release inputs существуют пока только как данные собственного Git-fixture теста. Production implementation начнётся лишь после CCLI collector handoff и root peer.

## Первый meaningful RED

PPC01 создаёт собственный реальный Git commit: canonical protocol source из exact base, прежний точный lock помещён в новый release namespace, metadata hashes вычислены по этим bytes; development protocol lock отсутствует. Преусловия проверяют настоящие manifest/lock identity и версии, наличие canonical source и отсутствие старого lock. Source reader должен принять commit и вернуть оба новых input с его Git blob/SHA256.

На текущем implementation ожидается **test failure CONSUMER_SOURCE_INVALID** из старого обязательного development-lock guard. Отсутствующий модуль, недоступный Git/base commit или неверный fixture не считается product RED. В тесте используется frozen base commit, доступный в source CI с fetch-depth0; source/privacy code не исполняется из fixture. Npm, SDK, SQL и browser не нужны.

В отдельно разрешённом root коротком окне actual PPC01 достиг именно этого guard: **1FAIL,0PASS, CONSUMER_SOURCE_INVALID**,2.68s. Предварительно прошли fixture identity/hash/source assertions;100canonical protocol files и оба новых release input находятся в реальном собственном commit, старый lock отсутствует. Это подтверждённый RED, без production fix или GREEN; точные hashes и ограничения записаны в [журнале](../plans/protocol-producer-contract.md).

Проверки отсутствующих inputs, mismatch hashes/manifest, links/foreign URLs даже после пересчёта hashes, dirty fallback и actual scratch install/pack остаются следующим шагом после handoff. Их PASS сейчас не заявляется. Позднее builtin test должен получить явный CI/task entry: нынешний tests/*.test.ts glob файл .mjs не подхватывает.
