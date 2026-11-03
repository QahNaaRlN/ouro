# Workspace binding recovery implementation journal

Integration notice, 2026-11-03: the results below describe the original `0f12ebd` branch. The combined beta.4 candidate retains verification migrations 010/011 and adds recovery as012; it keeps protocol 0.3.0 and hosted access boundaries. Current integration evidence and remaining delivery gates are recorded in [the integration journal](beta4-final-integration.md). Historical test counts below are unchanged.

2026-11-03. BUGFIX. Isolated base `0f12ebd28933c95a44d967d7773f2b8f2e4b1aeb`, branch `codex/workspace-binding-recovery`, worktree `D:/PersonalProjects/ouro-worktrees/workspace-binding-recovery`. Contract: [explicit legacy Windows binding recovery](../specs/workspace-binding-recovery.md).

The isolated implementation is technically qualified: **PASS**. The full Windows suite, final response-race targets, Linux gates, production build and both browser scenarios passed. The live incident remains unrepaired: deployment, human trust re-establishment and the original assignment retry have not run. Technical qualification and acceptance of a live repair are separate.

## Live evidence and preserved boundary

Read-only preflight identified the separate installed beta.3 process **PID 48564**, source `93d42be34478c49e07f9074face79806f1d7e274`, build `exym2b566ft83nWnWF86z`. This is the live installed application, not the isolated worktree. The saved binding has device zero; the current observed Windows tuple has a nonzero device with the same canonical path and exact bigint inode. **The origin of the historical zero and continuity of the physical directory remain UNKNOWN.** No inferred Node/libuv cause or automatic identity equivalence is claimed.

The project currently viewed in Chrome is at version/cursor **165**; its pending-intent panel is absent. The owner confirmed that only a transcribed JSON copy remains. That copy is preserved, but its equality to the historical request body has **not** been verified. It is not evidence of recovered historical bytes or of the original request's outcome.

The new UI offers explicit local restoration from a reviewed copy: it validates the supplied author/project and supported fields, preserves the supplied request ID/body, and registers an **UNKNOWN** intent locally. Restoration performs **no POST** and does not retry an assignment, insert defaults, generate a replacement request ID, replace another frozen intent or establish historical accuracy. Any later retry is a separate explicit action on the supplied copy and remains subject to exact receipts and CAS. This distinction applies even when the copy contains expectedVersion 165.

No live database, binding, server process, browser request, Concord assignment or saved request was changed. No live server restart, second-process PGlite opening, recovery confirmation or assignment retry was performed. At completion of technical qualification, commit, push, merge and deployment had not been performed for this fix.

## Implemented behavior

The ordinary filesystem guard still compares the full canonical path/device/inode tuple and rejects legacy zero as a mismatch. The specific human assignment guard now emits an exact command-rejection proof only after its failed transaction rolled back and an authorized, locked receipt lookup confirmed absence. The proof binds project, actor, request, supported command type and canonical body SHA-256. Positive exact receipts still precede folder checks. Generic errors and receipt absence do not resolve an earlier UNKNOWN.

A read-only inspection is restricted to the trusted local catalog operator with current Owner authority. A short-lived HMAC ticket binds that person/project, saved and observed bindings, runtime and expiry. Eligibility covers only Windows saved-dev-zero to observed-nonzero at the exact same path and nonzero inode; symlinks, replacements and other mismatches remain denied. Any queued, running, waiting or paused execution blocks recovery. The inspection makes no SQL writes.

Explicit confirmation records a reason and acknowledgement of unknown continuity. Under lock it rechecks authority, the current binding, execution boundary, ticket and filesystem tuple, and verifies the tuple again immediately before commit. Migration 010 appends an immutable audit/overlay with a new binding ID and a separate immutable exact recovery receipt. The original catalog row, domain history/cursor, revisions, executions and previous receipts are unchanged. Current binding readers, including MCP metadata/file tools and existing-folder catalog lookup, use the latest overlay. Authority is checked before recovery receipt replay; an exact committed receipt wins over ticket expiry, later binding changes and a later nonterminal execution.

The client distinguishes a fresh authenticated exact guard rejection from transport ambiguity. It retains the original intent and offers inspection. A prior UNKNOWN stays UNKNOWN after a later rejection. Recovery and original assignment have independent frozen intents; recovery never triggers the original request automatically. Receipt responses must match the expected project/author and required binding evidence before a pending recovery is cleared. Late duplicate replies cannot resurrect a resolved intent, clear a newer one or downgrade concurrent uncertainty; the final regression gate is recorded below.

## RED and corrective history

The backend regression first reproduced a real `WORKSPACE_BINDING_CONFLICT` against an isolated legacy-dev-zero catalog row. It confirmed unchanged events/version/specs/executions and no receipt, then failed because `details.commandRejection` was absent: `artifacts/workspace-binding-recovery-red.log`. The UI baseline separately reproduced incorrect handling of that rejection: `artifacts/binding-client-red.log`. These are behavioral REDs; initial missing local dependencies were environment failures and are not counted as RED evidence.

A further expiry RED demonstrated the recovery-expiry handling gap: `artifacts/workspace-binding-recovery-expiry-red.log`; the addressed regression has separate GREEN evidence in `artifacts/workspace-binding-recovery-expiry-green.log`. The latest UI race RED is retained in `artifacts/binding-client-race-red.log`; the same scenarios now pass in the final **38/38** client gate.

The first Linux target ran 58 checks: **57 PASS / 1 FAIL**. The failure was a test hook targeting the named path while Linux validates the descriptor through `/proc/self/fd`; it did not establish a product probe defect. The hook was corrected to target the actual Linux realpath call, with targeted evidence in `artifacts/workspace-binding-recovery-files-hook-green.log`. The repeated Linux gate passed **62/62**; a further **47/47** gate covers the final response-race client code and POSIX release-launch cases. Earlier failures remain visible in logs and are not relabelled as final success.

