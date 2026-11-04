# Tailwind migration completeness checks

Status: IN_PROGRESS. Date: 2026-11-04. Story: `codex/style-migration-gates`; epic: `codex/react-vite-epic`.

The owner requires all ordinary application CSS, CSS modules and static inline presentation to be rewritten to Tailwind CSS 4. The initial primitives story deliberately leaves a finite legacy remainder. This story makes that remainder observable and prevents new ordinary styling from silently escaping it. It is an audit/check implementation, not a claim of finished conversion.

| ID | Observable criterion |
|---|---|
| SMG01 | A read-only CSS/TypeScript AST inventory finds own CSS files and frontend JSX/graph style declarations without executing application code |
| SMG02 | Each remaining ordinary CSS file/style expression has an exact owned migration-debt record; added or changed unreviewed styling fails the check; stale records fail |
| SMG03 | Technical Tailwind theme/source declarations, minimal documented base/fonts, explicit external CSS and required keyframes are distinguished from ordinary component styling; bulk @apply is forbidden |
| SMG04 | Final mode fails while any legacy layer, ordinary CSS/module or ordinary inline-style debt remains; it cannot treat a transitional PASS as full conversion |
| SMG05 | Meaningful positive/negative fixtures cover new CSS, changed/stale debt, modules, inline/graph styles, theme/base abuse, @apply and final-mode refusal; the actual repository inventory is checked in CI |

The initial debt ledger records exact normalized source fingerprints and a responsible family (legacy Human View, workspace, graphs or specialized panels). Updating it is a reviewable source change, not automatic acceptance. The tool never regenerates or expands the ledger as part of `check`.

Dynamic runtime geometry and host theme variables may eventually remain only as narrow, explained technical exceptions. There are no blanket graph/component/file exemptions. The final criteria from the accepted architecture remain authoritative; visual/browser fidelity is independently required and cannot be established by an AST inventory.

Use exact Node 24.19.0, the locked TypeScript and PostCSS parsers. Evidence and limitations belong in [the journal](../plans/style-migration-gates.md).
