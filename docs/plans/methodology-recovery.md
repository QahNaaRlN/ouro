# OURO-ENG-000007 — SDD / TDD journal

Specification: [methodology recovery](../specs/methodology-recovery.md). Working copy is isolated from the tested alpha.2 deployment.

| Check | RED | GREEN / evidence |
|---|---|---|
| Domain maintenance and SQL revoked-agent recovery | Initial 0/7: missing commands; later withdrawn/historical Blocker recovery 0/2; reactivated-root full cycle 0/1 | 10/10 in tests/methodology.test.ts; SQL registry proof, durable reopen, idempotent receipt, unknown-stop barrier and separate human attestation |
| Independent guard review | 0/5: stale resume permission, unscoped applicability judgment, archive despite unknown stop, terminal-root recovery dead end, pending-limit bypass | 5/5 in tests/methodology-review.test.ts after fixes |
| MCP strict tools and scope | 0/5: missing tools/UNKNOWN_TOOL | 5/5 new tests, 8/8 with official SDK HTTP/Flow regression; strict schemas and actual SDK transport exercise both tools |
| Historical projection / state histories | Browser missing historical cursor after successful bootstrap; visitor got 0 callbacks | Historical prefix 2/2; visitor/equivalence 2/2; pinned live/cursor0/export/no write controls passes in browser |
| Human decision / recovery browser flows | Missing UI controls after real bootstrap; first recovery run exposed missing HTTP422 mapping | Four full desktop scenarios + mobile light scenario GREEN; real registered-agent MCP HTTP clients send clarification, withdrawal and lifecycle ACK |
| State presentation | Old tests correctly required reserved withdrawal before this package | Updated real transition metadata and lineage notice regression: 6/6; existing States browser scenario passed in 5.0s on accumulated fixture |
| Regression on isolated pre-integration base cf9fe86 | First full run caught outdated published-tool/withdrawal assertions | **154/154** unit/integration; typecheck PASS; production build PASS; full E2E after stacked-base integration pending |

No sandbox IPC/permission setup failure is counted as a RED. Tests run in their own PostgreSQL directories. The final stacked integration will repeat the checks affected by upstream lessons/metrics; this record distinguishes those from the isolated feature result.

State-history measurement: the same deterministic 350-event synthetic fixture took **1001 ms before →15 ms after** a single authoritative visitor traversal. This is a measured result, not a timing assertion. Structural tests require exactly one visitor call per fully projected event, and compare all histories with ordinary prefix replay including indirect dependency effects. The replay visitor does not introduce another state machine.

Desktop dark and 390px mobile light historical views were captured and visually reviewed. The historical mode mounts no mutation forms; the live snapshot adopter continues independently. New execution and roadmap archive guards retain an unknown physical-stop barrier even after operator cancellation is terminal.

Sources actually revisited for this package: [W3C SCXML §3.5](https://www.w3.org/TR/scxml/#transition) (events and guard conditions), [Fowler Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html) (Complete Rebuild, Temporal Query, external update separation). Historical replay has no external side effects; corrective decisions are new source-linked facts and cannot rewrite completed work.