## Confirmed checks and final gates

Pinned runtime: Node **24.19.0**. Tests use isolated synthetic directories, memory or disposable file-backed databases, synthetic registered agents and their own MCP service/adapter instances. They do not connect to live Concord or its MCP server.

| Check | Confirmed result / remaining status | Evidence |
|---|---|---|
| Filesystem/helper + storage + HTTP targets | **18/18 PASS**: 8 filesystem/helper, 8 storage, 2 HTTP | `artifacts/workspace-binding-recovery-final-targeted.log` |
| MCP after repair, added acceptance regression | **1/1 PASS** | `artifacts/workspace-binding-recovery-mcp-after-repair.log` |
| Final client targets | **38/38 PASS**, including copy restoration and late reply races | `artifacts/binding-client-green.log`; corresponding RED retained separately |
| TypeScript | **PASS**, final sources and production build | `artifacts/binding-ui-typecheck.log`, `artifacts/binding-production-build.log` |
| Existing agents/migration/workspace compatibility | **23 PASS / 0 FAIL / 2 existing Linux-only SKIP** on Windows, 25 total | `artifacts/workspace-binding-recovery-compatibility.log` |
| Full Windows suite | **470 PASS / 0 FAIL / 6 platform SKIP**, 476 total, 970.2 s; final response-race correction was subsequently checked by the 38/38 client gate and final browser/build gates | `artifacts/binding-full-windows.log` |
| Repeated Linux recovery/workspace/client gate | **62/62 PASS / 0 SKIP** | `artifacts/binding-linux-targeted.log` |
| Final Linux client + POSIX process/release-launch gate | **47/47 PASS / 0 SKIP**; covers the final client race correction and the remaining Windows-only omissions | `artifacts/binding-linux-final-extra.log` |
| Final production build | **PASS**, final response-race/copy/expiry code, ordinary production runtime | `artifacts/binding-production-build.log` |
| Isolated production browser | **2/2 PASS**, workers=1/retries=0, 27.6 s | `artifacts/binding-production-browser.log`, `test-results/binding-recovery-results.json` |
| Generated protocol / conventions / whitespace | **49/49 / PASS / PASS**; portable protocol 0.1.2 unchanged | `npm run protocol:check`, `npm run check:conventions`, `git diff --check` |
| Live deployment / repair / original request retry | **NOT_RUN / NOT_RUN / NOT_RUN** | Live boundary above |
| Owner acceptance | **PENDING** | Separate explicit owner decision |

The late MCP regression uses the real Store, registered agent authentication, `createAgentService` and the production `createAgentWorkspace` adapter. It proves legacy rejection → explicit recovery → one original assignment → actual `ouro.confirm_started` → list/read real synthetic file bytes through the new binding, all on the same execution/revision. Exact start and ACK replay add no execution or event. The execution remains running and the Spec is not accepted as done. This is technical synthetic evidence, not a live agent ACK or owner acceptance.

## Still separate

The completed technical gates overlap and must not be summed as unique test counts. All six platform omissions from the Windows suite have Linux evidence above. A supported live repair requires separately authorized deployment, a fresh live read-only inspection, the owner's explicit trust decision and any separate decision to restore/retry the reviewed JSON copy. A copied request remains historically unverified; positive exact receipt recovery or a visible conflict must be preserved rather than rewriting its identity/body/version.

The original device-zero provenance remains UNKNOWN after any technical GREEN. No automatic folder trust, live database edit, request replay, agent ACK, DoD acceptance, commit, push, merge or deployment is implied by these test results. The existing verification feature branch remains separate.

## Browser and live handoff evidence

The first browser attempt passed the negative scenario but failed to reveal the copy field inside a closed accessible accordion. The scenario was corrected to open the visible trigger and respect the modal boundary; application code was unchanged. The original log is `artifacts/binding-production-browser-before-accordion-fix.log`. Both final scenarios passed.

The negative scenario exercises a genuinely replaced root, an authenticated rolled-back rejection, the retained original intent and ineligible recovery. The positive scenario deliberately loses UNKNOWN only on its synthetic page, restores the reviewed JSON copy with zero POSTs, explicitly re-establishes folder trust, verifies unchanged original history/version and an immutable audit/new binding, then retries the same captured assignment once. A second exact submission replays without a duplicate. Screenshots in `artifacts/binding-browser/` were visually checked at the desktop test viewport; the candidate owner decision and resulting audit are readable.

A final read-only live check recorded Concord cursor **165**, unchanged binding ID/device-zero metadata and **zero SHARED-SOURCE executions**, with no command sent: `artifacts/concord-live-readonly-final.json`. The supplied transcription is retained separately as `artifacts/concord-request-transcribed-copy.json`; its file SHA-256 is `d52b0e3317b6f6493a47fd637fd150f5565ab10577c40ea6ab62c77cf753351f`. This proves the retained copy bytes, not the historical request bytes.

The concrete owner workflow is [the recovery guide](../workspace-binding-recovery-guide.md). The installed beta.3 does not yet provide the new UI: an independently authorized update and fresh backup come first. Only then can the owner explicitly restore the reviewed copy as UNKNOWN, inspect/re-establish binding trust and separately retry the saved request. No live decision or original request replay was performed by this implementation.

Post-qualification owner instruction: commit and push of the current `codex/workspace-binding-recovery` branch are explicitly authorized. Merge and any live installation, database, binding or request update remain outside this authorization. Qualification results and the live NOT_RUN statuses are unchanged.
