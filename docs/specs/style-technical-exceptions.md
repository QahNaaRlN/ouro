# STI · Конечные исключения технической inline-геометрии

Дата: 2026-11-04. Ветка `codex/style-technical-exceptions`, база `ca05037031bfa5abdb84a45d34e179efee5cafc2`. Дизайн одобрен root до кода. Это механизм и fixtures; production exceptions, UI/CSS и текущий migration debt не меняются.

## Контракт

`ouro-style-debt/v1` получает optional `technicalInline` array. Каждая запись содержит ровно `file`, whole-file `sha256`, `kind:'computed-geometry-custom-properties'`, `owner`, `reason`, `expressions:[{kind,sha256,count}]`, `dependencies:[{file,sha256}]`. Paths точные, root-relative, без glob/выхода из root; hashes нормализуют только EOL, count — положительный safe integer. Повторный file/expression/dependency, missing fields, unknown kind, stale context/dependency или неиспользованная dependency отклоняются.

Исключение применяется только к перечисленным expression IDs с **точным фактическим count**. В смешанном файле ordinary inline ledger явно содержит только остаток; пересечение technical/ordinary expressions запрещено. Новое выражение в approved file не получает разрешения. Никакого автоматического ledger update, автоповышения ordinary debt, file whitelist или visual approval.

Legacy `inventoryStyles` JSON и `{kind,sha256,count}` hashing/sorting остаются побайтно совместимыми с прежними ledger records. AST occurrences/context metadata разрешены только внутри checker. `remaining.inlineFiles` считает только файлы с ordinary residue; `--final` по-прежнему отвергает весь ordinary CSS/inline/legacy-layer остаток.

## Ограниченный AST resolver

Разрешена конечная форма CSS-variable geometry: direct object literals с literal `--custom-property` keys, same-file unique const initializers и named local/relative-import simple helpers, которые возвращают такой object либо conditional object/undefined. Поддерживаются parentheses, `as`, type assertions, `satisfies` и non-null casts. Каждый внешний helper в разрешённой цепочке должен иметь явный whole-file hash dependency. Циклы, ambiguous/mutable bindings, default/namespace imports, spreads, computed keys, ordinary `color`/`padding` и неизвестные functions запрещены. Source не исполняется.

DOM-исключение допускает только `.style.setProperty` с literal custom-property key и двумя arguments. `style=`, ordinary properties, cssText, setAttribute и Object.assign не становятся technical. Values ограничены числами, px/% geometry strings/templates и ограниченными arithmetic/Math forms; допускается измеряемая textarea border arithmetic через известный parseFloat. Для JSX/graph каждое свойство object return должно содержать разрешённое runtime-read значение: static-only objects, constant wrappers/Math, helpers, вызванные с доказуемо literal/const object arguments, не прячут ordinary presentation в CSS variables. Измеряемое соседнее поле не разрешает static `--padding` в том же объекте; constants внутри измеряемого arithmetic expression допустимы. Runtime condition сама по себе не является геометрией. DOM также отвергает доказуемо constant writes, с узким исключением literal `auto` reset для отдельного reviewed record. Отдельного исключения для standalone constant JSX/graph properties нет.

Проверка static origin ограничена literal/const/member syntax и простым связыванием helper arguments; без вычисления JS, алгебраической оптимизации или общей numeric provenance. Наличие runtime read не доказывает семантическую зависимость, правильность измерения или фактическую геометрию. Exact hashes, manual source/context review и независимая browser/visual qualification остаются обязательными. Неоднозначные/неподдержанные style shapes отклоняются, сложные источники runtime-данных не выдаются за формальное доказательство их происхождения.

Resolver намеренно не является TypeScript type checker, JS evaluator или общим dataflow engine. Неоднозначная/неподдержанная форма остаётся ordinary debt либо требует отдельного review/refactor. На этой истории production ledger не получает ни одной technicalInline записи.

## Проверка

1. Meaningful RED: реальный custom-variable helper fixture с exact policy не проходит final mode текущего gate, который игнорирует optional policy. Ошибка dependency/setup не считается RED.
2. GREEN: direct/same-file/named-relative helper, casts/conditional undefined, explicit dependency chain и textarea setProperty проходят при точных metadata; ordinary residue в том же/другом файле остаётся видимым.
3. Negatives: ordinary/static-only presentation under technical label, spread/computed key/unknown function/namespace/cycle/ambiguous binding, destructured shadow/reassignment и direct alias mutation; changed context/helper, missing/stale dependency/count, duplicate expression/policy, glob/path escape, same-file addition и ordinary/technical overlap отклоняются.
4. Legacy inventory byte equivalence и существующие style-boundary fixtures сохраняются. Root strict types, current repository `styles:check` и expected failing `styles:final` проверяются без UI/application/DB запуска.
5. Никаких CSS/UI/business/dependency/pnpm/runtime изменений. Scoped local commit, без push/PR; final owner exceptions относятся к отдельным reviewed UI stories.
