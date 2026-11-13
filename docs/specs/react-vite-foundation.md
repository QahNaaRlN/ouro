# React and Vite migration foundation

Status: IN_PROGRESS. Date: 2026-11-04. Epic: `codex/react-vite-epic`; atomic story: `codex/react-vite-foundation`.

## Scope and authority

The owner accepted architecture decisions D01–D16, authorized implementation through an isolated epic with atomic feature branches, and additionally required replacing ordinary application CSS with Tailwind CSS 4. The accepted [architecture](../proposals/react-vite-migration/README.md) is the basis for this story. The source is `origin/dev@3f8c986a8a5ddf272afc2ec8c08bc042b369d683`; its tree equals released `main@c369079294939a7890567b129495aae34090968b` at preparation.

This first story captures compatibility boundaries and makes the migration reviewable before changing the application runtime. It does not migrate storage or enable a native host. Production profiles and existing user workspaces are outside the test data scope.

## Acceptance criteria

| ID | Observable result |
|---|---|
| RVF01 | The accepted architecture and explicit full Tailwind 4 rewrite requirement are committed on the epic through an atomic branch; approval, implementation and validation remain separate |
| RVF02 | The checked-in HTTP baseline covers all 47 route files, their explicit methods, Next implicit HEAD/OPTIONS/405 behavior and the critical auth/cookie/body/stream/job constraints |
| RVF03 | A read-only inventory checker detects added, removed or changed route/method contracts rather than silently accepting a stale baseline |
| RVF04 | The following portable-contract story has explicit machine-checkable boundary requirements, typed client ports and negative import fixtures; its implementation and evidence remain in that separate atomic branch |
| RVF05 | Git workflow defines atomic branch → epic → dev → release/main; no atomic branch is merged directly into main/dev and no protected history is rewritten |
| RVF06 | Meaningful tests demonstrate rejected stale inventories, then pass on the intended implementation; existing relevant protocol/domain/stream behavior remains green; forbidden-import RED/GREEN belongs to the separate portable-contract story |
| RVF07 | Each following story has an independent branch, scope and verification evidence; Tailwind migration changes actual component classes and does not retain ordinary CSS as a bulk @apply translation |

## Compatibility requirements

The legacy `/` Human View is a real separate interface and remains in scope alongside `/projects`, project detail, help and member routes. Project GET, commands and SSE must still use one admission point for a shared confirmed snapshot. MCP's current HTTP contract is finite JSON, not an assumed SSE endpoint.

Preserve multiple Set-Cookie values, raw GitHub webhook bytes, method negotiation, byte limits, command receipts and UNKNOWN after possible commit. Only one process owns an embedded PGlite directory. New HTTP qualification uses isolated injected fixtures and a loopback listener without opening a user profile.

The complete style migration covers application global CSS, CSS modules and static inline presentation styles. Minimal theme/base/font declarations, keyframes that cannot be represented by built-in utilities, third-party library CSS and computed runtime geometry have explicit narrow boundaries and must not conceal remaining ordinary component CSS. Color/theme, responsive behavior, focus, reduced motion and graph interactions remain observable compatibility requirements.

## Verification

Use the repository-pinned Node.js 24.19.0. Record RED/GREEN results for RVF03 and relevant existing tests in [the story journal](../plans/react-vite-foundation.md). Full migration completion requires the later runtime/browser/package/native gates from the accepted plan; this story cannot claim them.
