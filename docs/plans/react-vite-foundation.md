# React and Vite migration foundation journal

Date: 2026-11-04. Status: local checks PASS; exact-head CI and integration PENDING. Specification: [RVF01–RVF07](../specs/react-vite-foundation.md).

## Branches and baseline

- Source: `origin/dev@3f8c986a8a5ddf272afc2ec8c08bc042b369d683`, with the same tree as `main@c369079294939a7890567b129495aae34090968b`.
- Epic: `codex/react-vite-epic`.
- Atomic stories: `codex/react-vite-foundation`, `codex/service-qualification`, `codex/tailwind-primitives`.
- The original checkout's pending README/architecture documentation was copied into the foundation story. Its pre-existing `next-env.d.ts` change remains in the original checkout and was not included.

## Verification evidence

| Check | Result | Evidence |
|---|---|---|
| Node.js 24.19.0 archive | PASS | Official SHASUMS256; Windows x64 ZIP SHA256 `57F71AB3652E797D84ACDDC79C81CC9FF1C6DDB2A1974CDB83F00FEE9BFF4C73` |
| Route inventory RED | PASS | Node24.19 + `tsx --test tests/migration-baseline.test.ts`: initial 4 tests, 1 PASS / 3 expected assertion failures; changed/added/duplicate records incorrectly accepted by the initial checker |
| Route inventory GREEN | PASS | 5/5 CLI tests, including changed handler, changed methods, added/removed paths, duplicate/policy corruption and Windows/Linux newline equivalence |
| Review regression: JavaScript routes | PASS | Independent review found default Next `route.js` files escaped scanning. Added fixture produced 1 real assertion failure / 5 PASS, then 6/6 GREEN after scanning `.js`, `.jsx`, `.ts`, `.tsx` with their actual script kinds. Existing 47/59 baseline is unchanged |
| Canonical route audit | PASS | `npm run migration:check`: 47 routes / 59 explicit method exports, without importing handlers or opening a profile |
| Existing full unit/integration baseline | PASS with platform limits | `npm test`: 551 tests, 538 PASS / 13 Windows platform SKIP / 0 FAIL; 400.65 seconds, before the 5 new RVF tests were added to the runner's captured file list |
| TypeScript and protocol regeneration | PASS | `npm run typecheck`; protocol0.3.0,71 schemas; generated files have no normalized Git content diff |
| Branch/subject convention and documentation links | PASS | Exact branch and intended Conventional subject accepted; local links/fences checked |
| Portable-contract architecture guard | Separate story | `codex/portable-client-contracts`; this foundation slice does not claim P1 completion |
| First feature-head CI | PASS | [Run 41716907291](https://github.com/QahNaaRlN/ouro/actions/runs/41716907291), `621b8ad`: checks, browser and PostgreSQL all passed; a new exact-head run is required after the review fix |
| Final feature-head CI and merge to epic | PENDING | Pending after JavaScript route regression fix |

## Remaining epic work

P0 remains IN_PROGRESS: this story captures the starting boundary but does not complete toolchain preparation or every parity fixture. HTTP qualification, portable client contracts, service extraction, Vite client, complete Tailwind 4 rewrite, Query/Form integration, workspace tooling, packaging and the embedded Meridian entry remain independent stories. Real native host/SSO work retains its separate authority and qualification scope.
