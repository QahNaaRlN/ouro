# Project session, HTTP/SSE ports and Query projection

Date: 2026-11-04. Status: P1.2 implemented within the stated scope; scoped local checks PASS; parent review ACCEPTED; historical empty-receipt recovery gap OPEN; CI and integration PENDING. Scope: P1.2, following the reviewed portable-client-contracts story.

## Problem and scope

The projects UI and legacy root UI each own an adopter, stream, state copies and command paths. A portable lifecycle owner must admit all project snapshots consistently, isolate access generations, preserve original uncertain commands and expose one accepted snapshot to React through TanStack Query. Existing endpoint/auth/receipt semantics and specialized collaboration/integration recovery stay intact.

This story connects the existing read/command/subscription contracts. Query is an explicit projection of admitted state, not another replay engine or independent snapshot writer. The existing subscription engine is reused with the session's single adopter. No generic HTTP/native port, new receipt endpoint, durable command body store, i18n/Form migration or real Meridian host is introduced.

## Acceptance criteria

1. One runtime registry leases one ProjectSession/adopter/stream per source/project/actor/access/host generation; cleanup is idempotent. Multiple observers and StrictMode do not create concurrent streams for one active scope.
2. HTTP GET, command results, SSE and existing child-panel snapshot callbacks pass the same admission owner. Equal snapshots retain the accepted reference, older snapshots cannot roll back, and incompatible history or cursor reset requires explicit recovery.
3. A scope switch invalidates old reads/callbacks/cache writes and closes stream/listeners/timers. Auth failure hides private data and disables writes. Query keys include source, actor, project and epochs; no secret or foreign placeholder is used.
   Identity reads themselves use latest-request generation/abort/unmount guards. Reauthentication of the same actor still produces a fresh access epoch; a late prelogout reply cannot replace the later identity. StrictMode remount can start a new active generation.
4. HTTP ports construct only declared same-origin routes, pin project and expected actor, validate unknown responses and preserve existing cookie/redirect/body behavior. No arbitrary URL/headers template is accepted from domain content.
5. Project commands freeze the original operation/project/actor/requestId/version and exact serialized body before sending. Automatic mutation retry is zero. Lost, aborted or malformed possible-commit responses remain UNKNOWN. Exact recovery never substitutes a new actor/body/version/ID, and disposal does not delete pending intents.
   The original human action label and per-slot guard remain client presentation metadata. They do not enter the wire DTO; an occupied slot rejects another request before dispatch. A later owner recovers original key/label/URL from the existing RAM intent rather than regenerating them.
   A valid snapshot alone does not prove the command outcome. An ordinary command/task receipt must contain the complete nonempty suffix bound to the original human actor, project, requestId and frozen expectedVersion interval. Empty receipts or historical events without requestId retain UNKNOWN until authoritative recovery can prove their provenance; replayed:true alone is insufficient.
6. Snapshot selectors read the Query projection; owner read operations and metadata refresh do not cache another independently mutable ProjectState. Query defaults are explicit. A disabled snapshot observer is not interpreted as an initial loading request.
7. Error normalization is pure. Reporting receives redacted occurrence metadata; synchronous throws or rejected reporter promises cannot change command outcome, snapshot admission, lifecycle or UI error ownership.
8. Both Workspace ProjectScope and legacy root use the new owner through narrow edits. Existing UI navigation, read-only history/Viewer guards, specialized recovery and metadata polling remain functional. Transport conversion of unrelated features is not claimed complete.
9. Meaningful RED/GREEN tests cover scope races, GET/command/SSE ordering, duplicate leases, malformed/lost command responses, exact retry, reporter failure, Query projection and disposal. Relevant existing snapshot/stream/intent/Flow tests and type/architecture checks remain green on exact Node24.19.

## Boundaries

The branch is codex/project-session in its own worktree. Source profiles, real databases, credentials, remote branches and Meridian remain untouched. The Vite composition root is being built in a separate story; this story exports the reusable provider/runtime for it. P1/P4 and full migration gates remain open.

The current server keeps durable receipt provenance internally but does not include it in the HTTP envelope. The migration-rehearsal fixture deliberately preserves an old createSpec receipt with events:[]; the strict client cannot confirm that immutable historical response. This is an explicit open legacy-recovery parity gap, pending a separately reviewed backwards-compatible HTTP proof from the durable receipt. This story does not infer success, rewrite the old receipt, add a response-field echo as proof, or change MCP wire contracts. Current human command/task emitters produce nonempty bound events; the actual observer no-op is a separate specialized runtime path retained here.
