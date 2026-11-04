# Tailwind 4: учёт исполнения процесса

Дата: 2026-11-04. Статус: IMPLEMENTED / BOUNDED_QUALIFICATION_PASS / REVIEW_ACCEPTED. История G3 `codex/tailwind-runtime` от проверенного G2 `3794aef`.

## Контракт

Перенести все 56 ordinary rules `components/flow-runtime.css` в явные readonly presentation recipes и собственный JSX. Панель владеет своими slots; SpecFlow владеет context/facts companions. Уже перенесённый G2 run-state/evidence приоритет сохраняется. Файл CSS удаляется полностью. Исходный долг:14CSS/853rules и6inline-files/17expressions; ожидаемый остаток13CSS/797rules при неизменном inline долге.

Команды, guards, request IDs, exact body/version/actor binding, UNKNOWN recovery, selected run, история, доступность, authority, query/session owner и callbacks не меняются. Общие стандартные HTML controls остаются конечным global debt. Новых exceptions и production test hooks нет.

## Доказательства до реализации

Отдельный сохранённый профиль и production Next oracle; реальные публичные команды создают только собственные тестовые данные. Для редких состояний test-only Vite renderer использует существующие production components, core read model, публичный RuntimeIntent Map и снимок собственного canonical profile. Команда проверки квитанции уже записана; renderer допускает только её точный повтор через настоящий client admission. Один контролируемый потерянный ответ проверяется после получения настоящей cached receipt. UUID overrides, synthetic canonical state, pixel masks и новые domain writes при сравнении запрещены.

Dark/light1440×1000/390×844, legacy/workspace: tracking, legacy/ready/running/failed/succeeded/history, выбранный переход, simulation, pending/posting/UNKNOWN/success, другое pending действие. Снимки renderer квалифицируют browser presentation; существующие full-app20 functional gates отдельно квалифицируют интеграцию. TWP01 покрывает SpecFlow context/facts и G2 evidence companions. Все56 selectors сопоставлены потребителям в журнале; 120 on* JSX expressions совпадают по AST.

Правильный ordered baseline renderer использует замороженное исходное дерево `3794aef`, с document/theme и workspace defaults до component CSS, как в настоящем Next layout. Начальные96 wrong-order кадров сохранены как диагностические, без claim actual workspace parity. Для simulation у собственного исходного прохода назначен agent owner; проверяется видимость настоящего synthetic-evidence текста, без подмены core view.

Фактическое сравнение:96/96 renderer PNG и4/4 actual workspace inspector PNG pixel-identical; все100 соответствующих metric sets точны. TWP01:96/100 PNG pixel-identical,4 dark desktop кадра имеют только12 AA pixels max2/255; все100 metric sets точны. Итого196/200 PNG exact; без масок или pixel threshold. Functional20/20 PASS в одном прогоне1.7m; strict Next/Vite TS/build PASS; architecture856/0/11;361 Tailwind candidates accepted actual compiler. После принятого bounded review из точного ledger удалена только запись flow-runtime.css; остальной долг не регенерировался.

После переноса: PNG без масок и computed styles, валидность настоящих Tailwind candidates, strict Next/Vite TS/build, architecture/style guards. Ledger меняется точечно после peer review. Полный React migration, native Meridian/SSO/production этим срезом не объявляются завершёнными.

[Журнал](../plans/tailwind-runtime.md).
