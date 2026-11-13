# C2: журнал клиентской архитектуры

Дата: 2026-11-13. Статус: **SPECIFIED / IMPLEMENTATION_NOT_STARTED**. Спецификация: [c2-client-architecture.md](../specs/c2-client-architecture.md). Base: epic `1fe3ee1063b6fabc62b246404c692c39bcbe9b16`.

## Записанные факты

- SDD составлен read-only по Git на exact base; установка, runtime, browser и проверки не запускались: **ALL_RUNS_NOT_RUN**.
- Физическая инвентаризация на base: `packages/frontend/src` — app/api/entities/features/shared, без pages/widgets/embedded; старое приложение — `app/` 7 tsx routes, `components/` 69 записей; architecture baseline — 11 exact legacy edges `framework-boundary` owner P3, все внутри старого приложения, удаление относится к C6.
- Исходные SDD для adoption: `codex/methodology-page` и `codex/assign-work-form`; их base устарели, re-base обязателен до source edits.

## Состояние stories

| Story | Состояние |
|---|---|
| C2-S1 pages pilot (Methodology) | SPECIFIED, adoption не начат |
| C2-S2 Form pilot (assign-work) | SPECIFIED, adoption не начат |
| C2-S3 semantic ports completion | PLANNED |
| C2-S4 widgets и pages composition | PLANNED, зависит от C2-S1 |
| C2-S5 scope isolation | PLANNED, зависит от C2-S1 |
| C2-S6 typed RU continuation | PLANNED |
| C2-S7 D07 data states | PLANNED |
| C2-S8 error ownership и D09 | PLANNED |

Реализация, evidence, review и интеграция каждой story записываются здесь отдельными разделами. Закрытие этапа C2 фиксируется в [completion progress](react-vite-completion-progress.md) только по критерию выхода этапа.
