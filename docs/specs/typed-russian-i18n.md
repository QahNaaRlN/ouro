# D08 · Изолированная типизированная русская локализация

Дата: 2026-11-05. Статус: **IMPLEMENTED_LOCAL / STATIC_EQUIVALENCE_PASS / DEPENDENCIES_NOT_INSTALLED / RUNTIME_NOT_RUN**. Ветка `codex/typed-russian-i18n`, точная база `7074479a1bf993fd456d2403fcdf712fe397fb77` (error policy и specification content dependency включены). Документ записан до source changes. Root принял узкий пилот [D08](../proposals/react-vite-migration/decisions.md#d08-локализация-в-react); D10 остаётся отдельной историей.

## Результат и владение

Текущая форма `components/workspace-task.tsx` получает namespace `assignWork` с прежними русскими статическими текстами, labels/aria-labels и placeholders. Это реальная форма назначения; её inputs, draft map/key, auto-title, busy/disabled/pending guards, onStart result, подтверждение и UNKNOWN не меняются. Динамические имена агентов, пользовательские критерии и переданный disabledReason остаются данными, а не translation keys.

Новый экземпляр i18next создаёт composition root на срок жизни существующего ProjectRuntimeProvider. Explicit I18nextProvider передаёт его через context обоим текущим Next/Vite деревьям. Нет default global instance, вызова init при импорте или `.use(initReactI18next)`: этот plugin записывает process-level setI18n/setDefaults. Pure error normalizer/reporter не импортируют i18n и не получают новые side effects.

| Граница | Пути и ответственность |
|---|---|
| Shared infrastructure | `packages/frontend/src/shared/i18n/{index.ts,create-i18n.ts,i18n.types.ts}`: фабрика createInstance с явными ресурсами и отдельной копией dictionary tree для каждого instance; без app/feature imports |
| App assembly | `packages/frontend/src/app/i18n/{index.ts,create-ouro-i18n.ts,resources.const.ts,i18next.d.ts}`: явная регистрация RU namespace, typed keys и bootstrap factory |
| Feature dictionary | `packages/frontend/src/features/assign-work/{index.ts,locales/ru.ts}`: прежние тексты сценария, named exports |
| Error presentation | `features/assign-work/model/assign-work-error.mapper.ts`: конечная таблица code/kind → key и injected translator; raw message/stack/body не читаются |
| Consumers | `components/ProjectRuntimeProvider.tsx`: stable instance/provider; `components/workspace-task.tsx`: hook и замена только статического copy/catch presentation |
| Dependencies | root/web manifests/locks и independent consumer graph: отдельно контролируемое обновление после dependency window |

Типы ключей выводятся из `as const` RU resources. App-owned augmentation `CustomTypeOptions` содержит resources, defaultNS, strictKeyChecks и явный string-key API; shared не импортирует app для их получения. В web compilation augmentation подключается через type-only import app factory, а не только случайным glob root tsconfig. Host с иной resource typing потребует своей compilation boundary; этот пилот не объявляет embedded contract готовым.

## Начальная загрузка и fallback

Только bundled RU, `lng`/`supportedLngs`/`fallbackLng` явно заданы, нет language detector, HTTP/backend plugin, saveMissing, persisted locale или telemetry. До создания instance factory проверяет собственные entries выбранного языка и default namespace через Object.hasOwn; отсутствие не маскируется пустым namespace list или библиотечным ready-флагом. Пустой явно переданный словарь допустим. Затем возвращается полностью initialized instance с единожды зарегистрированными ресурсами. Pinned i18next resources path выполняет initialization синхронно; factory проверяет readiness. Не добавляется Suspense/loading branch, который размонтировал бы форму или runtime. Новые языки и async namespace loader не реализуются и не выдаются за проверенные.

Тексты safe errors берутся из ограниченного RU словаря с существующими нейтральными D04/D06 формулировками. Нормализация unknown остаётся у существующего normalizeAppError. Mapper читает только code/kind и получает translator аргументом, не импортирует глобальный i18n. Намеренная разница старого catch: произвольный `(e as Error).message` заменяется безопасным сообщением. Команда по-прежнему возвращает boolean через onStart; UNKNOWN и WorkspacePending не переклассифицируются. Новый toast, capture owner или server-field error contract не создаётся.

## Candidate pins и первичные источники

Кандидаты до установки: `i18next` **26.7.1**, `react-i18next` **17.1.12**. [Tagged i18next manifest](https://raw.githubusercontent.com/i18next/i18next/v26.7.1/package.json) и [официальный react-i18next manifest](https://raw.githubusercontent.com/i18next/react-i18next/master/package.json) указывают подходящие peer ranges: i18next >=26.2.0, React >=16.8.0, TypeScript ^5/^6/^7. Это source evidence, не install/type/build compatibility PASS; при window будут проверены опубликованные package metadata и фактический lock graph.

[I18nextProvider](https://react.i18next.com/latest/i18nextprovider) поддерживает отдельный instance через prop/context; [plugin source](https://raw.githubusercontent.com/i18next/react-i18next/master/src/initReactI18next.js) объясняет отказ от глобальной регистрации. [API](https://www.i18next.com/overview/api) требует завершения init до t; [pinned source](https://raw.githubusercontent.com/i18next/i18next/v26.7.1/src/i18next.js) содержит synchronous bundled-resources branch. Актуальные [TypeScript docs](https://www.i18next.com/overview/typescript) сохраняют string keys и opt-in selector API; старое сообщение об обязательном selector в v26/v27 отозвано. Нужные option types дополнительно сверяются с установленным exact package после window.

## Meaningful проверки и ограничения

До изменения source сохраняются exact base Provider/task copies. Pure tests проверят два изолированных instance, отсутствие глобальной регистрации, no cross-instance dictionary mutation, сразу готовый RU, все прежние тексты/доступные названия и whitelist errors без raw secrets. Type-negative cases должны отвергать неверный key/namespace и неверный key даже с defaultValue. Настоящий renderer проверит отсутствие сброса введённых полей и повторной команды при обновлении RU; прежние workspace UNKNOWN/receipt cases остаются источником server commit proof. Изолированный fixture не заменит их.

Static proof сравнит весь нетекстовый AST формы, className expressions, field/effect/default/state/command expressions и Provider runtime/reporting/cleanup statements. Исключения только imports, новый translation hook, scoped Provider wrapper/state и объявленные RU/catch presentation substitutions. Runtime catch message equality не заявляется. Все CSS/ledger/protocol/Query/command implementations неизменны.

Сейчас **HEAVY-FREE**: новые зависимости, npm, tsc, builds, browser и tests не запускаются. Тесты можно подготовить, но source-before-test-run не объявляется RED-first evidence. До фактического meaningful RED/GREEN и qualification результат остаётся unqualified local implementation; root выдаёт dependency/CPU окно и выполняет публикацию после peer. Нет native/Meridian/полного D08 acceptance.

Фактический static-only этап: 19 исходных RU text/attribute nodes перенесены в 15 различных ключей без изменения строк. После обратной подстановки только этих строк и исключения оговорённых hook/catch presentation совпал весь остальной AST формы: все 5 JSX handlers, 16 className expressions и прежний field/effect/submit control flow. В Provider прежние runtime/reporter/catalog/cleanup statements и subtree exact после исключения нового i18n state/wrapper. У 10 новых source modules нет parse diagnostics; точные import additions проверены отдельно. Это не доказывает разрешение ещё не установленных packages, типизацию или renderer lifecycle. Pure tests и compile-negative cases подготовлены, но не выполнялись; [журнал](../plans/typed-russian-i18n.md) сохраняет pending dependency graph и runtime qualification.
