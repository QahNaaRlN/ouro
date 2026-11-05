# Журнал protocol producer contract

Дата: 2026-11-05. Ветка `codex/protocol-producer-contract`; exact base `b957bc95926543e79b4d45f3723f052eaaa04f62`. [SDD](../specs/protocol-producer-contract.md) записан и добавлен в Git index до нового test definition.

| Участок | Статус |
|---|---|
| Граница и ownership proposal | Принята root, согласована с CCLI owner |
| SDD/journal | PREPARED_FIRST |
| Один новый PPC01 test | PREPARED, builtin-only .mjs |
| Pure/Git-blob RED | ACTUAL_RED:1FAIL, CONSUMER_SOURCE_INVALID,2.68s |
| Pure helper / два release inputs | IMPLEMENTED_LOCAL,9/9pure validation PASS |
| Shared collector/materializer/fixture helper | COMMITTED, bounded root/F peer PASS; A3 test-only closure repair |
| Reader + pure integration | ACTUAL_GREEN,22/22PASS25.87s |
| Actual materialization CMT01/02/03 | 3/3PASS на14da; CMT03 repeat1/1PASS на471e |
| Standalone protocol package | 1/1PASS на14da, JS/types/schema/CLI/tar modes |
| Root strict / affected guards | PASS на471e, scoped evidence ниже |
| Adapted oracle | CCA01PASS наA3; CCA02/03PASS на471e, прежний fixture failure сохранён |
| Published-head combined CI | PENDING; root monitoring |
| SQL/browser/full app/full CGL | NOT_RUN в этом срезе |

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

## Разрешение следующего изолированного pure этапа

Root принял actual RED и разрешил commit трёх SPEC/RED files: **b8412250b9fd16862bdfecd226cebd58d6410e35**. Затем разрешены только новые pure contract/.d.mts, два release input и focused builtin validation tests; этот scope внесён в SDD до исходников. Shared files остаются у CCLI owner. Новые pure runs допустимы, но ci/build/store/npm/real pack/materialization запрещены до отдельного окна.

План этого этапа: exact Git lock bytes → metadata hashes, pure semantic/scalar/registry admission → focused positives/negatives (включая recomputed hashes), затем root peer/source freeze. PPC01 integration GREEN намеренно не объявляется до handoff. Других историй/переключения pnpm/Form здесь нет.

## Pure source и проверки

SDD расширен до исходников. Добавлены только protocol-producer-contract.mjs/.d.mts, новый PPV builtin test и два release input. Lock скопирован из exact b957 Git blob без resolver; отдельная byte comparison PASS,1281bytes. Metadata hashes совпадают с PPC01 real fixture: manifest9dbd3113…, lock51bb76e4…, tuples7fb06965…,2registry entries. TS5.9.3/Zod4.6.7 и portable package manifest не менялись.

Pure helper проверяет конечные metadata scalars/hashes, manifest/root literal contracts, direct package presence, безопасные package paths, canonical registry tarball identity, version/scalar/full sha512, отсутствие links/non-registry declarations и выбранные boolean flags. Единственная path normalization — один ведущий ./ у bin. Возвращается проверенный LF lock text; FS/process/env operations и npm/PATH resolver отсутствуют.

`node --test tests/protocol-producer-validation.test.mjs`: **7PASS,0FAIL,233.8ms**. Группы: real exact graph, CRLF, bin normalization/escape negatives, malformed scalars/hash inputs, rehashed identity/declaration mismatch, rehashed registry URL/integrity/link attacks, malformed/escaping/missing direct entries. Neutral diagnostic остаётся фиксированным даже при SECRET markers. Negative semantic cases повторно вычисляют hashes и доходят до structural admission; это не только hash mismatch tests. Тесты нового API написаны в данном pure этапе; missing-module failure не объявлялся RED-first evidence.

PPC01 последний actual result остаётся прежним RED2.68s; shared reader не изменён. Install/build/compiler/store/SDK/SQL/browser/real pack не запускались. `.d.mts` ещё не прошёл compiler, source-global guards не запускались в heavy lease. Git diff check PASS; package files/shared collector/types/materializer/fixture helper diff отсутствует. Передано root на bounded peer; дальнейший commit/integration ждёт указания/handoff.

