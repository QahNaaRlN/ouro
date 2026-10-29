# Contributing to Ouro

Use English for branch names, commit messages and pull request titles/descriptions. Product text and user documentation may remain Russian. Keep existing shared history intact: do not rewrite old commits to change their language.

## Branch workflow

| Branch | Purpose | Pull request target |
|---|---|---|
| `main` | Accepted releases | Release and hotfix changes enter here |
| `dev` | Integration for the next release | Feature, fix and documentation changes enter here |
| `feat/<name>`, `fix/<name>`, `docs/<name>` | Bounded changes started from `dev` | `dev` |
| `chore/<name>`, `refactor/<name>`, `test/<name>`, `ci/<name>`, `build/<name>`, `perf/<name>`, `revert/<name>` | Maintenance changes started from `dev` | `dev` |
| `release/<semver>` | A reviewed release candidate, such as `release/0.1.0-beta.1` | `main` |
| `hotfix/<name>` | A correction started from the released `main` | `main` |

Use lowercase English kebab-case for `<name>`, for example `feat/agent-clients` or `fix/project-stream-recovery`. Do not add spaces, Cyrillic text or nested path segments. Release versions follow [Semantic Versioning 2.0.0](https://semver.org/).

After a release or hotfix, bring the accepted `main` changes back into `dev`. Preserve feature branches needed for existing work. Do not force-push or delete `main` or `dev`.

## Commit and pull request messages

Follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```text
feat(mcp): add Claude client configuration
fix(stream): preserve the original project cursor
docs: explain local release installation
chore(release): prepare v0.1.0-beta.1
```

Use a supported type, an optional scope, an optional `!` for a breaking change, and a concrete English description. Write commit bodies and PR descriptions in English, explaining the resulting behavior and relevant validation. Preserve human names and identity trailers as written; do not translate them.

Automated checks validate the branch format, Conventional Commit header and English ASCII subject text. They reject non-ASCII/Cyrillic subjects but do not recognize English grammar. Reviewers check the prose in message bodies. PR titles follow the same subject convention.

## SDD and TDD

Before implementation, describe the bounded problem, observable acceptance criteria, authority boundaries and compatibility expectations in `docs/specs/`. Record implementation and verification evidence in `docs/plans/`.

For behavior changes, first demonstrate a meaningful failing test, then implement the behavior and verify the affected cases. A missing dependency or an unavailable server is not evidence that the intended behavior fails. Use tests that protect meaningful behavior; documentation-only corrections do not need implementation-mirroring tests.

Preserve append-only history, project scope and exact request receipts. Agent reports, human decisions, application of a decision, authorization, agent ACK and DoD acceptance remain separate facts.

## Validation and review

Use Node.js 24, the release's tested runtime. Before opening a PR, run the checks appropriate to the change. The complete release gate is:

```sh
npm ci
npm run check:conventions
npm test
npm run typecheck
npm run protocol:check
npm run protocol:test-package
npm run build
npm run test:e2e:production
```

Production browser checks require Playwright's Chromium installation. See the repository's local setup instructions. Do not run a build and dev server in the same checkout at the same time.

CI exposes stable required checks named **`checks`** and **`browser`**. Report the commands and actual results in the PR, link the SDD and journal, and state material limits of the verification. A JSON configuration or SDK test does not establish that a user's desktop client or model account is connected.

Do not commit keys, credentials, `.env` files other than `.env.example`, `.ouro`, `node_modules`, `.next` or test/runtime artifacts. Keep users' folders, databases and client settings intact. A release archive must contain an exact committed source tree and pass its private-data audit.

## Releases

The first working release is a local beta. It provides a downloadable application for the user's computer and is not a hosted web service. Localhost belongs to the machine opening the URL. Native Windows/macOS behavior and authenticated model execution require their own evidence; Linux CI does not establish them.

Release candidates enter `main` only after the acceptance gates pass. Publish a versioned tag, manifest and checksummed assets from the accepted commit, following [GitHub's release model](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases). Keep the independent protocol version separate from the application version.
