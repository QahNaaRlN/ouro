# CSB · Публичные границы snapshot и HTTP subscription

Дата: 2026-11-04. Ветка `codex/client-snapshot-boundaries`, отдельный worktree от `f5a7caf181d62e5971368862dfa649f3c8bb0039`. Разрешён только этот физический перенос; итоговый CI, merge эпика и публикация не заявляются.

## Проблема и границы

Существующие `lib/project-snapshot.ts` и `lib/project-subscription.ts` — переносимые клиентские модули, которые ещё требуют двух точных `pureLegacyFiles` исключений. Snapshot также используется server HTTP receipt digest: сервер и клиент должны сохранить один compatibility normalizer. Subscription использует DOM Event/EventSource и существующий `/api/stream` URL, поэтому принадлежит HTTP adapter, а не semantic ports/core.

Перенести snapshot в `packages/client/src/lifecycle/project-snapshot/` и subscription в `packages/client/src/http/project-subscription/`. У каждого leaf — implementation и `index.ts` с explicit named exports прежних функций/типов. Все реальные потребители, в том числе server `lib/http-command-receipt.ts` и tests, импортируют leaf public API; общего client barrel, дублированной нормализации и server → frontend dependency не добавляется.

Старые `lib` файлы удаляются после обновления потребителей: это внутренние repo paths, не задекларированные exports устанавливаемого внешнего package. Документы предыдущих историй остаются историческими evidence. `components/workspace-project-view.tsx` получает существующий `ProjectConnectionStatus` из ports; exported subscription status остаётся структурно совместимым. Из guard удаляются ровно две старые записи, без нового allowlist/расширения разрешений.

## Совместимость и authority

Поведение, публичные имена, optional/null/union и mutability существующих типов сохраняются. Один adopter/Query owner, полная история, cursor, legacy empty-collection compatibility, digest, frozen command/request bytes, UNKNOWN, epochs, dispatch identity и current authorization не меняются. Подписка сохраняет sync admission до cursor advancement, bounded recovery/reconciliation, cancellation и cleanup. SQL/store/worker drain и ownership не изменяются.

`lib/client-project.ts`, другие legacy read helpers, HTTP API paths/methods/headers, DB/protocol/MCP schemas/versions, UI/CSS/Tailwind, release/launcher, Node/dependencies и Meridian host остаются вне этого среза. Физическое перемещение двух модулей не означает завершения hFSD или всей миграции.

## Наблюдаемая проверка

1. До переноса сохранить existing snapshot/subscription/session regression baseline. Это refactor без нового поведения; missing dependencies не считаются domain RED, новые implementation-mirroring tests не добавляются.
2. Runtime AST/transpiled statement comparison с каноническими EOL подтверждает тождественное исполняемое тело обоих модулей, исключая необходимые import path substitutions. Публичные named exports и типы проверяются strict compilation.
3. В актуальных executable/import sources нет старых путей; оба старых файла отсутствуют; один normalizer и ровно два удалённых whitelist entries. Historical HTTP inventory 47/59 и HRP finite adaptations не регенерируются.
4. Existing project-snapshot/live-review/session/HTTP/runtime/verification-legacy-receipt и HRP hash/SQL/TCP/epoch/UNKNOWN regressions проходят; architecture fixtures и strict root/web/service types сохраняют boundary checks.
5. Next/Vite/service production builds и реальный HRP browser loss→UNKNOWN→exact retry квалифицируют загрузку новых leaf API. Только synthetic memory/temp fixtures; production profiles и host environment не меняются.

Linux/PostgreSQL и полный CI обозначаются только по фактическому запуску. В этой ветке предусмотрен scoped local commit, без push/PR; root проводит peer review и интеграцию.
