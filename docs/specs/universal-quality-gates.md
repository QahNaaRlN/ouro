# C1: конечные проверки качества исходников

Дата: 2026-11-05. Статус: **DOCUMENTATION_PREPARATION / IMPLEMENTATION_NOT_STARTED / EXECUTABLE_GATES_NOT_RUN**. Ветка `codex/universal-quality-gates`, исходный commit `b92b5f6c04dc3933881278e066e42259ed4bc690`. Это подготовка документации, а не третья параллельная implementation story.

Основание — принятые [D01–D16](../proposals/react-vite-migration/decisions.md), [классификация всех 25 правил](../proposals/react-vite-migration/rules-portability.md), [React stack §13–14](../proposals/react-vite-migration/react-stack.md#13-именование-typescript-и-документация) и [план завершения C1/C2](../plans/react-vite-completion.md). Эти документы остаются источником требований Ouro; CBS на диске для работы проверок не нужен. Здесь задаются исполняемые области и порядок допуска, без нового rule engine.

## Граница и передача от pnpm

Protocol producer и pnpm остаются двумя текущими implementation stories. Quality implementation начинается после явной передачи **frozen pnpm A**: exact commit, manifest/lock ownership, версии существующих importers, команды и результаты квалификации. При ожидающей CI pnpm A допустима отдельная работа над pure configs только после такого handoff; до него configs и packages не меняются.

Quality story сама владеет своими новыми devDependencies и следующим lock diff поверх pnpm A. Ее зависимости и коммиты не включаются в workspace PR ради уменьшения lock churn. Существующие runtime/dev versions не обновляются вместе с линтером. Independent consumer npm graph, protocol producer contract, portable engines и frozen CLI oracle `29989b459387836e40bae454869dede998a7ebc8` не меняются ради developer lint. Если фактический импорт потребует изменения delivery graph, это отдельный явно согласованный input, а не автоматическое копирование developer tools в consumer.

## Конечный scope

Предлагаемый implementation diff: `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`; один небольшой `scripts/check-source-conventions.mjs` для оставшихся Ouro-specific source checks; точечное расширение `scripts/check-architecture.mjs`; focused `tests/source-quality.test.ts` и конечные fixtures/дополнения существующих architecture cases. Один точный legacy ledger добавляется только при установленной необходимости. Root `package.json`, `pnpm-lock.yaml`, CI check steps и эти два документа принадлежат quality story после handoff.

`AGENTS.md` и один `.cursor/rules/ouro.mdc` получают тонкие ссылки на локальные принятые требования и реальные команды, без второго текста нормы. Generated Next block сохраняется без изменения до C6. Не подключаются eslint-config-next, Oxlint, Turbo, Husky, новый test runner или общий rule framework. UI/domain/transport implementation, массовые source renames и форматирование всего дерева в scope не входят.

1. **Source scope:** собственные `.ts/.tsx/.mts/.cts`, включая declarations и тесты, в реальных `apps`, `packages`, `app`, `components`, `lib`, `scripts`, `tests`, `e2e` и перечисленных root configs. Собственные JS/MJS/CJS tooling files получают соответствующий JS/Node scope. TS `strict` сохраняется в отдельных root/web/service/protocol compilation programs; root typecheck не заменяет остальные.
2. **Frontend-role scope:** component/hook/slice naming применяется к React/frontend ролям, а не ко всем backend/protocol файлам с похожим именем. Route/bootstrap/entry files классифицируются явно. Новые legacy UI paths не получают автоматического исключения. Полный список выбранных файлов и roles проверяется, чтобы новый файл не оказался вне всех checks.
3. **Generated/external scope:** `.next`, `dist`, `node_modules`, artifacts и собственные generated files исключаются по назначению и конечным reviewed paths; список не скрывает новый owned source. Текстовые producer templates проверяются существующими artifact/contract cases, а не объявляются обычными исполняемыми modules.
4. **No any:** `@typescript-eslint/no-explicit-any` действует на новый TS source и tests/declarations без общего test override. Не добавляются unsafe casts ради прохождения lint. JS JSDoc не подчиняется запрету дублирования TS-типов: этот запрет относится к TS/TSX-контрактам.
5. **React:** `rules-of-hooks` и `exhaustive-deps` включаются явно. Устранение настоящего lifecycle нарушения — отдельный проверяемый semantic diff; dependency autofix не применяется вслепую. React Compiler diagnostics не объявляются все автоматически принятым blocking preset.
6. **Public API:** существующий architecture resolver остается владельцем aliases/relative/package-export boundaries. Public index допускает именованные reexports и необходимые module directives, без executable declarations/import side effects, `export *` и `export * as namespace`; type exports последними, JSDoc section comments. Framework-specific entry exports не приравниваются к slice public index.
7. **Naming:** component `PascalCase.tsx`, соответствующий основной named export; настоящий hook `useMeaningfulName.ts`, Query/Mutation hook suffix и один такой hook на файл; папки и pure actions по принятому словарю. Проверяется синтаксическая классификация, а domain-смысл feature/entity и глагольность имени остаются review. Словарь suffix/ролей закрепляется локально перед включением check, без догадки из имени и без forced rename прежних файлов.
8. **JSDoc:** публичные declarations/Props/ports документируются по D11; у barrel — назначение и section comments, без копии документации каждого reexport. Готовые правила проверяют presence/description/tag order и отсутствие дублирующих `@param`/`@returns` TS-types. English-only summary отклоняется конечной проверкой; наличие кириллицы не доказывает содержательный русский текст. Эффекты, реальные throws и полезность examples проверяет review. Новые обычные `//`-пояснения/разделители заменяются `/** … */`; tool directives и generated text имеют точные исключения.
9. **Formatting:** отдельный Prettier check, без смешивания с ESLint fixes и без `prettier --write .`. Новые/конвертированные files и quality files проверяются полностью. Исторический formatter debt описывается по exact paths/content fingerprints; измененный или перенесенный файл не наследует исключение молча.

## Исторический долг и его закрытие

Перед включением blocking gate снять actual inventory на переданном pnpm A. Число отклонений сейчас **NOT_INVENTORIED**, нулевой долг не заявляется. Для каждого сохраняемого отклонения нужны exact path, rule/category, устойчивый fingerprint соответствующего исходника/AST-участка, owner, причина и явный disposition. Для форматирования допустим exact file hash; blanket directory/rule/test disable и wildcard exceptions недопустимы.

Disposition зависит от предмета изменения. Новый, перемещаемый или конвертируемый frontend закрывает относящийся к нему naming/JSDoc/format/public-API долг в своем C2/C3-срезе; старый path не дает перенесенному коду автоматического исключения. Неизмененные исторические backend/core/tooling отклонения сохраняются с точным fingerprint, owner, причиной и условием пересмотра по D11: изменение соответствующего участка, перенос его в новую роль либо отдельная назначенная работа. Их учет не делает frontend migration обязательством массово переписать весь репозиторий. Generated files и необходимые технические директивы учитываются отдельно как обоснованные scope exceptions, а не как исторический долг с фиктивным C2/C3 closure.

Gate отклоняет новые нарушения, неизвестные файлы, расширение исключения на другой участок и устаревшие записи. Исправленное отклонение удаляется из ledger. Новая строка не появляется через автоматическое обновление baseline в CI. При изменении исторического участка его disposition пересматривается в соответствующем scoped diff; исключение не разрешает добавлять рядом новый unchecked код. Новые naming/public-index правила не ослабляют действующие import guards и не создают reverse-import allowlist.

## Все 25 правил: владелец проверки

«Existing» ниже обозначает наличие команды/тестов в базе, не новый PASS этой story. C2-колонка не переносит смысловую ответственность в lint.

| Исходное правило | Existing owner | Добавление C1 | Применение/semantic owner C2 и далее |
|---|---|---|---|
| behavior | Conventions, scoped specs/plans/review | Source scopes, no-any и реальные команды | Ответственность сценария и ограничения изменения |
| bootstrap | Architecture boundaries, runtime/session tests | Проверяемые import scopes | App composition/providers, стабильность lifecycle |
| checklist | Architecture/style/migration checks | Связь принятого требования с реальным gate | Проверка конкретного сценария вместо отдельного канона |
| dates | Существующие domain/wire tests | TS/import scope, без установки ради галочки | Temporal/Intl adapter, runtime/WebView support gate |
| degraded-state | Catalog/error/impact cases | Strict types и scope | Различимые D07 states, допустимый null,0/false |
| documentation | Specs/plans/proposals | Локальные AGENTS/Cursor references | Актуальные contract/evidence статусы |
| error-handling | Client/query error policy tests и boundary browser | Strict/lint/public contracts | Один UI owner, safe reporting и async coverage |
| forms | Workspace/i18n/controls browser, существующий mapper | Schema/type naming и no-any | Законченный assign-work Form/Zod pilot, затем формы |
| git-branching | check:conventions, repository-conventions tests | Сохранить существующего владельца | Изоляция/review и publication по текущему процессу |
| hfsd | check:architecture и fixtures | Полнота областей/public index | Feature/entity/widget ownership реальных модулей |
| i18n | Typed RU type/unit/production renderer tests | Strict/types/scopes | Namespace ownership остальных UI, без новых языков |
| index-standard | Named export/deep-import architecture checks | Namespace-star и executable-index closure | Явные public API перемещенных slices |
| jsdoc-core | Автоматического JSDoc gate нет | Presence/description/tag order/RU summary | Полезность описания и examples через review |
| jsdoc-ts | Strict TS | No duplicated TS types, public declarations | Правдивые effects/errors/async rejection contracts |
| jsdoc-vue | TSX/Props compilation | React JSDoc contexts | Props/default/callback contract без Vue syntax |
| layouts | Navigation/controls/presentation suites | Naming/import roles | App shell отдельно от shared structural UI |
| modals | Focus/Escape/mounted-draft browser tests | Hooks/Props/import scope | Один lifecycle owner и сохранение drafts/focus |
| monorepo | Четыре TS programs, consumer/protocol jobs | Quality tools поверх frozen pnpm A | Пакетные границы, самостоятельная поставка C5 |
| naming-conventions | Git conventions не проверяют source names | Конечные source-role/filename/export checks | Физический C2 перенос без общего rename dump |
| state-management | Session/snapshot/intent/runtime tests | Hooks/strict/import boundaries | Query vs UI vs CRDT ownership, scopes/isolation |
| tanstack-query | Catalog/query-error/session tests | Hook naming/dependencies | Keys/invalidation/commands без default write retry |
| testing | Existing unit/service/protocol/browser/Postgres jobs | Focused positive/negative quality fixtures | Meaningful behavior/UNKNOWN/host regression |
| toast | Query error policy tests | Scope/type contracts | Один владелец уведомления; suppressToast не suppress report |
| vue-components | React compile и browser tests | React hooks/TSX naming/public Props | Pure render/derived values, cleanup и working actions |
| zod | Protocol/domain/schema tests | Schema/type naming и strict no-any | Input/output parse boundary без schema weakening |

## Exact tool candidates, еще не допущенные runtime

В прочитанной installation имеются TypeScript5.9.3/React19.3.1; нового lint/formatter stack нет. Предлагаются **eslint10.13.0**, **@eslint/js10.0.1**, **typescript-eslint8.72.1**, **eslint-plugin-react-hooks7.1.1**, **eslint-plugin-jsdoc65.4.2**, **prettier3.9.10**, **globals17.13.0**. Это exact candidates, не qualified lock и не запрос обновить существующие зависимости.

Primary tagged manifests подтверждают Node24.19 compatibility; typescript-eslint допускает TS5.9.3 и ESLint10. Hooks changelog подтверждает поддержку ESLint10 с7.1. ESLint9 не выбирается: официальная линия EOL с2026-08-06. Последующая read-only web-проверка официальных npm listings подтвердила присутствие всех семи exact versions. Это **PUBLICATION_LISTED**, а не registry/tarball admission: exact registry URLs вернули tool access failure без HTTP404; dist.integrity, published manifest engines/peers и actual Windows/Linux install/config execution остаются **PENDING**. Tagged source и npm listing не выдаются за проверку установленного tarball.

Проверенные npm listings: [ESLint10.13.0](https://www.npmjs.com/package/eslint?activeTab=dependencies), [@eslint/js10.0.1](https://www.npmjs.com/package/%40eslint/js?activeTab=versions), [typescript-eslint8.72.1](https://www.npmjs.com/package/typescript-eslint?activeTab=versions), [Hooks7.1.1](https://www.npmjs.com/package/eslint-plugin-react-hooks), [JSDoc65.4.2](https://www.npmjs.com/package/eslint-plugin-jsdoc?activeTab=versions), [Prettier3.9.10](https://www.npmjs.com/package/prettier?activeTab=versions), [globals17.13.0](https://www.npmjs.com/package/globals?activeTab=versions). Ошибка доступа не означает отсутствие публикации и не обосновывает замену кандидата.

Ссылки: [ESLint manifest](https://raw.githubusercontent.com/eslint/eslint/v10.13.0/package.json), [@eslint/js manifest](https://raw.githubusercontent.com/eslint/eslint/v10.13.0/packages/js/package.json), [ESLint support](https://eslint.org/version-support/), [typescript-eslint manifest](https://raw.githubusercontent.com/typescript-eslint/typescript-eslint/v8.72.1/packages/typescript-eslint/package.json), [Hooks changelog](https://github.com/react/react/blob/main/packages/eslint-plugin-react-hooks/CHANGELOG.md), [JSDoc tagged manifest](https://raw.githubusercontent.com/gajus/eslint-plugin-jsdoc/v65.4.2/package.json), [Prettier tagged manifest](https://raw.githubusercontent.com/prettier/prettier/3.9.10/package.json), [globals tagged manifest](https://raw.githubusercontent.com/sindresorhus/globals/v17.13.0/package.json). Конфигурация flat MJS не требует TS config-loader dependency; отдельный formatter не требует ESLint formatter plugin при отсутствии конфликтующих stylistic rules.

## RED, GREEN и достаточная квалификация

1. Сначала actual positive fixture загружает выбранные parser/plugins/config и дает ноль нарушений. Missing dependency/module/config, unsupported runtime и download failure — **SETUP_FAIL**, не meaningful RED.
2. До включения соответствующего правила failing fixtures доказывают: conditional hook; stale dependency capture; any отдельно в source и test; неверные component/hook filename/export; ложный pure use-helper; wildcard/namespace/runtime public index; отсутствующий/English-only/duplicated-type JSDoc; обычный section comment; плохое форматирование. Затем тот же actual rule/config должен отклонить их с нужным rule/category, а правильные аналоги пройти.
3. Scope fixtures включают TSX/MTS/CTS/declarations, aliases/relative/package exports, новый файл вне legacy inventory, stale/wildcard/измененное exception и local adapter refs без CBS filesystem dependency. Public type/function/Props и reexport случаи разделены, чтобы barrel или TS signatures не получили пустые автокомментарии.
4. На реальном дереве выполнить lint/source/format/architecture/conventions checks, focused existing architecture/convention tests и root/web/service/protocol type programs. Команды существуют, CI вызывает их после одной frozen workspace installation; выполняемый набор и file counts сохраняются. Новых product browser captures для configs не требуется. Если исправление затронет lifecycle/handlers, оно выделяется и получает соответствующие existing behavior tests.
5. Windows/Linux frozen installation и checks выполняются на точной composition с pnpm A. Существующие mandatory jobs не удаляются и не заменяются новым quality suite. Полные product/delivery/browser gates остаются у своих story/final-composition owners; один lint PASS не закрывает C2–C7.

До handoff и отдельного разрешения implementation все перечисленные будущие gates — **NOT_RUN**. Локальный документационный commit не означает integration, push или готовность product story.
