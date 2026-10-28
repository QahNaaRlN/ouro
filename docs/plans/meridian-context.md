# SDD/TDD · OURO-ENG-000010

[Контракт](../specs/meridian-context.md) зафиксирован коммитом edca708 до реализации.

| Проверка | RED | GREEN |
|---|---|---|
| Parser/mapping | 0/4: операции импорта отсутствовали | 4/4: точный synthetic DTO, неизвестные поля/flags/pins, UTF-8/duplicate keys/u64/size/depth, пути, mapping verification |
| Typecheck | Ошибки narrowed pair и проверки отсутствующих полей в тесте | Исправлена типизация после полноценной проверки пары; typecheck успешен |
| Domain/store/UI | Не выполнено | Не выполнено |

Адаптированы непосредственно прочитанные pure validators work-scope.ts и reference coherence из project-work.ts. Нативный transport/host reader не скопирован. Дополнительный scanner отклоняет duplicate JSON keys до потери информации в JSON.parse; byte decoder не скрывает BOM и ошибочную UTF-8 последовательность. Ограничение depth64 — дополнительная граница Ouro. Успех этих проверок не подтверждает подлинность документа или связь с настоящим Meridian.
