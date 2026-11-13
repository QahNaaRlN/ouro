# C2-S1: журнал pages pilot (Methodology)

Дата: 2026-11-13. Статус: **LOCAL_QUALIFIED / CI_PENDING**. Контракт story: [c2-client-architecture.md](../specs/c2-client-architecture.md) (PR83, до своего слияния остаётся кандидатом) и исходный SDD `codex/methodology-page`. Этот журнал самостоятелен и не дублирует общий журнал C2; после интеграции PR83 записи переносятся туда по решению review.

## C2-S1. Pages pilot: перенос экрана Methodology

Дата: 2026-11-13. Ветка `codex/c2-s1-methodology-page`, base `1fe3ee1063b6fabc62b246404c692c39bcbe9b16`. Исполняется принятый контракт из [SDD](../specs/c2-client-architecture.md) и исходный SDD `codex/methodology-page`.

### Re-base

Исходный срез готовился против `6595e2e`; входы `app/page.tsx` и `app/human-view/history-presentation.ts` с тех пор изменились (Prettier-нормализация, переименование `useIdentitySessionQuery`, JSDoc в Home). Поэтому перенос выполнен заново против текущего epic, а не копированием остановленных dirty-файлов. Содержательный состав переноса не изменился.

### Состав

- Новые файлы: `packages/frontend/src/pages/methodology/{index.ts, ui/MethodologyPage.tsx, ui/methodology-presentation.ts}`. Слой `pages` уже известен архитектурной проверке; отдельной регистрации не потребовалось.
- `app/page.tsx`: импорт `MethodologyPage` через public API среза, удаление тела `Methodology`, замена callee; прочие импорты и поведение Home сохранены.
- `app/human-view/history-presentation.ts`: удалён перенесённый `humanMethodology`; `humanHistory` и остальное без изменений.
- `source-quality-debt.json`: точечное обновление записи `app/page.tsx` (contentHash, смещённые строки/offsets четырёх сохранённых findings); disposition `close-in-c2-c3`, formatDebt и чужие записи не изменены.

### Проверки

| Проверка | Результат |
|---|---|
| Literal: блок humanMethodology | Byte-equal с исходником (нормализация CRLF) |
| Literal: тело Methodology и остаток Home | Идентичны с точностью до Prettier-оформления (whitespace/quote style/trailing commas) и переименования declaration; `.operations/c2s1-literal-proof.py` → LITERAL_PROOF_PASS |
| tsc root, web:typecheck, service:typecheck | PASS |
| check:architecture | 928 files, 0 violations, прежние 11 exact legacy edges сохранены |
| check:quality | 668 files, 919 findings, 338 formatterDebt, 0 errors; базис findings/debt не вырос |
| test:quality | 93/93 PASS, 0 skipped |
| styles:check | 2 ordinary CSS / 3 inline остаются, 0 violations |
| Next production build (webpack) | PASS |
| Production browser: methodology (M05–M08 ×2) + tailwind-methodology TWM01 | 6/6 PASS, 1.1m |
| Production browser: prototype (включая навигацию «Методология и источники») + tailwind-human-view TWH01 (capture экрана methodology, классы .methodology-intro/.methodology-articles) | 5/5 PASS, 30.7s |

Ограничение harness: dev-конфигурация Playwright в этом управляемом окружении не поднялась — Turbopack не может породить pooled node process («program not found»), GET / отвечает 500 без исполнения кода приложения. Это среда исполнения, а не дефект переноса; браузерная проверка выполняется production-путём (webpack build + start), как в прежних beta-приёмках. Первый webServer timeout 120s и занятый порт 3100 при повторе сохранены как история настройки, не как product FAIL.
