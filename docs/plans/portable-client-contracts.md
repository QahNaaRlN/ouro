# Portable client contracts implementation journal

Date: 2026-11-04. Scope: P1.1 only. Status: implementation and scoped local checks PASS; independent review, CI and integration PENDING.

## Plan

1. Fix the bounded contract and acceptance criteria before implementation.
2. Install the unchanged lockfile with exact Node 24.19.0 in this isolated worktree.
3. Demonstrate meaningful Red tests for portable contracts and forbidden dependency/port shapes.
4. Implement pure client contracts, the core/context boundary correction and AST architecture checks.
5. Run targeted Green tests, relevant existing regressions and required type/protocol checks.
6. Record implementation, verification and the remaining P1.2 boundary separately.

## Initial observations

- Branch/worktree: codex/portable-client-contracts at D:/PersonalProjects/ouro-worktrees/portable-client-contracts.
- No dependency installation or test result existed in this worktree at the start.
- Existing snapshot/subscription behavior already has regression tests; its runtime wiring remains unchanged by P1.1.
- Next's installed client/server components and route-handler guides were read from the main checkout before this story; no Next implementation is changed here.
- Accepted source documents reside in the main checkout and are not treated as already implemented code in this branch.

## Verification evidence

- Dependency preparation: exact Node 24.19.0, existing npm lockfile. First npm ci failed with ENOTFOUND registry.npmjs.org; this was an environment failure and is not Red evidence. The approved network retry installed 186 packages successfully. No package version/lockfile was changed.
- Red: exact Node 24.19.0 running node_modules/tsx/dist/cli.mjs --no-wasm-code-gc --test --test-concurrency=1 tests/portable-client-contracts.test.ts tests/architecture-boundaries.test.ts. Result: 17 tests, 4 pass, 13 fail. Assertions failed because the stub checker admitted forbidden alias/relative/type/dynamic/require/package-export and port shapes, and the initial freeze function admitted inconsistent request identity/version. Dependencies and test execution were available.
- Additional meaningful Red cases covered inherited port methods/Response results, pure-to-browser permission promotion (direct and through a barrel), reverse core-to-client dependency, blocked exports falling back to declarations, and an attempted legacy exemption for a new portable source. Each failed its intended assertion before the matching correction; environment failures were not counted.
- Final Green: the same exact-Node command for tests/portable-client-contracts.test.ts and tests/architecture-boundaries.test.ts passed 28/28, with no skips. The fixtures include a browser-safe legacy helper acquiring Node/server imports transitively and a nonliteral dynamic import failing closed.
- Actual tree: exact Node running scripts/check-architecture.mjs passed: 668 files, zero violations, 16 exact historical edges. Eleven are existing Next imports and five existing server DTO type imports, owned by P3/P1.2; no pure package or entire legacy directory is exempted.
- CI: the checks job invokes npm run check:architecture unconditionally after TypeScript. The foundation inventory step will be reconciled by the parent when integrating the two atomic stories.
- TypeScript: exact Node running node_modules/typescript/bin/tsc --noEmit passed after the final source/test corrections.
- Protocol: npm run protocol:build passed, followed by npm run protocol:check (protocol0.3.0; 71 schemas verified). The only protocol source diff is the named export of the existing Unicode validator; versions, generated schemas and MCP tool surface are unchanged. Regeneration made some files appear dirty because of Windows newline/stat conversion. After verifying zero normalized diff, those owned outputs were restored; only src/index.ts remains changed within protocol.
- Portable consumer: npm run protocol:test-package initially failed resolving registry.npmjs.org in the restricted environment; the approved network retry passed 1/1 in 15.46 seconds. It builds an isolated source copy and checks ESM, CJS, TypeScript, schema and CLI consumers without Ouro.
- Existing regressions: exact Node/tsx with --no-wasm-code-gc --test --test-concurrency=1 ran core, project-snapshot, live-review, protocol-workspace, protocol-outputs, protocol-mcp, protocol-flow, protocol-flow-runtime, meridian-theme, meridian-context, meridian-review, meridian-import and meridian-http tests. Result: 79 total, 76 PASS and three restricted-environment failures (PGlite initdb and stdio child connection). The approved local-process retry of --test-name-pattern='M04 SQL import|P05 official stdio|P05 the new stdio' over meridian-import/protocol-mcp passed all three. No skips or unresolved failures remain in this bounded regression set. DATABASE_URL and OURO_DATA_DIR were cleared only in the test process; no live profile was opened.
- Independent read-only foundation review was delivered to the parent: no blocker for the current 47 route.ts baseline; a newly added Next route.js could escape its extension filter. Foundation owner accepted that gap for correction in that separate branch.

## Implemented result

- Framework-independent semantic read/command/subscription ports, explicit capability/scope DTOs and frozen original command intent are a foundation only. No current screen or transport has been rewired to them.
- Core owns the unchanged Meridian-to-RevisionContent mapping. Context validation depends on the existing neutral protocol Unicode validator, removing the reverse context-to-core dependency. Existing consumers import the mapping from its new owner.
- The AST checker resolves the allowed graph, enforces pure/browser/package and frontend slice directions, checks inherited semantic port signatures and uses exact owned legacy edges. Root check:architecture invokes it without opening storage or application handlers.
- No package/dependency versions, lockfile, endpoint schema, saved history, runtime auth or command retry behavior was changed. No commit, push, PR or merge was performed by this subagent.

## Remaining boundary

ProjectSession ownership, HTTP/SSE adapter wiring, Query integration, route migration, CSS-to-Tailwind conversion, backend extraction and real Meridian host integration are outside this P1.1 story and remain unimplemented here.
