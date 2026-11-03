# Standalone web shell

This package builds a static React client with Vite and TanStack Router. It currently reuses the existing screens through two finite legacy navigation aliases; no Next runtime is included in the browser build. Full hFSD ownership and service cutover are tracked separately in the [migration plan](../../docs/proposals/react-vite-migration/migration-plan.md).

Use repository Node 24.19.0. In this intermediate npm installation tree:

```sh
npm ci
npm --prefix apps/web ci
npm run web:build
npm run web:typecheck
```

Set `OURO_WEB_API_ORIGIN` to the explicitly selected API origin in the local development/preview process, then run `npm run web:dev` or `npm run web:preview`. The browser uses same-origin `/api`; the server-side development proxy preserves Host, cookies and streams. Production distribution will serve the static output with the extracted service; Vite preview is a verification tool, not the production service.

`npm run web:test:e2e` checks the built web assets against a previously built existing API (`npm run build`) with a new temporary data directory. It uses ports 3467/3468 and never opens the user's working profile. Direct routes, SPA navigation/history, project/member screens, the independent legacy `/`, modified new-tab clicks, fragments and API/static-error boundaries are covered.
