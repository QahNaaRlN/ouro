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
