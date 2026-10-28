# OURO-ENG-000007 — Corrections, historical views and revoked-agent recovery

2026-10-28 · SDD before implementation. Source requirements: [status methodology §4–7](../status-methodology.md), [TS §4–6](../TS-Ouro-OS.md), [engineering roadmap](../roadmap.md).

This bounded package closes three explicit methodology debts before collaborative drafting: append-only decision maintenance, a read-only projection at a committed cursor, and human recovery when a revoked agent cannot acknowledge a stop. Existing execution and request enums remain unchanged.

## Decision maintenance

All writes require the normal requestId and expectedVersion. Original request text and terminal decisions are never overwritten.

| Command | Authority / preconditions | New fact / behavior |
|---|---|---|
| `withdrawDecision {decisionRequestId,reason}` | Assigned author agent; pending request only | `DecisionWithdrawn`; request becomes withdrawn. No decision, ACK, resume or Blocker clearance is implied. |
| `requestDecisionClarification {decisionRequestId,question}` | Human; pending request | `DecisionClarificationRequested`; request remains pending. Only this explicit clarification is requested. |
| `submitDecisionClarification {decisionRequestId,clarificationEventId,response}` | Assigned author agent; matching still-open clarification on pending request | `DecisionClarificationSubmitted`; preserves the question and adds a source-linked response. No execution permission changes. |
| `correctDecision {decisionRequestId,reason}` | Human; resolved current decision on current revision, nonterminal execution, not applied, no execution result/DoD and no remediation ever authorized for this decision lineage | New `DecisionRequested` linked by `supersedesDecisionId` and `rootRequestId`. The old request stays resolved with its immutable outcome. The new request copies kind/content/options and requires a new explicit human outcome. |

A pending-only clarification is not an editable copy of a request. If new alternatives or a changed contract are needed, submit a new request/revision. Correction is deliberately rejected after application, results or acceptance, with guidance to create a new revision/specification; it cannot rewrite completed work or silently unaccept DoD. Only the latest request of a decision lineage can be applied, authorize remediation or be corrected. A withdrawn correction does not revive the former permission automatically.

`rootRequestId` gives a stable identity to a physical Blocker across corrections. Blocker guards inspect the current request of each lineage while retaining the root physical barrier until `BlockerCleared`. New correction requests inherit the root and never create a second independent physical obstacle. `BlockerCleared` identifies the current plan request and projects its evidence to its lineage. Existing unlinked requests use their own ID as root, preserving replay compatibility. Retired requests remain visible in their historical snapshots.

Withdrawing a Question or Fork leaves an execution in waiting_for_human until a separate human resume authorization and agent ACK. Withdrawing a Blocker leaves its physical barrier intact. No command in this package silently resumes work.

## Recovery after emergency revocation

`forceCancelRevokedExecution {executionId,reason,evidence}` is human-only. The store checks the assigned registration and append-only revocation under the same project lock and transaction as the cancellation. Simulator/unknown/active registrations and terminal attempts are rejected. The core receives server-supplied proof in its environment, never trusts a payload claim about revocation, and emits `ExecutionOperatorCancelled` with the proof and operator evidence.

Projection sets the existing state `cancelled` and `stopConfirmation:'unknown'`; this is cancellation of authorization, not an invented agent ACK. Resume authorization is removed. New primary/remediation starts and resumes that could conflict with this spec remain forbidden even though the old attempt is terminal. New late Action facts can still be preserved against the original immutable revision without reviving the attempt.

`attestExternalStop {executionId,evidence}` is a separate human action after operator cancellation. It emits `ExternalStopAttested`, records the attesting identity/time/evidence, and sets `stopConfirmation:'operator_attested'`. UI explicitly calls this the operator's attestation, not an agent ACK. This permits a subsequent separately authorized attempt; it neither creates one nor accepts DoD. It does not clear Blockers or change an old outcome.

The existing agent ACK stop path remains unchanged. A captured revoked actor cannot send ACK or writes, including after cancellation. Duplicate commands return their receipt; conflicting reuse and stale versions fail atomically.

## Historical cursor

Use authoritative replay of a validated complete committed prefix at integer cursor `0..latestVersion`. The historical projection is separate from the live snapshot adopter; SSE continues advancing the latest state while the selected historical cursor stays pinned. Cursor 0 is a valid empty projection.

A dedicated historical panel in History shows roadmap/spec/execution/request state and immutable revision contents, source events and state diagrams at the selected cursor. It mounts no mutation forms. Main application command entry points reject writes while historical preview is selected; nested write panels are not mounted in this mode. A clear banner identifies the pinned and latest cursors, and an explicit button returns to live work. Export includes the selected prefix and cursor. An invalid/out-of-range cursor fails visibly, never falls back to latest silently.

## Acceptance criteria and meaningful checks

1. Author-only withdrawal appends exactly one event, remains replayable, rejects closed/foreign requests and preserves waiting/physical Blocker guards.
2. Human clarification and assigned-agent response retain original content and pending state; a response must reference the real unanswered clarification, cannot forge actor or grant action permissions.
3. Correction keeps the old resolved decision byte-for-byte; the new request references the old decision and same root. Only latest lineage permission applies. Stale conflicts and duplicate corrections fail; applied/result/accepted contexts require a new revision/spec.
4. A corrected Blocker has one physical barrier; neither withdrawal nor approval removes it. Current approved plan + successful authorized remediation + evidence clears its lineage once.
5. SQL transaction/reopen/idempotency tests prove recovery needs a genuinely revoked assigned registration, preserves all evidence, survives restart, rejects forged revocation and prevents new work until separate stop attestation.
6. Historical replay at 0/intermediate/latest cursors yields exact prefix states; invalid/gapped history fails. Browser tests prove pinned history remains stable during live updates and no write request can be made from historical preview.
7. Browser tests exercise human clarification, visible source-linked correction and operator recovery labels/attestation. Real MCP facade/SDK tests exercise the two author-agent maintenance tools with strict schemas and assignment scope.

## Sources used

The established architecture uses [W3C SCXML](https://www.w3.org/TR/scxml/) for guarded independent state machines and [Martin Fowler: Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html) for append-only facts and historical replay. This package applies those principles through the existing domain engine; it does not claim a SCXML interpreter or irreversible real-process control.
