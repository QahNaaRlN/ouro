# Portable client contracts and architecture boundary checks

Status: P1.1 implemented; local scoped checks PASS; review, CI and integration PENDING. Date: 2026-11-04.

## Problem and scope

Ouro currently declares browser read models in React components and imports types from server modules. The core package uses the Meridian context parser while that parser also depends on core types and Unicode validation. These boundaries make a portable client and an independent backend harder to compose and verify.

This bounded P1.1 implements framework-independent client DTOs/ports, removes the core/context package dependency cycle, and adds an AST-based architecture check. Accepted decisions D01–D16 are recorded in the main checkout's docs/proposals/react-vite-migration/decisions.md. The accepted architecture remains the basis; this story does not implement the ProjectSession controller, Query wiring, Vite entry, backend extraction, native host operations or the Tailwind rewrite.

## Acceptance criteria

1. Client ports and DTOs import no React, Next, Tauri, server modules, Node-only dependencies or browser globals at module initialization. They describe explicit project/actor/context scope, snapshot reads, frozen semantic commands, subscription lifecycle and supported capabilities.
2. Public port methods cannot accept arbitrary HTTP URLs, methods, headers or executable request templates. Frozen command contracts preserve requestId, expectedVersion, actor/project and the exact serialized body; confirmed, rejected and unknown outcomes remain distinct. No new receipt endpoint is declared implemented.
3. UI-specific read models remain client contracts rather than additions to the published MCP tool surface. Existing wire identifiers, protocol/schema versions and endpoint behavior do not change.
4. Meridian scope parsing and validation no longer depend on core. The mapping from a scope to RevisionContent belongs to core. Shared Unicode validation has one neutral implementation, preserving malformed UTF-16 rejection and all current scope/mapping behavior.
5. The architecture checker parses TypeScript/JavaScript syntax and resolves aliases, relative imports and package exports. It inspects static/type-only imports, named/star reexports, import types, dynamic import and require. Pure/client boundaries and the core/context direction are enforced without blanket exclusions of legacy lib directories.
6. Meaningful positive and negative fixtures demonstrate accepted imports and rejected alias/relative/package-export, type-only server, framework/runtime, dynamic/require and forbidden port-method cases. Unknown nonliteral module specifiers in protected code cannot silently escape inspection.
7. New client public API uses explicit named exports, JSDoc responsibility comments, strict types and no any. Existing unrelated code is not mechanically renamed or moved.
8. Relevant protocol, Meridian, core, snapshot/subscription and architecture tests pass on exact Node 24.19.0, with actual commands/results recorded in the journal. An unavailable dependency is not counted as a Red result.

## Checked dependency directions

Pure package dependencies point toward their contracts: protocol has no reverse package dependency; Meridian context uses protocol; core uses protocol and Meridian context; collaboration uses core/protocol; client ports use protocol and core DTO types only. Client lifecycle may use those pure primitives and ports. Pure packages cannot acquire the broader browser permissions by importing frontend or HTTP adapters, including through an intermediate barrel. Browser code may consume public pure dependencies. New portable modules cannot obtain historical baseline exceptions; the baseline contains only exact existing app/components TSX edges with an owner and removal reason.

Resolution walks the allowed graph; a named browser-safe legacy helper is not a transitively trusted module. Nonliteral module expressions, unresolved modules and unavailable package-export branches fail rather than silently choosing a different declaration or runtime branch. These static checks are one migration gate; actual production bundle inspection and lifecycle/transport behavior require their later stories.

## Authority and compatibility

Work is isolated in the portable-client-contracts worktree/branch. No user data directory, live DB, credentials, remote Git state or Meridian repository is modified. The ports are a foundation until P1.2 connects real adapters/session ownership. A passing checker does not establish completed hFSD migration, native integration or functional parity of the whole migration.
