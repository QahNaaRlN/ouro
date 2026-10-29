# Переносимый контракт · SDD/TDD

29.10.2026 · [SDD](../specs/domain-contract.md). База `1ffe248`.

До реализации фактический `tools/list` через официальный SDK показал 15 tools, 0 outputSchema и `draft.flow:{}`. Действующий core проверяет Flow отдельно; transport уже существует. Пакет устраняет пробел discoverability, формализует ответы и готовит отдельную установку, не добавляя полномочий агенту.

Работа ведётся отдельными границами: Flow/input schemas, output DTO/ошибки, MCP интеграция и standalone упаковка. Для каждой записываются настоящие RED до реализации, затем GREEN и независимая проверка. Полный итог и ограничения добавляются после интеграции.

## Реализация и RED → GREEN

Продуктовый код заморожен в `dc0676e`, приложение `0.1.0-alpha.12`, независимый контракт `@ouro/protocol@0.1.0`. После этого менялась только документация.

| Граница | Наблюдавшийся RED | Итог |
|---|---|---|
| Flow/input | Публичная схема Flow не имела object/nodes/edges; переносимый модуль отсутствовал | Конкретные Zod/JSON schemas, общий структурный источник для core и standalone, прежние graph/Unicode/UTF-16/prototype guards; 18 целевых проверок Flow/proposals успешны |
| Output DTO | Отсутствовал переносимый модуль ответов | Явные контекст/updates/mutation/proposal DTO, JSON extensions, отдельная error schema |
| Реальный SDK | SUCCESS-only outputSchema заставляла client отвергать корректный structured error при isError | Общий корневой ZodObject с JSON Schema oneOf/discriminator/required для обеих ветвей; Draft 7 и 2020-12 проверены независимым Ajv |
| Согласованность helper/wire | Error с испорченным зарезервированным execution принимался helper, но отвергался wire schema | Проверка типов присутствующих зарезервированных полей без потери неизвестных JSON-расширений |
| Сохранность JSON | Zod удалял root/nested own `__proto__` и пропускал некорректные значения под ним; циклы/нестандартные raw values не проверялись общим helper | Descriptor-based JSON-проверка без вызова getters, запрет nonfinite/functions/undefined/cycles, сохранение исходного проверенного JSON без prototype pollution; итог output-группы 12/12 |
| MCP/receipts | Нет output schemas/resources/stdio forwarding; ответ после реального SQL commit мог ошибочно выглядеть успешным | 5/5 SDK-интеграционных проверок: 15 schemas, resources без чтения project store, безопасный неизвестный исход после malformed/missing projection, точный повтор прежней SQL-квитанции, stdio и legacy tools-only |
| Старые данные | Возможен отказ нового контракта на старой квитанции без новых массивов | 10/10 прежних agent/SQL review проверок, включая неизменяемую legacy receipt, успешны; SQL receipt не переписывается |
| Standalone | Нет package.json переносимого пакета | Независимая source-copy установка и tarball consumer с ESM/CJS, types, CLI и JSON успешны |
| Права дистрибутива | Новая regression получила mode 384/0600 вместо 420/0644 у README из-за umask среды сборки | Нормализуются только явно включённые в дистрибутив файлы: 0644, директории/bin — 0755; самостоятельная установка проверяет права всех 83 файлов |

Промежуточные ошибки компиляции ловились до итогового gate: narrowing после safeParse/catch, native String.isWellFormed typings заменены переносимым Unicode helper, аннотации двух test fixtures. Они не выдаются за успешные проверки. Первый npm install consumer упёрся в недоступный sandbox cache домашнего каталога; повтор использовал поддерживаемый npm cache в `/tmp`. Это ограничение среды не считается продуктовым RED.

## Общий итоговый gate

- Полный `npm test`: **266/266**, 0 failed/0 skipped. В него входят новые Flow/output/MCP проверки и прежний домен/SQL/replay/agent scope.
- `npm run typecheck`, `npm run protocol:check` и `npm run build`: GREEN. Проверены 34 canonical JSON schemas, совпадение с исходными определениями, ESM/CommonJS compilation и declarations.
- Самостоятельная приёмка `npm run protocol:test-package`: **1/1**. Исходники копируются в новую папку с пробелами без root node_modules/dist; собственный npm ci → обычный npm pack/prepack → установка tarball в пустой consumer. Runtime npm tree содержит только `@ouro/protocol` и `zod`. Проверены ESM, CommonJS, TypeScript в обоих режимах, локальный npm CLI shim, успешные/отклоняемые примеры и права файлов. Next.js, SQL, SDK и браузер в consumer не устанавливаются.
- Полный Playwright по production artifact: **59/59**, 0 unexpected/flaky/skipped, около 2 мин. Собственный сервер 3353, отдельная новая БД, 1 worker, управляемый Playwright Chromium. Предыдущие preview не переиспользовались. Сервер после gate остановлен.
- Независимое ревью проверило публичные схемы, version/URN, приватность, post-commit ошибки и standalone exports; найденные JSON-preservation и permissions дефекты устранены до финального артефакта.

Сборка контракта выполняется npm hooks перед командами приложения; приложение использует публичный скомпилированный пакет через file dependency, а не другую копию определений. Артефакт пакета собирается отдельно; выходные JSON Schema файлы доступны и без JavaScript. Библиотека не является самостоятельным MCP-сервером.

## Проверка реального production HTTP

Preview 3010 использует собственную `.ouro/preview-postgres`. Реальный SDK-клиент после tools/list получил 15 tools с 15 response schemas и обеими oneOf-ветвями; `draft.flow` имеет явную структуру. Resources HTTP отдали manifest 0.1.0 и 34 schemas; server info показал product alpha.12. Проверен штатный `FORBIDDEN` structured error после получения каталога — SDK его принял.

Техническая регистрация probe-агента отозвана после закрытия клиента. Browser проверил открытие процесса из дорожной карты, Footer alpha.12, светлую тему на 390 px: 0 page errors, нет overflow, SSE подключён, domain cursor 35→35. Это read-only проверка домена, не результат работы LLM и не human acceptance. Тестовому клиенту не назначалось исполнение.

## Доставка и границы

Готовый файл: `artifacts/ouro-protocol-0.1.0.tgz`, 57719 bytes, 83 файла. SHA256:

```text
cf108f94053d4b3b57892804a56f4b5745608103c107377b1b8a95157d1c5435
```

После последней правки пояснения API в README архив переупакован из уже проверенных JS/schema файлов без повторной компиляции; runtime-код не менялся. Обычный `npm pack` продолжает сам выполнять prepack/build. В npm registry пакет не публиковался; устанавливается `.tgz` или собирается отдельно по [самодостаточному README](../../packages/protocol/README.md).

Старые tool arguments, 15 tools, полномочия, immutable ревизии/receipts и пользовательские БД сохранены. Canonical dialect 2020-12 и wire Draft 7 не смешиваются. Event payload/error details пока JSON-расширения; полноценные пакетные roadmap proposals и новые политики полноты плана остаются следующим этапом. Нативные Windows/macOS и сторонние языковые реализации не объявляются проверенными.
