# OURO-ENG-000015 · Выбрать папку-проект и передать работу MCP-агенту

29.10.2026 · SDD до кода · база `1d984fa` · отдельная ветка `feat/project-workspace`, alpha.14. Пользователь выбрал: любая локальная папка как проект, работа уже подключённому MCP-агенту, первым ChatGPT. Запуск внешнего LLM/процесса не нужен.

## Наблюдаемый сценарий

В `/projects` человек выбирает существующий проект либо добавляет папку на машине, где запущен Ouro. Папку можно указать абсолютным путём или выбрать через ограниченный серверный directory browser. Git не обязателен. В `/projects/{id}` человек выбирает регистрацию ChatGPT, вводит задание и проверяемые критерии, нажимает «Начать работу». Одна команда создаёт спеку, активную ревизию и назначенную queued-попытку. Интерфейс показывает «Ожидает агента», затем фактические состояния/вопросы/результат. Running возникает только после настоящего MCP ACK.

Новая поверхность намеренно компактна: выбор папки, подключение, задача, состояния/история, вопросы и решения, граф имеющихся спек/процессов. Прежний полный Human View и `/api/...` сохраняют legacy-проект; явная ссылка «Проекты» ведёт в новый вход. Не переносить новый проект в legacy UI через глобальную selectedProject cookie.

## Проекты и данные

Одна SQL/PGlite owner connection и общая очередь сериализации; project-scoped facades делят owner, но замыкают собственный projectId. Нельзя открывать несколько PGlite на один каталог. `createStore({projectId?})` и `store.forProject(id)` сохраняют прежний default. Top-level helpers, participant registry и drafts получают явный projectId. Старые события/receipts/hashes не меняются. Новый проект не получает фиксированный учебный seed.

Добавляется каталог локального оператора: `{id,name,rootPath,kind:'folder'|'demo',createdAt,createdBy,bindingId,rootIdentity}`. RootPath — canonical realpath, unique; rootIdentity фиксирует dev/ino в переносимом строковом виде. Привязка неизменяема в этом пакете. Alias одной папки возвращает ту же запись; исчезнувшая/подменённая папка не переназначается молча. Каталог и его idempotent receipts сохраняются в SQL, отдельно от доменной истории.

Legacy project доступен как demo со старым ID/историей и без файлового root. У нового проекта отдельный `ProjectInitialized` event устанавливает собственный roadmap.id/title, не меняя emptyState старого проекта. Metadata нельзя подставлять в snapshot поверх replay. Создание записи каталога, project row и initialization атомарно. Подтверждённые регистрации переживают restart.

## Назначение работы

Человеческая команда `startProjectWork {requestId,expectedVersion,agentId,content:RevisionContent}` атомарно создаёт SpecCreated → RevisionActivated → ExecutionCreated. Проверяются actor, состояние карты, активная регистрация агента в проекте, валидность содержания и доступность неизменённой folder binding. Receipt lookup предшествует проверке текущей версии/папки: прежняя команда восстанавливается и после переключения UI/новых событий/исчезновения папки.

Форма показывает title, goal и DoD; исходный текст сохраняется, title может быть предварительно получен из первой строки с возможностью правки. Хотя бы один критерий обязателен и виден перед запуском. Это человеческое назначение конкретной задачи; оно не объявляет автоматически согласованным подробный план и не принимает DoD. Исполнение выбирается из регистраций выбранного проекта, не по произвольному имени «ChatGPT».

Новые проекты используют core с действующими статусами/guards. Общие человеческие команды позволяют отвечать на Question/Fork/Blocker, отдельно разрешать продолжение, принимать предъявленный результат и предлагать/активировать ревизию. Автоматического ответа, подтверждения применения или ACK нет.

## Маршруты и изоляция

`/api/projects` GET/POST — каталог. `/api/workspace/folders` GET — ограниченный directory browser. Доступ только доверенному локальному оператору/human-token; agent и зарегистрированный участник legacy-проекта не становятся оператором каталога. Непригодная participant cookie не откатывается в local demo.

`/api/projects/{projectId}` GET возвращает `{project,state,cursor,agents,connection}` после проверки каталога. `/commands` POST — human domain commands; `/tasks` POST — startProjectWork; `/agents` GET/POST и `/agents/{agentId}/revoke` — регистрации; `/stream` GET — committed scoped SSE; `/mcp` POST — агентский transport. Project ID берётся только из маршрута и проверенной записи каталога. Неправильный Expected-Project/Expected-Participant отклоняется; заголовки не дают полномочий.

Для нового operator-only UI local session проверяется на прежнем доверенном operator boundary, затем operator явно получает actor.projectIds выбранного зарегистрированного проекта. Это локальное управление собственными папками, не production tenancy/SSO. Новый UI пока не переносит все legacy панели/интеграции в multi-project режим.

MCP URL и ключ фиксируют один проект. Ключ A не проходит на endpoint B; browser switch не меняет MCP-контекст A. Legacy env OURO_AGENT_TOKEN ограничен default-проектом. Авторизующий resolver нового endpoint проверяет регистрацию только в выбранном store; cookies/перебор всех проектов не используются. Существующие tool inputs не получают произвольное поле projectId. Отдельные проекты имеют отдельные подключения ChatGPT.

