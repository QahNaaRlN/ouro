# HTTP baseline before service extraction

Status: reviewed static inventory, 2026-11-04. Runtime parity for the extracted service remains NOT_RUN. The machine-readable [47-route inventory](http-baseline.json) is checked by `npm run migration:check`; the checker reads TypeScript declarations without importing handlers or opening storage.

Fingerprints use UTF-8 source with LF line endings so Git's Windows/Linux newline conversion does not create false changes. They protect the route wrappers and explicit method declarations. They do not prove behavior of an unchanged wrapper's modified dependencies; the existing and new contract tests remain required.

## Access and transport requirements

| Access | Existing boundary |
|---|---|
| H | authenticated human participant; current domain/store authorization still applies |
| U | account cookie session and applicable membership/owner guard |
| W | workspace request resolver: hosted membership or trusted local operator, with exact project scope |
| L | trusted local operator plus folder-project/runtime guards |
| A | separate project-bound agent Bearer credential |
| Public | endpoint-specific credentials, codes, signature or health policy; not a general authorization bypass |

All paths below include `/api`. Method lists are explicit exports; automatic HEAD/OPTIONS behavior is recorded separately in JSON. Four explicit MCP GET/DELETE exports intentionally return 405.

| Path | Explicit methods | Access and special behavior |
|---|---|---|
| `/agents` | GET, POST | H; creation requires Owner; one-time credential |
| `/agents/[id]/revoke` | POST | H + Owner |
| `/auth/invitations/accept` | POST | Invitation code, optional U; three cookies on success |
| `/auth/login` | POST | Account credential; rate limiting; three cookies |
| `/auth/logout` | POST | Optional cookie, Origin/JSON guards; three cookies |
| `/auth/password-reset/confirm` | POST | Reset code; three cookies |
| `/auth/password-reset/request` | POST | Email; bounded requests and mail |
| `/auth/session` | GET | U |
| `/commands` | POST | H; expected version and exact receipt |
| `/drafts` | GET, POST | H; write requires Owner/Contributor |
| `/drafts/[id]` | GET | H; draft head/state |
| `/drafts/[id]/updates` | POST | H + write access; exact update identity |
| `/drafts/[id]/publish` | POST | H + write access; pinned head/hash/base and receipt |
| `/events` | GET | H; manual 422/409 currently lack explicit no-store |
| `/github` | GET | H |
| `/github/bindings` | POST | H + store guards; GitHub lookup |
| `/github/bindings/[id]/revoke` | POST | H + store guards |
| `/github/deliveries/[id]/retry` | POST | H + store guards; durable retry then deferred kick |
| `/github/webhook` | POST | Raw-byte HMAC; 2 MiB; durable enqueue then deferred kick |
| `/health` | GET | Public readiness; SQL failure returns 503 |
| `/inbox` | POST | A; restricted agent view; success lacks explicit no-store |
| `/mcp` | DELETE, GET, POST | A on POST; finite JSON; explicit GET/DELETE 405 with Allow: POST |
| `/meridian/import` | POST | H + expected participant; 2 MiB; unverified pinned import |
| `/participants` | GET, POST | H; creation requires trusted operator |
| `/participants/[id]/revoke` | POST | H + trusted operator |
| `/participants/session` | POST | Participant credential; one cookie |
| `/participants/logout` | POST | Optional session and Origin/JSON guards; two cookies |
| `/project` | GET | H; shared snapshot/cursor |
| `/projects` | GET, POST | Hosted account handlers or trusted local operator |
| `/projects/[projectId]` | GET | W; metadata/snapshot/agents/connection |
| `/projects/[projectId]/agents` | GET, POST | W; creation requires Owner |
| `/projects/[projectId]/agents/[agentId]/revoke` | POST | W + Owner |
| `/projects/[projectId]/binding-recovery` | GET, POST | L; inspection/ticket and exact recovery |
| `/projects/[projectId]/commands` | POST | W + store guards; exact receipt |
| `/projects/[projectId]/invitations` | GET, POST | U + Owner; mail follows commit |
| `/projects/[projectId]/invitations/[invitationId]/revoke` | POST | U + Owner |
| `/projects/[projectId]/mcp` | DELETE, GET, POST | A on POST; scoped finite JSON; explicit GET/DELETE 405 |
| `/projects/[projectId]/members` | GET | U + current membership |
| `/projects/[projectId]/members/[membershipId]` | DELETE, PATCH | U + Owner; last-owner protection |
| `/projects/[projectId]/stream` | GET | W; SSE with repeated authorization |
| `/projects/[projectId]/tasks` | POST | W + store guards |
| `/projects/[projectId]/verification/observe` | POST | L + observation guards |
| `/projects/[projectId]/verification/run` | POST | L + runtime guards; bounded runner |
| `/session` | GET | Account session or participant/local session; possible cookie |
| `/simulator` | POST | Trusted human operator in explicit local-demo mode |
| `/stream` | GET | H; SSE with repeated authorization |
| `/workspace/folders` | GET | Trusted local operator; read-only folder browsing |

## Extraction checks

Preserve automatic OPTIONS 204 and sorted Allow, HEAD through GET, implicit 405 without Allow, and the explicit MCP exceptions. Preserve separate Set-Cookie values and never flatten them into a plain object. Generic JSON bodies are bounded at 256000 bytes; special 2 MiB routes remain separate.

Project SSE keeps `text/event-stream`, `no-store, no-transform`, `X-Accel-Buffering: no`, snapshot/cursor, heartbeat and disconnect cleanup. MCP remains finite JSON. The verification runner's default 60 seconds and bounded maximum 120 seconds must not be truncated by an unrelated HTTP timeout.

The two Next `after()` uses are GitHub webhook and delivery retry. Next instrumentation starts recovery; the SQL observer has a separate lifecycle. Their replacement needs explicit ownership and recovery. Existing endpoint-specific header inconsistencies are baseline facts, not silent cleanup opportunities.

Checks and limitations belong to each atomic story. The static inventory cannot certify Hono, all HTTP families, external PostgreSQL, packaging or Windows native host integration.
