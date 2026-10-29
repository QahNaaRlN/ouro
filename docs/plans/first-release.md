# First working release · SDD/TDD

29.10.2026 · [OURO-ENG-000017](../specs/first-release.md) · baseline `78920a7` · separate worktree `/workspace/ouro-release`, branch `release/0.1.0-beta.1`.

User authorized default-branch rename, dev branch, English naming/messages and first publication. All16 feature branches and66 existing commit subjects already use English; their shared history will be retained. GitHub currently defaults to docs-only master (`27d55f7`); no published releases, tags, Actions runs or repository rulesets exist. The accepted working head includes the whole ancestor chain. Actual release/rename support is absent from the connector; authenticated `gh` is available for those APIs.

Before code: defined FRL01–FRL07, exact-tree source packaging, no-private-data distribution boundary, stdlib one-command local launch, CI/conventions and actual clean-extraction acceptance. This release is a local prerelease; localhost in the execution environment is not a public user URL.

## Repository migration and service permissions

The GitHub integration rejected both default-branch rename and repository default_branch update with HTTP403 `Resource not accessible by integration`. This is a GitHub permission boundary, not an application failure or automatic approval-review rejection. Created actual remote `main` and `dev` at accepted head `78920a7` instead, preserving all66 earlier commits. The user was asked to select main in GitHub's Default branch settings; deleting the old default master is deferred until GitHub actually reports main. No rename redirects or admin-level branch protections are claimed from this fallback. English policy and CI checks remain enforceable in the repository files.

The first four historical PR titles were translated to Conventional English; all existing commit messages were already ASCII English and were retained unchanged. Early workflow push `e1474b2` succeeded, so workflow-write permission is established independently of the denied admin operations. CI exposes stable `checks` and `browser` jobs; no guessed required-check context has been configured.

## Meaningful RED / focused GREEN

- Naming checker:1/6 initial GREEN, malformed branches/subjects/ranges were accepted before guards; final6/6 GREEN. Actual --all history audit passed.
- Launcher:0/2 initial GREEN: generic scaffold ran only start, used the foreign CWD and lost install failure. Final8/8 GREEN verifies ordered stages, literal arguments, Node minimum, invalid ports, preserved exits and actual cancellation including a descendant that ignores SIGINT. URL appears only after observed Ready; .ouro is not removed.
- Packaging: initial tracked.env.local was actually included (1/2 GREEN). Added exact-tree/path/mode checks, noclobber, manifest/hashes and bounded protocol-TAR inspection. A valid metadata header followed by a private entry was independently RED→GREEN. Review found hidden Claude credential filenames; `.credentials.json` and `.claude.json` now both reject. Final9/9 GREEN and independent clean/private-file probes passed.

Independent source review found no remaining blocker (`/tmp/ouro-first-release-review.md`). The private-path rejection is a distribution guard, not a claim that a real credential was present in the product tree. Helper evidence: `/tmp/ouro-release-conventions-{red,green}.log`, `/tmp/ouro-release-launch-{red,green}.log`, `/tmp/ouro-release-package-{red,green}.log`.

## Integrated candidate

Full local unit/integration:367/367 GREEN,0 failed/skipped (89.62s), `/tmp/ouro-release-unit.log`. Production build GREEN, `/tmp/ouro-release-build.log`. The final production browser, clean ZIP launch/restart/MCP and actual GitHub CI are recorded after execution; source checks are not substituted for them.
