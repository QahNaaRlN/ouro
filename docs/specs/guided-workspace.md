# Guided workspace and Ouro identity

Target: `v0.1.0-beta.2`. Product UI refinement; the independent protocol remains `0.1.2`.

## Problem and scope

The first beta has working project/agent controls but also static chrome that looks interactive, and it assumes a new operator knows where to start. Remove nonfunctional chrome, introduce contextual read-only walkthroughs, and replace the generic ring mark with an original snake/graph identity. Preserve every existing project, event, connection, assignment and acceptance rule.

## Observable acceptance

1. Human View no longer shows a fake workspace switch, personal avatar, marketing blocks, duplicate slogans or static prototype decoration. The actual participant name and operator/participant role remain available as session information. The project breadcrumb navigates to `/projects`. Working navigation, filters, theme, graphs, status badges, history cursor and commands remain usable.
2. The projects shell keeps one functional branded home link. Remove its decorative footer/PROJECTS wordmark suffix and catalog heading ornament. Step numbers without behavior are unnecessary; descriptive headings remain.
3. Catalog and project dashboards offer an explicit `Обучение` button and a small dismissible first-visit invitation. A tour never starts automatically. Invitation/tour progress is versioned per browser and tour kind, not per project, and gracefully tolerates unavailable/corrupt browser storage.
4. Starting a tour dims the surrounding screen and visibly highlights the actual UI target. The tooltip names the step, explains the next real action and provides previous/next, skip/close and finish controls. The catalog covers folder selection, saved projects and agent help. The project tour covers connection, task/DoD, roadmap, human decisions and live events; Flow guidance is included only when a real selected spec exists.
5. The walkthrough is read-only: it sends no domain POSTs, creates no sample tasks, registrations or project data, grants no agent permissions and never marks human acceptance. Temporarily opening an existing setup disclosure for guidance is allowed; restore its previous presentation on exit.
6. The tooltip has modal semantics and an accessible name, traps focus, supports Escape, and restores focus to its trigger. Background controls remain inert. Scroll/resize and smaller viewports update the target/tooltip geometry without horizontal page overflow. Respect reduced-motion preferences. Missing targets do not cause a crash or an invisible blocking overlay; give a usable exit and omit unavailable optional steps.
7. The new identity depicts a readable snake loop with graph nodes and one branch, connecting the Ouroboros concept to work → evidence → human decision → next iteration. Use a scalable UI mark and favicon. Keep it in identity/navigation locations, with correct accessible labeling, rather than scattering decorative copies across content. Document its meaning and design references.
8. Update README, changelog, walkthrough/user documentation and release notes for beta.2. Publish an annotated version tag plus exact-commit source ZIP, protocol tarball, manifest and checksums after the accepted CI gates. Verify public asset downloads. A local beta remains a local installation, not a public hosted dashboard.

## Compatibility and authority

No database, event schema, MCP contract or agent permissions change. Browser onboarding storage contains presentation preferences only, without tokens, project paths or task data. Preserve all append-only histories, pending command recovery, SSE behavior and human DoD decisions. No rewriting shared Git history, forced branch updates, user settings changes or deletion of user folders/databases.

## Verification

Use SDD before code and meaningful RED→GREEN browser checks against the previous accepted application. Cover persistence/restart, no writes, keyboard/focus, mobile geometry, empty and populated projects, blocked storage and missing targets. Existing complete unit/integration, protocol, TypeScript, production build and production E2E gates remain required. Native desktop client/model sessions retain the previous release's stated verification limits.

The implementation journal records tested references, RED/GREEN evidence, independent review, release commit, CI and download verification.
