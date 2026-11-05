# C1 — три agent CLI до frontend build

Дата: 2026-11-05. Статус: **DESIGN_ACCEPTED / IMPLEMENTATION_IN_PROGRESS / COMMITTED_ARTIFACT_QUALIFICATION_PENDING**. Ветка `codex/consumer-agent-cli`; base epic `6595e2e30e4a3f800e647404c8ac083a1d6892c0` + Conventional dependency merge CGL `88cbba1afa53e775225f7eb57fd5db280527df3c`, resulting `29989b459387836e40bae454869dede998a7ebc8`. Это frozen legacy oracle, а не SHA будущего квалифицированного candidate; actual post-merge candidate фиксируется отдельно в журнале.

Владелец возобновил C0/C1 и разрешил этот ограниченный срез. Основание: D05/D06/D13–D15 и completion plan C1. [Журнал](../plans/consumer-agent-cli.md). Остальной40-command inventory остаётся в предыдущем read-only draft; это не реализация всех CLI/hosted/protocol/source-ZIP contracts.

## Результат и граница

Сохранить `agent:config`, `agent:check`, manual `mcp` и stable direct bridge/check paths без требования локальной frontend/service build. Выданные сервером configs всегда используют explicit serving generation. Изменённый explicit selector не может fallback на manual supplement. Никакого нового launcher/GC/process framework, общего RPC executor, изменения домена/HTTP/MCP/SQL или frontend/CSS.

Original source: `scripts/agent-config.ts`, `scripts/check-agent.mjs`, `packages/mcp/bin/ouro-mcp.mjs`; canonical pure config renderer — `lib/agent-client-config.ts`. Все3 main responsibilities остаются в одном каноническом source каждый; source entry, supplement и generation entry вызывают их, без второй реализации validation/credentials/transport.

## Frozen observable contracts

- Config:4profiles, full projectId key, wrapper JSON и Claude Code-only `--entry`, two-space formatting/newline, strict duplicate/unknown checks, абсолютные Windows/POSIX/UNC пути. Нет чтения key file/settings write/network. Root/stdio args передаются доверенной composition: bundled `process.argv[1]` не вычисляет installed root.
- Check: installed SDK initialize/listTools/get_context/close; exact success JSON и safe failure stderr/exit. URL/project/HTTPS guards и token/file mutual exclusion сохраняются. Никакого implicit REC/env-file discovery. Relative token file — от настоящего process.cwd; npm сохраняет собственную package cwd semantics, direct Node — caller cwd.
- MCP: stdout только protocol; help в stderr; URL/credential/project guards и resource/tool forwarding сохраняются. Product version имеет trusted DI для нового bundle layout, исходный source entry сохраняет default lookup. Manual remote/server access не требует local app/DB.
- Consumer outer wrappers: Node24/min24.19 gate до resource reads/dependency imports. Only finite tool names/paths. No shell/NODE_OPTIONS/NODE_PATH hooks. Default manual supplement generation-neutral; explicit selector — только exact admitted BUILT, no fallback on invalid/missing/tampered entry. ServingA/buildB never changes issuedA.
- Logs/reports/configs не получают credential values, raw env или child stderr. Token-file path остаётся допустимым config input. URI с credentials отказывается. Existing UNKNOWN/retry/authority contracts не меняются.

## Ограниченный dependency/build подход для review

Same-commit producer создаёт3 self-contained Node ESM tool bundles (`agent-config`, `agent-check`, `mcp-bridge`) в own unique scratch, с текущим exact consumer npm graph/lock и qualified esbuild. Scratch находится вне envelope и не является shipped install tree. Blueprint/source не устанавливается и не изменяется.

Только конечные source/generated inputs копируются в fresh scratch; `npm ci --include=dev` выполняется там. Producer не использует checkout/node_modules/junction как fallback и не меняет dependency versions. В envelope попадают reviewed tool bytes +finite input/output hashes/provenance, не node_modules. Существующий `npm run launch` продолжает ci+fresh whole app build. Generation build создаёт те же canonical3 entries и включает их в existing artifact hashes. Missing tool в older BUILT означает explicit unavailable только для tool operation; requiredArtifacts не расширяется так, чтобы сломать unrelated older start/MCP records.

Compiler/bundle closure требуется квалифицировать: предположение self-contained не заменяет actual independent run. Чистый config bundle не должен тянуть SDK/DB/Next. SDK check/bridge могут bundle свои JS deps, Node builtins остаются стандартными. Для различия roots/version/stdio argv используется typed trusted DI, не env/request injection.

### Frozen supplement descriptor и admission

