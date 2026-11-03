# Explicit recovery of a legacy Windows workspace binding

2026-11-03. BUGFIX. Base: `origin/dev` / `0f12ebd28933c95a44d967d7773f2b8f2e4b1aeb`. Isolated worktree: `codex/workspace-binding-recovery`. This work does not change or restart the live beta.3 installation, its PGlite database, Concord assignments or the owner's pending browser intent.

## Problem and evidence boundary

A saved folder binding contains device `0`. The current Windows runtime observes a nonzero device with the same canonical path and exact bigint inode. The ordinary guard correctly rejects the mismatch, but an authenticated prewrite rejection is displayed as UNKNOWN. There is no supported explicit recovery path.

The reason the historical zero was recorded is unknown. Current Node 23 and the actual Node 24.19 runtime agree on the present tuple. Node's Windows libuv implementation derives `st_dev` from the volume serial and includes a zero fallback, but that does not prove which branch ran at registration. File ID plus volume serial identifies a Windows object; path/inode agreement alone does not prove continuity. Sources: [Node 24.19 libuv source](https://raw.githubusercontent.com/nodejs/node/v24.19.0/deps/uv/src/win/fs.c), [Microsoft file information contract](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/ns-fileapi-by_handle_file_information).

The verified live installation is beta.3 source `93d42be34478c49e07f9074face79806f1d7e274`, build `exym2b566ft83nWnWF86z`, served from the separate installed release directory. Code changes belong to the isolated dev checkout, not that installation. Deployment evidence and the incident handoff remain local artifacts, outside the committed source.

## Required behavior

1. Ordinary folder/file guards continue comparing canonical path, device and inode exactly. No wildcard for zero and no automatic rebinding. Replaced roots, symlinks/junctions, moved paths and changed identities remain rejected.
2. A read-only recovery inspection is available only to the trusted local catalog operator with current project Owner authority. It reads the saved binding and probes the existing path without changing it. Eligibility is restricted to Windows, saved device zero, current nonzero device, the same exact canonical path and nonzero bigint inode, and a stable ordinary directory without symlink. Any nonterminal execution blocks recovery.
3. Inspection explicitly states that historical identity continuity is UNKNOWN. A human can re-establish trust in the observed folder; the system does not infer that it is the same historical object.
4. Inspection issues a short-lived authenticated ticket bound to the current human, project, saved binding, observed tuple, runtime and expiry. Confirmation accepts only `requestId`, this ticket, a reason and explicit acknowledgement of the identity uncertainty. It cannot select an arbitrary new folder.
5. Confirmation rechecks current authority, the old binding, filesystem identity and execution boundary under the project's transaction lock. It atomically appends an immutable recovery audit/overlay with a new binding ID and an exact request receipt. The original catalog row, events, revisions, executions, old receipts and domain version stay unchanged. Every current binding reader uses the same overlay.
6. Recovery replay authenticates the participant before receipt lookup. A committed exact receipt replays even after ticket expiry or a later binding change; a changed body with the same key conflicts. A failure cannot leave half an audit or binding. Runtime restart invalidates unused tickets; it does not invalidate committed receipts.
7. The specific assignment folder guard may emit a server-owned rejection marker only after exact receipt lookup missed and the transaction rolled back successfully. It binds project, actor, request, command type and a canonical body SHA-256. A generic error code is insufficient evidence.
8. A fresh client request receiving the exact authenticated 409 marker is shown as rejected, retains its frozen intent and offers explicit recovery guidance. Timeout, 5xx, malformed/mismatched proof and transport ambiguity remain UNKNOWN. A prior UNKNOWN does not become rejected from receipt absence or a later negative guard result; only a successful exact response/receipt resolves it.
9. Recovery never retries an assignment. The original author/project/requestId/body remain unchanged. After separately approved live deployment and human recovery, the owner may explicitly retry the original request. The existing receipt and CAS contract must allow exactly one execution; a newer project version causes a visible conflict without rewriting the old request.
10. If the original in-memory intent is unavailable and the owner retains only a JSON copy, provide an explicit local restore action. It validates the current project/author and supported `startExecution` fields, requires the original request ID and a human acknowledgement, and saves an UNKNOWN intent without any network request. It does not prove the copy's historical accuracy, generate a new ID, insert defaults or replace an existing frozen intent. A separate explicit retry uses that provided body; an existing incompatible receipt conflicts rather than being rewritten. This is restoration from a human-reviewed copy, not recovery of lost historical bytes.

## HTTP surface

`GET /api/projects/[projectId]/binding-recovery` returns a read-only authorized inspection, current/saved identity, eligibility/reason, runtime, audit history and an eligible ticket. `POST` accepts the strictly validated confirmation above. Both are human endpoints, use the existing expected-participant check and do not add agent tools. The same frozen-intent mechanism handles confirmation uncertainty.

## Acceptance and exclusions

Demonstrate an actual failing regression before the fix, then cover real filesystem rejection with zero domain writes; saved-device-zero behavior; authority and revocation; tampered/expired tickets and CAS/races; append-only audit, rollback, reopen and exact recovery; positive command receipt before a lost-folder guard; retained client intent and prior UNKNOWN; and one original assignment after explicit recovery. Exercise Windows directly and Linux-safe negative/platform cases. A production browser scenario uses a synthetic folder and separate database.

Technical GREEN does not establish the cause of historical dev zero, owner acceptance, a live repair or release. No live database editing, second-process PGlite opening, automatic folder trust, assignment, agent ACK or DoD acceptance is authorized here. The existing verification feature branch remains separate; commit, push, merge and deployment of this fix require their own applicable authorization.

Post-qualification owner instruction: commit and push of the current `codex/workspace-binding-recovery` branch are explicitly authorized. Merge and any live installation, database, binding or request update remain outside this authorization. Qualification results and the live NOT_RUN statuses are unchanged.
