# Независимый npm-контракт protocol producer

Дата: 2026-11-05. Статус: **PURE_CONTRACT_IMPLEMENTED_LOCAL / SHARED_INTEGRATION_NOT_STARTED / PPC01_RED_PENDING_HANDOFF**. Ветка `codex/protocol-producer-contract`, база `b957bc95926543e79b4d45f3723f052eaaa04f62`. Эта история предшествует переключению четырёх development graphs на pnpm; Form остаётся отложенным C2. Новый planning framework не вводится.

## Минимальная граница

Canonical protocol source и `packages/protocol/package.json` читаются из одного immutable commit. Независимый producer получает два дополнительных committed input:

- `release/protocol-producer/package-lock.json` — точные прежние bytes development protocol lock, с нынешними TypeScript5.9.3 и Zod4.6.7; без resolver/update и placeholders.
- `release/protocol-producer/metadata.json` — `schemaVersion:1`, LF-canonical `manifestSha256`, `lockfileSha256`, `registryTupleSha256`, `registryPackageEntries`. Второй package manifest и self-referential sourceCommit не нужны.

В source inventory добавляется конечный `protocolProducerFiles`; development `packages/protocol/package-lock.json` перестаёт быть обязательным и не копируется как producer input. Полный Git path/mode/private audit сохраняется. Новые inputs и canonical source берутся из того же выбранного commit, без dirty checkout fallback.

Будущий pure API `materializeProtocolProducerDependencies({manifest,lockfile,metadata}):{lockfile}` принимает строки и проверяет hashes, identity/version, lock root dependency/devDependency contract и registry-only package entries без links/file/git resolutions. Validation завершается до FS/install effects. Existing materializeConsumerBuildTree копирует source и проверенный lock в собственный scratch, затем использует прежние npm ci/build/portable pack. Его public options/return не меняются. Canonical ESM/CJS/bin/modes и runtime protocol contract сохраняются.

Manager выбирается конечной npm-задачей на поддерживаемом Node24. pnpm development graph может вызывать такую отдельную npm-задачу; `pnpm.cjs` не передаётся как npmCli. Универсальный npm/PATH resolver не добавляется.

## Владение и текущий предел

Producer CCLI владеет materialize-envelope, CLI supplement/helper и своим agentToolFiles collector. После его handoff этот срез получает materialize-build-tree, новый pure contract и независимое finite protocolProducerFiles дополнение committed-source/types. Envelope уже передаёт `ref:source.commit`; повторное исправление не требуется.

На первом этапе были разрешены только этот SDD/journal и **один новый builtin-only test**. Shared production files, общий fixture helper, release inputs в основном дереве, manifests/locks, installs и builds тогда не менялись. Два release inputs существовали только как данные собственного Git-fixture теста. Integration implementation по-прежнему ждёт CCLI collector handoff и root peer.

### Следующий разрешённый pure-срез — до CCLI handoff

После принятого PPC01 RED root отдельно разрешил только новые `scripts/consumer-delivery/protocol-producer-contract.{mjs,d.mts}`, два `release/protocol-producer` input и новый builtin-only validation test. Эта запись сделана до этих исходников. Shared collector/types/materializer/fixture helper по-прежнему не меняются. Actual pack/materialization GREEN и соответствующая integration реализация ждут handoff/exclusive окна; PPC01 пока остаётся RED.

Pure helper возвращает только LF-canonical проверенный lock text; ничего не записывает и не запускает. Metadata имеет строго конечные scalar fields; JSON root/manifest/lock identities, literal dependencies/devDependencies, engines/license и bin сравниваются после удаления только одного начального `./` у bin path. Lock package entries обязаны иметь безопасный node_modules path, scalar release version, canonical HTTPS npm registry tarball URL, single canonical sha512 integrity, без link и file/git/workspace declarations. Используемые boolean metadata flags также проверяются по типу. Negative cases пересчитывают hashes, чтобы structural/registry admission проверялся независимо от hash mismatch.

Новый release lock копирует **точные Git bytes** прежнего lock b957, без npm resolution или изменения TypeScript/Zod tuples. Manifest portable identity/Node>=20.9.0 не меняется; producer runtime gate Node24 остаётся у существующего orchestration. В metadata нет qualification PASS или будущего commit SHA. Новых dependencies, PATH/npm resolver, runtime global state и helper side effects нет.

Этот изолированный pure-срез реализован локально: **PPV01–07,7/7PASS233.8ms** на builtin Node24, включая mutations с пересчитанными hashes. Release lock byte-equal прежнему Git blob,1281bytes. Shared integration по-прежнему отсутствует; actual pack/materialization, compiler и install не выполнялись. Pure helper не заменяет npm ci и не является resolver/доказательством исполнимости source.

Root/F peer потребовал тот же конечный Windows segment policy, что существующий source audit: reserved devices и trailing dot/space отклоняются в bin paths/commands и package segments. Два rehashed negative axes сначала дали actual RED, затем после узкого predicate fix **PPV01–09,9/9PASS**. Дополнительно root передал владение только test script корневого package.json: к существующему tests/*.test.ts добавляются ровно два новых .test.mjs path, без широкого glob/нового runner и без dependency changes. Это wiring записано до script edit; compiler/integration по-прежнему ждут collector handoff.

После отдельного tiny grant новая декларация и виртуальный caller прошли strict TS5.9.3/Node24:0diagnostics, четыре type-negative cases, types:[], без Node/UI graph. Это только публичный type contract pure helper; общая project/integration проверка остаётся pending. Root разрешил зафиксировать pure-срез без push; shared integration и PPC01 GREEN не заявляются.

## Первый meaningful RED

PPC01 создаёт собственный реальный Git commit: canonical protocol source из exact base, прежний точный lock помещён в новый release namespace, metadata hashes вычислены по этим bytes; development protocol lock отсутствует. Преусловия проверяют настоящие manifest/lock identity и версии, наличие canonical source и отсутствие старого lock. Source reader должен принять commit и вернуть оба новых input с его Git blob/SHA256.

На текущем implementation ожидается **test failure CONSUMER_SOURCE_INVALID** из старого обязательного development-lock guard. Отсутствующий модуль, недоступный Git/base commit или неверный fixture не считается product RED. В тесте используется frozen base commit, доступный в source CI с fetch-depth0; source/privacy code не исполняется из fixture. Npm, SDK, SQL и browser не нужны.

В отдельно разрешённом root коротком окне actual PPC01 достиг именно этого guard: **1FAIL,0PASS, CONSUMER_SOURCE_INVALID**,2.68s. Предварительно прошли fixture identity/hash/source assertions;100canonical protocol files и оба новых release input находятся в реальном собственном commit, старый lock отсутствует. Это подтверждённый RED, без production fix или GREEN; точные hashes и ограничения записаны в [журнале](../plans/protocol-producer-contract.md).

Pure mismatch/hash/scalar/link/registry negatives проверены отдельно; отсутствующие committed inputs, dirty fallback и actual scratch install/pack остаются integration шагом после handoff. Их PASS сейчас не заявляется. Root test script теперь получает ровно два явных .mjs path рядом с прежним tests/*.test.ts; полный unit command пока не запускался, поскольку PPC01 ещё ожидаемо RED до integration fix.
