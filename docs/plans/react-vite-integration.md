# React/Vite эпик · интеграционный снимок

Дата: 2026-11-05. Снимок принятой ветки `codex/react-vite-epic` на `0db3f243a0117dbeeb12f387c2865a9fe09fa249`. Эпик **IN_PROGRESS**, draft PR36 в dev; dev/main ещё не переключались. Принятые D01–D16 не переоткрываются. Этот журнал описывает фактический состав; нормы остаются в [решениях](../proposals/react-vite-migration/decisions.md) и [стеке](../proposals/react-vite-migration/react-stack.md).

## Что интегрировано

| Область | Принятый результат | Граница evidence |
|---|---|---|
| HTTP/service | Все47routes/59methods, Hono transport, URI/headers/body/SSE/auth compatibility, resources/runner и явный lifecycle | Built runtime и реальные TCP/SQL/PG/browser проверки; финальный installed/hosted cutover ещё впереди |
| Project client | Один ProjectSession/snapshot adopter/SSE owner, scoped Query, frozen intents и durable receipt recovery | Смена scope/access, response loss/corruption, stale callbacks и exact retry квалифицированы; cache не является серверной истиной |
| Read catalogs | Identity/workspace/account reads с полными source/actor/project/access/host scope keys | Typed ports/DTO и cancellation/lease ownership; это не полный набор semantic операций для native host |
| Physical architecture | Pure ports/DTO, snapshot/subscription boundaries, public `entities/work` и guard против reverse legacy/deep imports | Физическое разбиение остальных UI/features/pages не завершено; selector `entities/agent-proposal` отдельно на CI |
| Tailwind | Семейства Human View/workspace/graphs/process/runtime/participants/integrations/proposals/agents/history/Impact/Lessons/verification и последние4static preview expressions | Каждый срез имеет собственные before/after/functional evidence и ограничения; общие112rules ещё ordinary debt |
| Profile ownership | Committed no-overwrite marker, same-process inode protection, claim-before-validation и bounded native contention | Actual Linux RED→GREEN,200pairs, Windows/Linux cases и mandatory CI; не power-loss/adversarial/noncooperating-old-binary гарантия |
| Runtime environment | Node24.19 admission, explicit-root/phase env adapter с exact parser versions | Actual differential/rejection witnesses; Next internal cache/HMR не портируется, env files владельца не читались |
| Independent source build | Один immutable committed tree, same-commit protocol, один frozen npm graph без Next и ancestor dependencies | Отдельный mandatory Linux SOURCE_BUILD job PASS; end-user generation launcher/ZIP ещё не квалифицированы |

Результат последней style inventory: **2ordinary CSS files/112rules,3inline files/6expressions**, production technicalInline exceptions0. Оставшиеся expressions — Impact meter, три onboarding geometry и две textarea height. Они не объявляются допустимыми автоматически. Общие native/shared defaults переписываются отдельной историей; перенос этих правил и review expressions нужны до styles:final PASS.

## Точные последние integration gates

| История | Qualified head / принятый PR | Обязательные jobs |
|---|---|---|
| Runtime presentation | adfe46b / [57](https://github.com/QahNaaRlN/ouro/pull/57) | checks/postgres/browser/presentation PASS |
| Impact/Lessons | d2d0ef3 / [61](https://github.com/QahNaaRlN/ouro/pull/61) |4PASS |
| Agent connections | c3987b9 / [59](https://github.com/QahNaaRlN/ouro/pull/59) |4PASS |
| History/recovery | de542c8 / [60](https://github.com/QahNaaRlN/ouro/pull/60) |4PASS |
| Verification |0e7e73a / [62](https://github.com/QahNaaRlN/ouro/pull/62) |4PASS; CI-only Git report growth исправлен в fixture без изменения256k command limit |
| Work entity |135d83f / [63](https://github.com/QahNaaRlN/ouro/pull/63) |4PASS |
| Profile contention |7397c05 / [64](https://github.com/QahNaaRlN/ouro/pull/64) |4PASS, включая actual Linux SPP16/старые mutex/lifecycle cases |
| Actual Vite/service |cb51261 / [58](https://github.com/QahNaaRlN/ouro/pull/58) |4PASS |
| Environment compatibility |c724ca3 / [65](https://github.com/QahNaaRlN/ouro/pull/65) |4PASS |
| Source delivery |00f206e / [66](https://github.com/QahNaaRlN/ouro/pull/66) |consumer-source/checks/postgres/browser/presentation5PASS |
| Static preview |76c8f63 / [67](https://github.com/QahNaaRlN/ouro/pull/67) |5PASS |

Source job [126809925511](https://github.com/QahNaaRlN/ouro/actions/runs/41897236221/job/126809925511) зафиксировал Node24.19/Linux,238consumer inputs и `sourceRepositoryInstallAbsent:true`. Materialization, ci при actual NODE_ENV=production/includeDev, foreign-cwd fresh builds, protocol ESM/CJS/types/CLI, JS/CSS/font integrity, negative HTTP matrix, SSE, issued MCP, durable restart/exact receipt, runner3/navigation6 и graceful shutdown — PASS. HTML672/672bytes и GET/HEAD integrity — PASS. Это qualification source tree, не end-user release.

Windows strict HTML transport evidence остаётся отдельным **FAIL**:672expected/1161received с локальной HTML injection. Source handler/Web pipeline и JS/CSS/font bytes прошли свои проверки; окружение/заголовки не менялись ради обхода. Linux PASS не переписывает Windows результат. Исходные fixture failures, intermediate failed fixes, antialiasing-only deltas, исходный narrow overflow и manual test cleanup сохранены в журналах соответствующих историй.

## Открытый остаток

1. Закончить112ordinary shared/native rules и квалифицировать шесть geometry expressions точными policies; общий final style gate ещё не пройден.
2. Завершить physical hFSD по ответственности; не переносить целый Home в один widget. Оставшиеся semantic операции и coherent host composition не подменять generic ambient HTTP fallback.
3. Интегрировать frontend error-policy/boundary/capture с текущими authority/UNKNOWN guarantees. Backend и первые capture points уже существуют; глобальная framework-console очистка, внешний monitoring и все legacy async handlers пока не объявлены готовыми.
4. Подключить typed Russian i18next/react-i18next и реальный TanStack Form/Zod boundary. Temporal adapter для новой calendar logic требует отдельной compatibility проверки; существующие timestamps не переписывать автоматически.
5. Завершить generation envelope launch/start/build, stable generation-pinned MCP, documented installed CLI, independent ZIP/foreign-cwd/restart и closed old-profile rehearsal. Directory prototype или SOURCE_BUILD не означают full P5.
6. Перевести developer graph на pnpm workspaces с одним lockfile; сохранить отдельный npm consumer graph. Turbo только после явных inputs/outputs/env/cache contracts. ESLint/format/naming/JSDoc checks и delivery универсальных правил ещё требуют завершения.
7. Подготовить explicit embedded export без createRoot/browser router/ambient host authority, затем удалить Next/temporary aliases и выполнить final combined unit/browser/PG/package/data gates. Только после этого PR36 может переходить в dev; main/deployment/native owner acceptance остаются отдельными полномочиями.

Исходная dirty main worktree и реальные пользовательские profiles/env/DB не изменялись. Все перечисленные runtime/SQL/browser проверки использовали собственные изолированные fixtures. Наличие этого снимка не переводит открытые этапы в COMPLETE.