При смене project page создаются новый adopter/cursor/selection и отдельный SSE; поздний A snapshot не принимается в B. Неподтверждённый intent хранит исходные projectId+URL+actorId+body+expectedVersion/requestId вне keyed remount. Повтор всегда идёт в исходный endpoint. RAM state переживает внутреннюю навигацию; reload предупреждается, долговременное browser recovery не обещается.

## Файловый контекст для ChatGPT

Добавляются read-only tools `ouro.list_workspace_files {executionId,path?:string,cursor?:number}` и `ouro.read_workspace_file {executionId,path:string}`. Перед filesystem IO проверяются credential, project и существующее назначение именно этого execution. Сервер сам получает immutable binding из каталога; абсолютный root не принимается от агента. Get_context отдаёт workspace metadata/capability и инструкции; абсолютные host paths остаются в human UI.

Listing ограничен 200 записями одной папки, имеет явный nextCursor/усечение; рекурсивного сканирования нет. Read ограничен 128 KiB UTF-8, возвращает относительный path, text, sha256, size и modifiedAt. Содержимое актуально на момент чтения, не выдаётся за immutable файл ревизии или факт успешного выполнения.

Запрещены absolute/traversal/backslash/drive paths, NUL и выход за root. Внутренние symlink не обходятся; root binding перепроверяется на исчезновение/замену. Не читаются .git/node_modules, типичные credential directories/files (.env*, SSH/private key и т.п.), бинарные/не UTF-8 и слишком большие файлы. Создание/выбор проекта не изменяет его файлы, не запускает команды и не устанавливает зависимости. Файловых write/shell tools в этом пакете нет.

Инструменты добавляются в самостоятельный `@ouro/protocol@0.1.2` с конкретными input/output/workspace DTO, generated schemas и прежними success/error/unknown-outcome правилами. Это совместимые новые возможности; старый пакет и legacy receipts не переписываются. Число схем определяется фактическим каталогом после генерации.

## Подключение ChatGPT

Официальная документация 29.10.2026 подтверждает public HTTPS либо Secure MCP Tunnel для частного MCP. Для локального прототипа основной путь — Secure MCP Tunnel → stdio bridge Ouro с фиксированными project URL и локальным agent-key file. Literal secrets не помещаются в command arguments, Git, URL или логи. Нового secret-in-path endpoint/OAuth server не добавляется.

UI выдаёт одноразовый ключ, project-specific connection config, готовый стартовый prompt с executionId и ссылку на пошаговую инструкцию ChatGPT/tunnel-client. Регистрация ключа не означает установку ChatGPT plugin; lastSeenAt означает наблюдавшееся обращение, не постоянное соединение. Работа назначается queued и может ожидать следующего вызова ChatGPT. Нельзя объявлять реальную ChatGPT интеграцию принятой по одному SDK-тесту: account/workspace permissions и tunnel runtime требуют пользовательской настройки; документы прямо описывают эту границу.

## Приёмка до кода

| ID | Наблюдаемое поведение |
|---|---|
| PW01 | Произвольная существующая папка без Git добавляется и сохраняется; canonical alias дедуплицируется, плохой/файловый путь отвергается |
| PW02 | A/B имеют разные IDs/историю/cursors/agents; новые проекты без учебного seed; legacy hashes/receipts/replay неизменны |
| PW03 | Start создаёт spec+revision+queued execution атомарно, настоящее ACK меняет running, результат/DoD остаются отдельными |
| PW04 | Exact повтор start возвращает прежнюю receipt без второй спеки/попытки; same key/different body конфликтует, race даёт один старт |
| PW05 | Key/participant/foreign entity A не читают и не меняют B; legacy env-token не получает новые проекты; cookie не заменяет MCP credential |
| PW06 | Browser switch/SSE сохраняет scope; поздний A ответ не заменяет B; unknown A intent восстанавливается в A исходным автором |
| PW07 | File tools реально читают назначенную папку с hash; traversal/absolute/symlink/secrets/binary/oversize и отсутствующее назначение отвергаются |
| PW08 | Folder исчезла/заменена: новый запуск/чтение запрещён; прежний start receipt восстанавливается без переотправки в другой проект |
| PW09 | Настоящий SDK проходит project endpoint/bridge, context/files/ACK/question/human answer/resume/result; snapshots и tools отражают правильный project |
| PW10 | UI позволяет выбрать папку/агента, ввести задачу/DoD, запустить и видеть ожидание/работу/вопрос/результат; mobile/keyboard доступны |
| PW11 | Документы описывают локальный запуск, ChatGPT tunnel, границы файлового доступа и версий; standalone protocol install и общие regression gates успешны |

## Прочитанные ориентиры

[OpenAI Connect and test](https://developers.openai.com/plugins/deploy/connect-chatgpt), [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels), [MCP guide](https://developers.openai.com/api/docs/mcp), актуальные локальные Next.js 16 route/dynamic params docs. Изучение конкретного tunnel-client config и применения правил path containment фиксируется в research/журнале до соответствующей реализации. Полноценный tenancy/OAuth, автоматический LLM runner, запись файлов и пакетное построение Roadmap не входят в этот ограниченный сценарий.