## Peer fix: Windows aliases и обязательное test wiring

Root/F приняли остальной pure helper и нашли material gap Windows aliases. Сначала добавлены два focused rehashed negative axes: PPV08 bin/CON и PPV09 node_modules/con оба дали **Missing expected exception,2FAIL172.5ms**. Это actual semantic RED, не mismatch hashes. Затем добавлен только private finite segment predicate reserved devices/trailing dot/space, совпадающий с existing committed-source.unsafePath; общий audit не менялся, framework/resolver не создавался.

После fix **PPV01–09,9PASS0FAIL202.5ms**. Покрываются также trailing-dot/space внутри bin path, reserved bin command и scoped package segments. Старые tuple/input positives сохраняются, release lock остаётся теми же1281bytes. Evidence: `.operations/ppv-windows-alias-{red,green}.log`.

Root отдельно передал только package.json:test script этому срезу. Добавлены ровно tests/protocol-producer-contract.test.mjs и tests/protocol-producer-validation.test.mjs к existing tests/*.test.ts, без broad *.test.mjs, нового runner или dependency/lock edits. SDD scope записан до script change. Полный npm test не запускался: сейчас он намеренно увидит PPC01 RED, пока shared integration не реализована. Conventions и diff check PASS; общая compiler/integration остаётся до collector handoff. Push/PR запрещены до полной integration qualification.

## Изолированная declaration проверка и pure freeze

Root отдельно разрешил только tiny declaration check. Фактически выполнен TypeScript5.9.3 на собственном Node24.19.0: **0diagnostics,0unexpected files**, types:[], strict/noEmit, standard ES2022 libraries. Non-library graph содержит ровно новый protocol-producer-contract.d.mts и виртуальный caller; Node/UI/project ambient files не загружались. Четыре @ts-expect-error проверили обязательный metadata input, textual lockfile, отсутствие неподдерживаемого output.manifest и readonly diagnostic code. Caller существовал только в памяти. Evidence: `.operations/protocol-producer-declaration-check.json`.

Этот gate завершён после actual Windows2RED→9pureGREEN и не является project/integration typecheck. Root разрешил pure commit после него; dependency tuples/release lock1281bytes и shared source не менялись. Повторных pure/full checks не запускалось. PPC01 integration всё ещё RED до handoff, реальные scratch/npm/pack и общая CI qualification остаются pending.

## Shared handoff и план интеграции

Pure unit commit `068a96e8f18e668a07a3a5a1f7ffb5a1669ca247`. Root передал frozen CCLI A `ff16750d2d7dc3839eff86a37c99d019ec82555b`; clean Conventional merge — `cbcc5fef40979ec3dcbcb6ea1ca308f6a70e333c`. Envelope уже pinning source.commit; его не переписываем. API agentToolFiles exact2 и CCLI supplement сохранены. Ни npm, ни SDK/build/pack с этой ветки не запускались.

До shared edits записаны конечные изменения: обязательные protocolProducerFiles в collector/type; exclusion development lock при полном audit; pure preflight до output/scratch FS; проверенный scratch lock и manifest protocol.producerInputs. Shared fixture и existing reader/package/materialization tests получают только эти inputs/assertions. Test-only frozen29989 oracle использует конечный безопасный Git batch вместо нового reader, API и actual commands остаются прежними. Root/CCLI owner согласовали эту адаптацию; production compatibility branch не допускается.

Следующая проверка — PPC01 actual reader GREEN и finite missing-input/dirty-fallback negatives, PPV regression, reader-only tests; разрешены только builtins/Git. Real npm ci, protocol pack, adapted legacy SDK helper, CMT01 и project types остаются NOT_RUN до отдельного окна. Исторический old-reader RED и CCLI A12PASS не переименовываются в qualification нового integration head.

## Actual лёгкая integration qualification

Shared implementation выполнена после scope/handoff записи. Новое required поле protocolProducerFiles exact2; protocolFiles больше не включает development lock, полный tree audit не ослаблен. Materializer вызывает pure admission до mkdir и передаёт checked lock только own scratch; delivery-manifest.protocol.producerInputs содержит исходные blob/mode/SHA256. Tests фиксируют finite namespace, immutable provenance и отсутствие fallback к old lock/dirty replacement. Shared committed fixture и fake typed source literal обновлены; standalone pack test получает validated independent lock. Frozen oracle копирует только29989 через один ls-tree/batched cat-file; API/SDK commands сохранены.

Первый обычный запуск pure/reader suite получил9purePASS и13setupFAIL: Git не смог создать .git/config в managed temp из-за разрешений. Этот вывод сохранён в `.operations/protocol-integration-pure-reader.log`, не объявлен product RED. После разрешённого запуска с Git metadata доступом **22PASS0FAIL25.87s**: CSD12cases, PPC01 и PPV9. PPC01 **2.17s GREEN**, fixture canonicalProtocolFiles100, development lock absent, те же1281lockbytes/tuples/hashes, что originalRED. Missing-input case проверяет оба обязательных paths при старом lock и dirty replacement. Evidence: `.operations/protocol-integration-pure-reader-authorized.log`.

Отдельный builtin/Git `--test-name-pattern CMT03` — **1PASS0FAIL4.79s**. Commit содержит invalid metadata; output и отдельный scratch не созданы, own npm-witness не запущен. Npm/install/real pack/SDK/compiler/browser не выполнялись; skipped-name cases не считаются qualification CMT01/02. Evidence: `.operations/protocol-preflight-no-effects.log`. Прежний CCLI A12PASS относится к frozen A/old helper; новый oracle требует своего следующего run.

Source передан root на bounded peer до commit. Heavy processes отсутствуют. Следующее окно: actual CMT01/02 и standalone pack, adapted SDK fixture, affected source/type/guard checks; full consumer/CI ownership остаётся у root. Dependency tuples и portable manifest не менялись.

Root/F bounded source peer: **PASS, material blockers отсутствуют**. Root выдал exclusive local heavy lease и разрешил source commit A до квалификации, затем evidence-only B. Граница no-effects доказана только для `materializeConsumerBuildTree`: внешний envelope по прежнему создаёт свой root и в этот claim не входит. План окна — CMT01/02/03, standalone protocol package, root strict types и affected guards, ровно три source/oracle CLI scenarios; один install/build process за раз. Source A не получает заранее artifact/SDK PASS, package tuples/deadlines не меняются.

Source A — `14da267` (finite11files). Exact root npm ci завершён без lock edits,214platform packages. На этом A actual CMT01/02/03 **3/3PASS33.99s**, standalone package JS/ESM/CJS/types/schema/CLI/tar modes **1/1PASS31.25s**. Root strict после normal protocol build71schemas нашёл единственный TS2769 в новом CMT03: synthetic Git env не содержит обязательное Next-augmented NODE_ENV. Это test typing failure, не protocol runtime RED. Узкая source correction A2 добавляет explicit typed NODE_ENV:'test' только Git fixture; production source/tuple/limits unchanged. Strict и CMT03 повторяются после correction; предыдущие A evidence сохраняются отдельно, общая qualification пока pending.

## Source freeze, artifact proof и ограниченный oracle repair

Полные source ids: A `14da267387639fa9efc156701f79e8f0589b7c03`, A2 `58febaaff8e983a6b3cae2327c194a9d2cbc29a8`, normal merge принятого CLI epic b92 — `471e9b2d6716cf0069a93c4fe9c621201dcb5eb8`. Merge изменил только CLI evidence docs; production input bytes прежние. Root strict после A2 **PASS**, CMT03 repeat **1/1PASS6.35s**. Conventions PASS; architecture после установки exact web lock **931files/0violations/11legacy edges**; migration **47routes/59methods PASS**; style **2CSS/3inline/0violations**. Первый architecture run без web install нашёл4unresolved TanStack Router imports — setup failure, без изменения policy. Root/web locks не менялись. Normalized protocol generated diff=0 проверен; только свои EOL/stat следы сборки возвращены к HEAD, source freeze чистый.

На471e existing selected CCA01–03 с обычным beforehook дали **2PASS1FAIL320.97s**. Current committed envelope setup завершён, CCA02 original checker и CCA03 original MCP bridge прошли настоящий SDK transport. CCA01 original config завершился MODULE_NOT_FOUND ../../meridian/src/context из frozen29989 core/engine. Это **test fixture closure defect**, не product/domain RED и не успешная qualification всех трёх. Evidence `.operations/protocol-legacy-cli-three-scenarios.log`; own fixture сохранён как C:/Users/krmif/AppData/Local/Temp/ouro-agent-cli-deAKWd. Afterhook закрыл HTTP/SDK; исходные test/npm/esbuild PIDs42604/55112/58472 затем подтверждены отсутствующими.

Root принял один bounded repair cycle. До source A3 сверены frozen imports: engine/meridian-import/types выходят из core только к Meridian context; context импортирует @ouro/protocol, theme импортирует context. В copier добавляются ровно original context.ts/theme.ts, исходный collector выбирал те же exact paths. Команды/API/дедлайны и production files не меняются. Следующий проверяемый сценарий только CCA01 через existing setup; CCA02/03 PASS остаются приписанными471e. На время static fix/commit heavy lease передан pnpm owner; новых own install/build/type/test процессов нет. Новый CCA01 ожидает его прямого handback.

## Итоговая локальная qualification и evidence-only B

A3 `a82f29a67354bea7db2e24ad8d6b9e90af220d64` — чистый immutable test-only repair: две original exact Meridian paths в copier плюс scope/failure docs. После явного handback heavy lease выполнен **только CCA01**, прежний setup/SDK assertions/deadlines сохранены. Actual result **1PASS0FAIL161.73s**, candidate committed input точно A3. CCA01 проверяет четыре client profiles, Claude entry JSON/format/argv/key-path/privacy и отсутствие app build до/после. Current own envelope setup также завершён наA3. Evidence `.operations/protocol-legacy-config-corrected.log`, retained own fixture C:/Users/krmif/AppData/Local/Temp/ouro-agent-cli-hX8Qb3. Никаких новых production code/dependency/tuple changes после471e; A3 добавляет только тестовый frozen closure.

| Проверка | Фактические inputs / результат |
|---|---|
| Meaningful initial PPC01 | Old reader навалидном own committed fixture: CONSUMER_SOURCE_INVALID,1FAIL; сохранён |
| PPC01 + CSD12 + PPV9 | Local integration bytes затем зафиксированы вA14da:22/22PASS25.87s |
| CMT01/02/03, actual npm/pack/provenance/scratch | A14da:3/3PASS33.99s |
| Standalone protocol package | A14da:1/1PASS31.25s; ESM/CJS/types/schemas/CLI/modes/runtime deps |
| Root strict | 471e послеtest-env A2:PASS; earlier TS2769 сохранён как test typing failure |
| Conventions/architecture/migration/style | 471e:PASS;931/0/11,47routes/59methods,2CSS/3inline/0violations |
| CMT03 repeat послеtest-env fix | 471e:1/1PASS6.35s; no-effects только build-tree boundary |
| CCA01–03 initial adapted oracle | 471e:2PASS1fixtureFAIL320.97s; CCA02/03 actual SDK PASS, MODULE_NOT_FOUND не product RED |
| CCA01 corrected oracle | A3:1/1PASS161.73s, only selected affected scenario |

Результаты не выдаются за один новый exact-head full suite: CMT/pack остались наA, strict/guards/CCA02/03 на471e, correctedCCA01 наA3; содержание production code между ними сохранено. Полный local npm test/full SDK12/full CGL/app builds/SQL/browser здесь не повторялись. Root/web exact dependency installs служили необходимой подготовкой, lock/manifests tuples не менялись. Исходный portable Node>=20.9.0 contract и producer Node24 разделены как прежде.

Run48342 завершён exit0, afterhook закрыл собственные HTTP/SDK servers; нового own install/build/type/test процесса не осталось. Heavy lease возвращён root до записи B. Этот итоговый коммит B меняет только два documentation files, source A3 остаётся reference для corrected oracle. Разрешены push и PR в codex/react-vite-epic отbaseb92; combined exact published-head CI остаётся PENDING и отслеживается root. Owner acceptance/native/production release не заявляются.
