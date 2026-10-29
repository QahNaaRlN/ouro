# Reproducible beta release test runtime

Release follow-up to [guided-workspace](guided-workspace.md).

## Observed RED

Release PR19 run `40926476711` passed all82 production browser scenarios, but its unit job aborted inside Node24.22.1/V8 during a PGlite WebAssembly teardown in `flow-runtime-store.test.ts`. The native assertion was `jit_page_->allocations_.erase(addr) == 1`; it matches the signature documented in [nodejs/node#66366](https://github.com/nodejs/node/issues/66366). This was a process abort, not a failed application assertion. The same complete suite passed locally on the repository's pinned Node24.19.0.

## Bounded change and acceptance

1. CI reads the exact validated Node version from `.nvmrc`, rather than floating to a newer24.x patch during release qualification.
2. The standard unit command keeps all existing files and assertions, runs test files serially to bound PGlite memory, and uses Node's `--no-wasm-code-gc` only in those short-lived test processes. This retains generated Wasm code until each test process exits, following the published diagnostic workaround for the V8 teardown issue.
3. Product dev/build/start/launch, production browser servers, MCP and protocol behavior do not acquire this test flag. No test is skipped, retried until green or weakened. Memory protection settings are unchanged.
4. Run the standard `npm test` to completion with all368 tests and require the final release-head CI `checks` and `browser` jobs to succeed. Production E2E continues to exercise the ordinary application runtime.
5. Document the runtime choice and actual evidence in the release journal. Reassess the test workaround when upgrading the pinned runtime after the upstream V8 fix is available and validated.
