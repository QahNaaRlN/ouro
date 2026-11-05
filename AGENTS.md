<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Принятые требования Ouro

Канон находится в этом репозитории: [D01–D16](docs/proposals/react-vite-migration/decisions.md), [React/TypeScript stack](docs/proposals/react-vite-migration/react-stack.md), [границы модулей](docs/proposals/react-vite-migration/target-architecture.md), [переносимость всех 25 правил](docs/proposals/react-vite-migration/rules-portability.md). Внешний CBS checkout для выполнения требований не нужен; эти ссылки не заменяют пользовательские полномочия и текущий scope задачи.

Существующие команды: `pnpm run check:architecture`, `pnpm run check:conventions`, `pnpm run typecheck`, `pnpm run web:typecheck`, `pnpm run service:typecheck`, `pnpm run protocol:check`. Они имеют разные области. Новые quality configs пока являются bootstrap: до actual positive/RED, dependency admission и включения gates они не означают действующий lint/format PASS. Generated Next block сохраняется до C6.
