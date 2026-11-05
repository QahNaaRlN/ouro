# Tailwind 4 · проверка работы и статусы

Дата: 2026-11-04. Статус: IMPLEMENTED / BOUNDED_QUALIFICATION_PASS / REVIEW_ACCEPTED. Ветка `codex/tailwind-verification`, исходный commit `48804f8`. Срез следует принятым D01–D16 и дополнительному требованию полностью перенести обычные стили на Tailwind 4.

## Граница

Перенести `verification.css` (46 правил) и `work-status.css` (9 правил) на конечные recipes и явные UI slots. Владельцы — карточка пары, панель контракта/наблюдений и её собственные дочерние формы, статус работы. Roadmap/table consumers задают только нужные presentation slots; карточка не импортирует родителя или его context. Нельзя заменять React Flow controls/geometry, вычисление статуса, команды, проверки прав, сведения о результате или сценарии восстановления.

Сохранить внешнее оформление обеих тем и поверхностей, mobile, keyboard focus и reduced motion. Оборот карточки сохраняет обе грани, `inert`, `aria-hidden`, локальный override и отсутствие записей от навигации. Draft contract/inputs и выбранные ревизии не сбрасываются. Ручное подтверждение, импорт и настоящий runner остаются разными источниками результата; новая стилизация не повышает их статус.

## Последовательность и доказательства

1. Прочитать consumers, принятый стек и установленные CSS guides. Создать собственный профиль и immutable baseline реальных карточек, редактора и результатов. До production changes сохранить PNG/computed metrics и callbacks/non-presentation AST.
2. Перенести правила в локальные readonly Tailwind maps. Общие native defaults и чужие CSS families пока не удалять. Не использовать новый descendant cascade, `@apply`, глобальный important или бессодержательный CSS remnant.
3. Сравнить те же сохранённые состояния обеих тем на desktop/mobile; явно сохранить расхождения/исправления вместо подмены baseline. Проверить keyboard/reduced motion, существующие три verification browser paths и статусные варианты.
4. Root/web strict types, обе сборки, действительный compiler всех новых candidates, architecture/style guards и точная сверка ledger. Удалить только две полностью перенесённые записи. Полный CI отдельного PR обязателен до merge в эпик.

Рабочие профили, схемы данных, transport/MCP контракты и сторонний CSS не меняются. Этот срез не завершает весь Tailwind, физическую hFSD-структуру, consumer delivery, Next cutover или native Meridian acceptance.

Фактический результат: оба CSS-файла удалены полностью;3 локальных readonly presentation modules, typed optional Pair slots и собственные JSX utilities. 155 callbacks и non-presentation AST шести компонентов совпадают. Сохранённый собственный snapshot43 и реальные runner/import/manual receipts дают116 comparison кадров:115 pixel-identical,1 с10 AA pixels max1/255; все116 измеренных metric sets exact. Сюда входят12 selected/normal-motion/reduced-motion кадров; transform-only700ms сохраняется явно. Existing3 browser suites PASS одним финальным прогоном1.3m; verification SSR4/4 PASS,117 Tailwind candidates accepted; Next/Vite strict TS/build PASS,architecture870/0/11.

Квалификация mobile ограничена точным сохранением actual baseline:28 исходных narrow results/form кадров уже имели horizontal overflow и fullPage width547–548 приviewport390. После переноса размеры совпадают; это не доказательство полной mobile usability. Исходный дефект, промежуточные visual RED и последующий own-profile diagnostic drift сохранены в [журнале](../plans/tailwind-verification.md); UUID, clock, canonical facts и PNG не подменяются. После принятого peer review удалены ровно две CSS ledger entries; финальный Tailwind gate остаётся незавершённым.
