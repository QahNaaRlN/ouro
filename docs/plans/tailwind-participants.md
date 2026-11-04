# Журнал Tailwind: участники

Дата: 2026-11-04. Статус: IN_PROGRESS. Ветка `codex/tailwind-panels` от эпика `d3949fd`.

Порядок: исходный production browser baseline на отдельном профиле → явные JSX utilities → удаление stylesheet/import → сравнение тех же данных → C01/C02, typecheck/build, finite style gate → review и merge в эпик.

Реализовано: обычные 31 правила `participants-panel.css` удалены, обе реальные семьи потребителей используют JSX utilities через явный `participant-presentation.ts`. Поведение запросов и credentials не менялось. Для аккаунта обнаружен прежний контекстный каскад: legacy использует flex/15px heading, workspace — grid/19px heading и другие field spacing. Первый rendered comparison выявил645 отличий метрик у аккаунта. Они устранены типизированным `surface`, который передаётся из workspace composition; DOM inspection и глобальные descendant overrides не используются.

Фактические проверки на Node24.19.0 и отдельном порту3368:

- Исходный реестр участников: production build и browser1/1 PASS; `.operations/before/` содержит4 PNG/геометрию. Один fixture profile `.operations/participant-visual-profile` сохранён для точного сравнения ID/дат.
- Исходные три режима email-входа и membership: browser1/1 PASS; `.operations/account-before/` содержит16 PNG/геометрию. Здесь явно подставлены только GET-ответы для presentation; это не проверка backend-авторизации. Операции доступа в этом fixture не выполняются.
- Финальный результат: **20/20 PNG побайтово совпадают**, все записанные geometry/font/color/padding/margin/gap/border metrics совпадают без нормализации. Обе темы и viewport1440×1000/390×844; реестр включает active/revoked. Три финальных PNG просмотрены отдельно, включая narrow membership и keyboard focus участника.
- Реальные неизменённые C01/C02 на втором свежем `.operations/participant-functional-profile`: **2/2 PASS (13.7s)**. Проверены две независимые идентичности и авторство, одноразовый ключ и скрытие, отсутствие credential в browser storage, отзыв cookie read/write и отказ bootstrap восстанавливать demo identity.
- Production build после финальной surface-коррекции PASS. Style gate: **19 обычных CSS/1888 rules;11 inline files**, zero violations. Из ledger удалён только фактически удалённый CSS. Пять ProjectSwitcher expressions в `project-account.tsx` побуквенно совпали по AST; обновлён только hash всего файла, изменённого account utilities. Их перенос по-прежнему принадлежит workspace-истории.

Независимый read-only review подтвердил неизменность AST девяти handlers участника и одиннадцати handlers аккаунта, всех permission/readOnly/disabled/error/role условий и пяти ProjectSwitcher style expressions. Единственное замечание — язык новых JSDoc — исправлено на русский по D11. После установки существующего child lockfile архитектурная проверка прошла772 файла/zero violations/16 точных исторических edges; первоначально она обнаружила четыре отсутствующих Router module в ещё не установленном apps/web, source guard не ослаблялся. Conventions и diff whitespace — PASS. Vite strict TypeScript и production build PASS; начальный chunk304.13kB/98.71kB gzip, warnings о размере нет. Новый visual assertion на отозванный badge ограничен конкретной fixture article, чтобы другие участники общего CI-профиля не делали locator неоднозначным; продукт не менялся.

Артефакты являются локальным evidence и игнорируются Git. Долг после отдельного workspace merge будет пересчитан по объединённому дереву; он не объявляется уже применённым здесь. Остальные специализированные панели, legacy Human View и графы остаются отдельными историями полного перевода. Рабочие профили пользователя не использовались. Peer review PASS; публикация PENDING.
