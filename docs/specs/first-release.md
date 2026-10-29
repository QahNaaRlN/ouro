# OURO-ENG-000017 · Repository workflow and first working release

29.10.2026 · SDD before implementation · baseline `78920a7` (alpha.15). User explicitly requested replacing `master` with `main`, creating `dev`, consistent branch/commit language and defining/publishing the first working version. English technical names and Conventional Commits are selected; product UI and user documentation may remain Russian.

## Release scope

Publish **`v0.1.0-beta.1`** as the first downloadable local prerelease. The app retains folder projects, live roadmap/Flow, human-governed statuses/decisions, immutable history and Cursor/Claude MCP profiles. This is a local operator application; a GitHub release is not a publicly hosted web service. Node24 is the tested/recommended runtime. The portable source ZIP requires Node/npm, not Git, Docker, an external database or account credentials for the UI. The independent protocol remains `@ouro/protocol@0.1.2`.

The release includes a clean source archive, protocol tarball, a release manifest and SHA-256 checksums. Packaging reads an exact committed tree, never the current working directory wholesale. User data, credentials, `.git`, `node_modules`, `.next` and test artifacts are excluded; a tracked sensitive/runtime path rejects packaging. The manifest identifies the exact source commit and versions. A clean extraction must install/build/start and retain one committed project across restart before publication.

## Repository workflow

Rename the actual default branch through GitHub's branch rename API, preserving commits and redirects; update local tracking accordingly. `main` receives the tested release through one reviewable release PR. `dev` is the integration branch and is synchronized with the released main after acceptance. Existing `feat/*` branches are already English kebab-case and remain available; no force-push or historical rewording is necessary (all66 existing commit subjects are English Conventional Commits).

New branches: `feat|fix|docs|chore|refactor|test|ci|build|perf|revert|hotfix/<english-kebab-name>`; release branches `release/<semver>`. Commit/PR subjects use `type(scope)?: english description`, optional `!`, approved Conventional Commits types and English ASCII subjects. Human identity trailers are not translated; English prose is the review policy for bodies. A small reusable checker and CI reject malformed branch names, Cyrillic/non-ASCII subjects and nonconventional headers. They do not claim to recognize English grammar automatically.

Repository documentation and PR template define feature→dev and release→main workflow, SDD/TDD expectations and validation evidence. CI on Linux/Node24 runs conventions, unit/type/schema/standalone checks, production build and production Playwright; native Windows/macOS acceptance remains separate. Main/dev reject force pushes/deletion; required checks are configured only after the corresponding real workflows are available and accepted. Rules must not block publication by requiring an unconfigured context.

The16 prior draft PRs contain an ancestor chain of the accepted release. Their head SHAs must be verified as ancestors before they are retargeted/consolidated; translated historical PR titles may be updated, source histories are preserved. No unrelated PR/branch is removed. GitHub settings/rename/release APIs absent from the connector use the already authenticated GitHub CLI; no new login or credential extraction is required.

## One-command local launch

Add `npm run launch` using a stdlib-only Node script, callable from an extracted source ZIP before dependencies exist. It resolves its own repository root, validates CLI port/runtime, executes `npm ci` → `npm run build` → `npm start -- --port PORT` sequentially with Node/npm argv and no shell interpolation, and preserves failures/signals. It never deletes `.ouro` or resets Git. Its output explains that localhost belongs to the user's own machine; the terminal remains open. Preparation deliberately runs fresh on each invocation; no guessed stale build cache is advertised.

## Acceptance

| ID | Observable behavior |
|---|---|
| FRL01 | Remote default branch is main, master is renamed, dev exists with the released ancestry, original worktrees/data remain intact |
| FRL02 | Existing66 commit subjects and retained branches pass the documented English/Conventional rules; malformed future inputs fail meaningful tests |
| FRL03 | Launcher handles spaces/Unicode/metacharacters as literal argv, runs only the ordered phases, stops on failure and forwards cancellation without starting another phase |
| FRL04 | Exact committed ZIP excludes runtime/private/untracked data and carries matching manifest/checksums; tracked forbidden paths reject packaging |
| FRL05 | Fresh ZIP without Git/node_modules installs/builds/starts locally; project creation and restart retain the same committed state; MCP bridge works from extracted paths |
| FRL06 | Full local and actual GitHub CI gates pass for the reviewable release; the app's71 production browser cases remain green |
| FRL07 | main release PR is merged only after acceptance, tag/release reference the released commit, uploaded assets match checksums and the public download URLs work |

## References

[Conventional Commits1.0.0](https://www.conventionalcommits.org/en/v1.0.0/), [SemVer2.0.0](https://semver.org/), [GitHub branch rename](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-branches-in-your-repository/renaming-a-branch), [GitHub releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases), and the accepted [alpha.15 evidence](../plans/client-onboarding.md). Relevant actual guide sections and RED/GREEN evidence are recorded in the implementation journal.