- В `consumer-envelope.json` добавляется immutable `agentTools`: `{schemaVersion:1,sourceCommit,productVersion,protocolVersion,inputDigest,tools:[{id,path,sha256}]}`. Точный набор — `agent-config → resources/cli/agent-config.mjs`, `agent-check → resources/cli/agent-check.mjs`, `mcp-bridge → resources/cli/mcp-bridge.mjs`. Extra/missing/duplicate IDs/paths, неизвестные schema fields, invalid hash/version/commit binding отвергаются. Wrapper выбирает path/export из собственного fixed map, не исполняет descriptor path.
- Hash связывает **весь exact3 bundle set** с одним descriptor и теми же source/product/protocol identities envelope. До manual import проверяются regular non-symlink files и все3 SHA256; descriptor вместе с artifact является доверенным локальным release input, не внешней криптографической аттестацией. Изменение bundle без hash update — отказ; изменение всего envelope злоумышленником не выдаётся за предотвращённое remote threat.
- Compile recipe — same-commit `release/consumer/build-agent-tools.mjs.template`, finite delivery input. Scratch получает ready blueprint/lock/vendor и exact `agentToolFiles`; actual compiler realpath проверяется внутри scratch до import, actual metafile input realpaths остаются внутри, nonbuiltin external imports запрещены. Скопированные source/recipe bytes проверяются после ci и повторно после compiler до admission outputs. Input digest включает actual source/generated/dependency inputs и recipe. Producer stage остаётся вне envelope. Ни готовый blueprint, ни existing generation не используются как writable install stage.
- Shipped supplement, descriptor и canonical CLI infrastructure inputs immutable: два scripts main, MCP main, `lib/agent-client-config.ts`, его unicode/project-identity leaf public API и `apps/service/scripts/build.mjs`; не весь Core/engine. PROJECT_ID сохраняет исходное значение и engine public export. Editable UI/domain source сохраняет текущий snapshot contract: свежая сборка может создать изменённые generation artifacts, но не переписывает shipped manual supplement автоматически. Изменение собственных CLI/dep/recipe требует нового producer artifact; consumer не является произвольной plugin/build системой.
- Selector разбирается один раз stable wrapper: optional ведущий `--generation ID`, bounded exact ID, duplicate/invalid selector отказ. Reserved `--generation=...` отказывается в любой позиции, остальные прежние unknown args не переопределяются. При explicit selection используются только existing BUILT integrity и fixed generation entry; missing/tampered record/entry — отказ **без чтения/import manual supplement**. При no-selector manual mode не читает pointer/records и не выводит active generation. Поэтому stale/tampered last-built не меняет manual remote authority. Existing pinned generations не становятся невалидными из-за отсутствия нового supplement.
- Trusted DI имеет только fixed role-specific поля: config получает `argv`, `stdioCommand=process.execPath`, `stdioArgs=[outer stable MCP path,...explicit selector]`; bridge получает actual selected product version; checker получает original process environment. Root вычисляет outer entry от import.meta.url. Эти поля не становятся новыми CLI flags/request fields; никакого chdir/REC discovery/credential inference. stdout/stderr по-прежнему владеет соответствующий canonical main.
- Потребитель выбирает3 fixed callable exports (`runAgentConfig`, `runAgentCheck`, `runMcpBridge`). Существующий pinned MCP auto-entry compatibility сохраняется без двойного main invocation; older pinned raw bridge продолжает работать через прежний entry contract.

Protocol npm producer decoupling — отдельный ближайший prerequisite перед pnpm: текущий source producer требует developer `packages/protocol/package-lock.json`. Эта история не удаляет dev locks и не переносит protocol metadata; portable protocol Node>=20.9 contract сохраняется.

## Characterization → actual RED → implementation

1. Подготовить собственные exact-version SDK inputs, без frontend/service dist и BUILT. Source3CLI запускаются по-настоящему против isolated HTTP/MCP fixture; сохранить наблюдения stdout/stderr/exit/requests и privacy sentinel checks. Отсутствующий dependency/invalid fixture — setup failure, не RED.
2. На materialized consumer без frontend build те же valid commands должны работать. Current missing2scripts и MCP `readBuiltGeneration` prerequisite дают contract failure; primary RED обязан быть actual valid MCP connection baseline success → consumer refused before build, без ERR_MODULE_NOT_FOUND.
3. Послать root RED evidence и dependency/bundle boundary для review **до изменения product behavior**. Затем только canonical mains/fixed bundle/finite wrapper implementation.
4. Проверки: positive3CLI; format/flags; relative key file/foreign Unicode cwd; wrong project/revoked/no token/ambiguous token/remote HTTP refusal; no secret logs; no SQL/profile/app build; explicit invalid/missing/tampered gen no manual fallback; servingA/pointerB issuedA; actual unsupported Node23 early admission.
5. Independent producer/tool artifact qualification без source install fallback и existing source CLI regressions. Root strict/types/architecture/conventions и affected runtime tests после настоящих changes. Полный CGL qualifier повторно не запускается ради этого среза без нового input/risk и отдельного окна.

Дополнительные обязательные axes от peer: no-application assertion принимает только ENOENT (EACCES/EPERM являются setup FAIL); direct consumer `scripts/check-agent.mjs` с caller-relative token file; valid-but-missing и tampered explicit selection при исправном manual bundle; существующие servingA/pointerB fixtures переиспользуются без новой process framework.

## Не включено

`db:check`, `run-verification`, hosted/bootstrap/backup/restore, standalone protocol producer, pnpm workspace, полный source archive, Next removal, actual Meridian/native/SSO, production cutover — отдельные finite owners C1/C5/C6. Local Windows HTML672/1161 FAIL и Linux qualification имеют прежнюю область; новый CLI результат их не переименовывает.
