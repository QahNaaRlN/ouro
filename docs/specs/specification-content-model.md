# SPECIFICATION · Публичная функция подготовки содержания ревизии

Дата: 2026-11-05. Статус: **IMPLEMENTED_LOCAL / STATIC_EQUIVALENCE_PASS / RUNTIME_NOT_RUN**. Ветка `codex/specification-content-model`, точная база `9b7adc869c90320d13ac68a4e9f22f194acacc12`. Документ создан до source changes. Root принял этот подготовительный перенос отдельно от D08/D10; frozen source передаётся на peer и последующие проверки.

## Проблема и результат

`workspaceContent` определена в `components/workspace-task.tsx`, но используется двумя сценариями: назначением работы и предложением новой ревизии в `components/workspace-decisions.tsx`. Последующая feature формы не должна импортировать legacy UI или создавать вторую реализацию того же преобразования.

По [целевой архитектуре](../proposals/react-vite-migration/target-architecture.md) чистая подготовка содержания одной спецификации получает entity public API. Перенос не выполняет команду и не проверяет её принятие. Он не вводит Form, Zod schema, локализацию, состояние или новую трактовку `RevisionContent`.

```text
packages/frontend/src/entities/specification/
  index.ts
  model/create-revision-content.ts
```

Публичный named export сохраняет имя и сигнатуру: `workspaceContent(title: string, goal: string, dodText: string): RevisionContent`. Семантическое имя файла не требует изменения существующего API. Public index только явно экспортирует эту функцию; производные core types повторно не экспортируются. Module импортирует только тип `RevisionContent` из core, без `use client`, React, legacy imports, runtime singleton или side effects.

## Неизменяемый контракт

- Тело функции переносится буквально с допустимой нормализацией EOL. Title и goal возвращаются без trim или иной нормализации.
- DoD разделяется по `\n`; строки с пустым `trim()` исключаются, исходный текст остальных сохраняется. ID присваивается после фильтрации как `criterion-1`, `criterion-2` и далее; `required` остаётся `true`.
- `constraints`, `assumptions`, `risks`, `inputs`, `comment` остаются пустыми строками. Новые поля, validation, defaults, ограничения длины и преобразования транспорта не добавляются.
- Оба потребителя входят через `@/packages/frontend/src/entities/specification`. Старого export/proxy из `workspace-task.tsx` после переноса нет.
- Форма назначения сохраняет draft map/key, auto-title, доступность агента, busy/disabled/pending guards, обработку результата `onStart`, очистку после подтверждения и сохранение ввода при false/UNKNOWN.
- Предложение ревизии сохраняет поверх результата прежние constraints/assumptions/risks/inputs/comment и optional flow/verification, а также command/cursor/guards.
- JSX, классы, CSS, порядок обработчиков, command body/request ID/receipt/retry, Query/runtime и сервер остаются прежними.

## Проверка и границы доказательства

До переноса сохраняются фактические исходники обоих callers из exact base. Bounded static script с уже установленным TypeScript сравнит тело и сигнатуру функции, AST обоих callers после исключения только import declarations и перенесённого определения, обработчики и все className expressions. Import inventory должен показать одну реализацию и ровно два production consumer imports через public index. Locks, style ledger, архитектурный allowlist и остальные source files не меняются.

Existing meaningful regression coverage: `tests/workspace-domain.test.ts` PW03 проверяет исходное содержание и queued assignment; `tests/workspace-http.test.ts` WH03 — проект/исполнителя и идемпотентный повтор; `tests/hosted-workspace.test.ts` — membership и точный repeat; `tests/workspace-review.test.ts` PW-REVIEW03 — receipt после более новой версии/потери папки. `e2e/project-workspace.spec.ts` действительно заполняет эту форму, проверяет клавиатуру/mobile и потерянный committed ответ с A→B→A и неизменным точным повтором. Эти проверки не объявляются прямыми unit tests `workspaceContent`: direct tests этой функции в текущем инвентаре отсутствуют.

На текущем этапе действует **HEAVY-FREE**: dependencies/tsc/build/browser/tests не запускаются. Static equivalence не заменяет проверки разрешения imports, types/build или runtime. Root после freeze выполняет установку и необходимые проверки; CI/merge/publication принадлежат root. Нового placeholder test ради переноса нет. D08/D10, validated form output и полная hFSD миграция остаются следующими отдельными историями.

Фактический static result: literal function/signature/body после EOL normalization совпадает; SHA256 `93c47465a9002fa6efe19896c8d6646e5b9c6d2fb1038b244deb9ef6986d8d9d`. Оба non-import caller AST exact после исключения только перенесённого определения. Сохранены все 26 JSX handlers и 114 className expressions, оба вызова и прежние client directives; import substitutions проверены отдельно. Новый module содержит только type import и функцию, public index — один named export. Locks/ledger/allowlist unchanged, `git diff --check` PASS. Runtime/types/build/CI по-прежнему NOT_RUN; [журнал](../plans/specification-content-model.md) сохраняет точный объём.
