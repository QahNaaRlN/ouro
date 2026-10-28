# OURO-ENG-000006 · Изменение исходных ожиданий

SDD · 28.10.2026 · реализация после GitHub/архива уроков. Формула **явно принята пользователем**: [согласованные правила, источники и примеры](../proposals/drift-metric.md). Внутренняя подготовка тестов/модуля не означает публикацию раньше предыдущих пакетов.

## Контракт

Чистый `calculateExpectationImpact(events,{projectId,c0,c1,specIds?})` использует полный committed stream и авторитетный replay. AlgorithmId `expectation-impact/v1`. B фиксируется на c0: выбранные существующие спеки с активной ревизией, не invalidated, включая done. K — уникальные baseline-спеки, затронутые в (c0,c1] активацией отличающегося от baseline контракта, инвалидацией либо изменением обязательных предпосылок. N=|B|, percent=100K/N при N>0, без весов. Возврат к baseline не стирает факт изменения.

Сравниваются goal,dod,constraints,assumptions,risks,inputs,flow и mandatory prerequisites; title/comment/технические поля и координаты исключены. DoD и Flow nodes/edges сравниваются как множества стабильных ID с предметными полями, порядок не влияет. Строки нормализуются только по переводам строк и краевым пробелам. Отсутствующий optionalflow допустим и не нормализуется в сохранённой ревизии. Новые спеки внеB не меняют denominator и показываются отдельно. Questions/failedexecution/rejectedvariant не увеличивают K сами по себе.

Результат содержит algorithmId/project/scope/c0/c1, baselineIDs/revisions/dependencies, K,N,percent|null, reason|null, changedSpecs с eventID+version и полями/причиной, новые утверждённые/черновые спеки и отдельные проверяемые counts. Нет базы→null с объяснением, неполная/недоступная/противоречивая история или неизвестный scope→unknown/null, без0% и без придуманной оценки агента. Расчёт не пишет domain events.

UI показывает прежде всего «K из N исходных спек», затем процент с1десятичным знаком, выбранные cursor-границы и ссылки на факты/изменённые поля. Baseline выбирает человек; его browser view preference не становится domain authorization. Пересчёт одинаковых входов детерминирован, snapshot отчёта можно экспортировать JSON с основанием и версией. Никакого хорошего/плохого порога и автозапрета работы.

## AC/TDD

M01 исходная fixed cohort и новые цели отдельно. M02 изменение+возврат, несколькоизмененийоднойспеки, invalidation и mandatory/nonmandatory dependency. M03 title/comment/перестановки/эквивалентные строки не меняют K, новый DoD/Flow меняет. M04 Question/failure/approval без сменыожидания дают0приN>0. M05 N0/gap/schema/cursor/scope дают null/unknown. M06 report event provenance/reopen/dedupe/окно/историческийcursor. M07 browserbaseline/count/source/export+typecheck/regressions. Сначала actual RED, затем GREEN; секреты и guessed estimates отсутствуют.
