# Guided workspace implementation journal

Specification: [guided-workspace](../specs/guided-workspace.md). Application target: `0.1.0-beta.2`; protocol: `0.1.2`.

## Intended sequence

1. Audit decorative chrome and actual first-use controls; document observable acceptance before implementation.
2. Demonstrate missing walkthrough/cleanup behavior against beta.1 with focused browser checks.
3. Implement separate catalog/project walkthroughs and remove nonfunctional chrome while preserving session provenance and controls.
4. Create the original snake/graph identity and document its rationale and references.
5. Review accessibility, actual browser layouts and regression behavior; run all release gates.
6. Merge the reviewed feature through `dev`, release through `main`, tag and publish exact-commit checksummed assets; verify public downloads.

## Evidence

- Baseline: accepted `main` and `dev` at `e20472ca6ef9da1d547c8468b348b62b01d3e2a6` (`v0.1.0-beta.1`). User working folders and running previews are preserved in separate worktrees.
- RED, implementation, documentation, references, acceptance and publication results are recorded below as they occur.

### Meaningful RED against beta.1

- `IC01` reached the existing Human View, read the actual authenticated actor and failed because the labelled session status was absent. The test also protects keyboard navigation from the project breadcrumb. Log: `/tmp/ouro-guided-cleanup-red.log`.
- `ON01` reached the existing project catalog and failed on the absent explicit `Обучение` launch button. The remaining cases cover opt-in persistence/restart, keyboard/inert background, exact no-write history, selected Flow/disclosure restoration, responsive geometry, blocked/corrupt storage and missing targets. Log: `/tmp/ouro-guided-onboarding-red.log`.
- Both baseline runs used the accepted beta.1 production build and isolated temporary data, not a missing dependency or unavailable server.

### Reviewed design references

- [WAI-ARIA Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): modal background inertness, contained keyboard focus, Escape, explicit close and return to the invoking control.
- [Nielsen Norman Group: 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/): remove irrelevant chrome, preserve status visibility, provide contextual recognition and user-controlled exits.
- [Driver.js configuration](https://driverjs.com/docs/configuration): spotlight geometry, step progress, keyboard navigation, inactive background and missing-target handling as product-tour references. Ouro implements its bounded tour with a native dialog and adds no tour dependency.
- Installed Next.js documentation for client/server components, accessibility, metadata and app icons was read before the corresponding code changes. The existing static `/icon.svg` path remains deliberate because it also preserves quoted-path installation support.

These references guided implementation choices; they do not establish a blanket accessibility certification.

### Implementation and independent review

- Removed the fake workspace/profile controls, decorative heading/empty-state ornaments, repeated slogans and stale prototype badge. The actual participant/role, live statuses, release version, filters and working commands remain visible. Both branded home links and the Human View project breadcrumb open the project catalog.
- Added native modal-dialog walkthroughs for catalog/project, safe browser-only preferences, inert background, contained keyboard focus, Escape/skip/restart, missing-target guidance and scroll/disclosure restoration. No server/domain command is issued by a tour.
- An independent review found and corrected write-only localStorage failure recovery and actual tooltip sizing against the visual viewport. `ON09` protects readable-but-unwritable storage across internal navigation.
- The original generated snake/graph concept was reduced to a standalone SVG. Chromium inspection covered 16/24/28/32/40/64px, dark/light backgrounds, the full Human View, desktop catalog and a390px tour. Favicon metadata includes the application version to refresh browser caches.
- The200% zoom probe initially compared Playwright's visual coordinates with DOM layout coordinates. The test was corrected to compare DOM rectangles in one frame; real keyboard progression and all three steps passed. This was a test-coordinate correction, not evidence of an application regression.

### Local release acceptance

- Full unit/integration suite: **368/368 passed**, no skips/failures,180.245s, `node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/*.test.ts`. Initial parallel runs encountered file-level process exits while the host's cgroup OOM-kill counter increased; serial execution completed without changing application code or stopping existing user previews. Log: `/tmp/ouro-guided-unit-final.log`.
- Full production browser gate: **82/82 passed**,0 unexpected/flaky/skipped, workers1/retries0, isolated fresh database,190.466s. This includes71 previous scenarios,10 onboarding scenarios and1 functional session/navigation scenario. Log: `/tmp/ouro-guided-production-e2e.log`.
- Production build, explicit TypeScript check,49 canonical schema check, durable database replay and repository conventions passed. Independent protocol installation/build/ESM/CJS/types/CLI/schema acceptance: **1/1 passed**.
- A freshly packed `ouro-protocol-0.1.2.tgz` retains SHA-256 `83ae0850a93877853b0ac50eeb3a03493bbbbd69614ffac288c608f256156cf3`; the protocol source and public contract are unchanged.
- Checked155 relative documentation links, with no missing files. README, guides, active architecture/version references, validation and roadmap are synchronized; historical beta.1 evidence remains intact.

### Publication gate

The first release-head CI (`40926476711`) passed all82 browser scenarios, but its unit process aborted in Node24.22.1/V8's Wasm allocator during teardown. This matches the published native signature in [nodejs/node#66366](https://github.com/nodejs/node/issues/66366). The [bounded runtime follow-up](../specs/release-runtime.md) pins CI to `.nvmrc`24.19.0 and applies the documented Wasm-code-GC workaround only to the serial unit-test command. The final release gate must use the corrected head; the failed run is not release acceptance.

The feature enters `dev` through a reviewed PR; the release candidate enters `main` only after real `checks`/`browser` jobs pass. Verify proposed/actual merge trees against the accepted head, preserve shared history, and package the exact final main commit. The annotated tag, release manifest and GitHub Release identify that immutable commit and the actual CI evidence. Upload assets through the isolated publication workflow with the standard repository token, verify downloaded bytes before publishing, then verify anonymous public downloads. [Version and publication evidence](https://github.com/QahNaaRlN/ouro/releases/tag/v0.1.0-beta.2).
