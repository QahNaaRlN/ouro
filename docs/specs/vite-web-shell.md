# Standalone React and Vite shell

Status: IN_PROGRESS. Date: 2026-11-04. Epic: `codex/react-vite-epic`; story: `codex/vite-web-shell`.

## Purpose

Provide a browser-only React entry built by Vite, with TanStack Router preserving the existing UI URLs: `/`, `/projects`, `/projects/help`, `/projects/:projectId` and `/projects/:projectId/members`. The legacy `/` Human View remains an independent screen. Existing domain behavior and UI are reused while the subsequent hFSD and Tailwind stories move their ownership explicitly.

The owner authorized implementation of accepted D01–D16 and a full Tailwind CSS 4 rewrite. This story establishes the new web composition root; it does not declare the full migration, style rewrite, native bridge or production cutover complete.

## Acceptance

| ID | Observable behavior |
|---|---|
| VWS01 | Vite creates static browser assets with no Next runtime or server implementation in the bundle |
| VWS02 | All five existing UI routes open directly, navigate without a full document reload and support browser back/forward |
| VWS03 | The `/projects` layout owns one existing workspace session provider across its child routes; a project ID is decoded and passed to the existing client screen |
| VWS04 | Ordinary links retain anchor behavior: modified clicks, target, downloads, external URLs, fragments and accessible names |
| VWS05 | Explicit `/api` proxy configuration supports development and isolated parity testing; unknown API/assets do not become successful SPA HTML responses |
| VWS06 | The build rejects browser imports of server/Node modules, and the initial compatibility adapter accepts only the existing finite Next Link/push surface |
| VWS07 | Strict web TypeScript, production build and real-browser navigation checks pass on isolated test storage |

## Transitional boundary

The existing client screens still live in `app`/`components`. Two exact Vite aliases adapt their existing `next/link` and `next/navigation` imports to TanStack Router. No Next package is used by the new runtime. These aliases are a finite migration bridge, to be removed when the frontend public APIs and navigation dependency are moved in their own story. They are not a permanent embedded contract.

Project query navigation has an explicit UI location port (read/push search and change subscription). The web shell implements it through its router, retaining stable history identity for Back/Forward and scroll restoration. The existing Next shell temporarily keeps its native browser implementation; the shared project screen does not import TanStack or inspect private router state fields. This boundary replaces direct raw pushState inside the shared screen.

API origin is supplied by process configuration of the local Vite development/preview server, never by the browser selecting an arbitrary service or file. The old Next server can provide the API only during isolated comparison; the final service owns all storage at the atomic cutover. The new shell does not open PGlite or a user profile.

## Versions and checks

Retain locked React/React DOM 19.3.1 and TypeScript 5.9.3. Qualify Vite 7.3.7 and `@vitejs/plugin-react` 5.1.4 on repository Node 24.19.0; the chosen Vite line avoids an unrelated bundler-major migration. TanStack Router 1.170.46 supports React 19 and Node >=20.19. Versions were checked against the official npm registry, and behavior against the [Vite 7 guide](https://v7.vite.dev/guide/) and [TanStack Router documentation](https://tanstack.com/router/latest/docs/guide/creating-a-router).

Record actual checks and remaining work in the [journal](../plans/vite-web-shell.md). Existing server and launcher tests keep their current runtime until their separate cutover story.
