# Подключить ChatGPT к локальному проекту Ouro

Это пример подключения к общему контракту Ouro: **ChatGPT → Secure MCP Tunnel → локальный tunnel-client → stdio bridge Ouro → MCP endpoint одного проекта**. Любой другой совместимый MCP-агент использует те же schemas/tools и отражается в том же живом дашборде. Сервер Ouro и выбранная папка остаются на вашей машине. Подключение требует собственной настройки аккаунта/workspace OpenAI; регистрация ключа в Ouro не устанавливает plugin в ChatGPT.

Инструкция сверена 29.10.2026 с [официальным Connect and test](https://developers.openai.com/plugins/deploy/connect-chatgpt), [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) и [onboarding tunnel-client](https://github.com/openai/tunnel-client/blob/master/docs/onboarding.md). Выполненные проверки нашего прототипа перечислены отдельно в [журнале](plans/project-workspace.md). Живое подключение ChatGPT не считается подтверждённым одним SDK-тестом.

## 1. Подготовить проект Ouro

1. Запустите Ouro и откройте <http://127.0.0.1:3000/projects>.
2. Добавьте папку по [инструкции проекта](project-workspace-guide.md) и откройте её страницу `/projects/{projectId}`.
3. В блоке подключений задайте имя ChatGPT и нажмите **«Зарегистрировать агента»**. Сохраните одноразовый **«Ключ агента»** в локальный файл вне репозитория и выбранной папки контекста, с доступом своей учётной записи.
4. Укажите абсолютный путь файла в **«Файл ключа агента»**. Сохраните **«Конфигурация MCP»**: нужны её `command`, `args`, `env.OURO_URL` и `env.OURO_AGENT_TOKEN_FILE`. Значение ключа в конфигурацию не включается.

Project URL имеет вид `http://127.0.0.1:3000/api/projects/PROJECT_ID/mcp`. Берите точный адрес из выбранного проекта; demo/legacy подключение использует прежний `/api/mcp`. Если порт Ouro другой, используйте выданный адрес с этим портом.

## 2. Подготовить доступ OpenAI

В [Platform Tunnels](https://platform.openai.com/settings/organization/tunnels) выберите предназначенную для работы Platform organization, создайте или переиспользуйте tunnel и сохраните его полный tunnel_id. Свяжите его также с **целевым ChatGPT workspace**. Наличие только Platform organization не делает tunnel автоматически видимым в другом workspace.

Нужны две разные настройки доступа:

- Для создания/изменения tunnel — Tunnels **Read + Manage**.
- Для runtime key tunnel-client и использования tunnel при добавлении plugin — Tunnels **Read + Use**. Workspace отдельно должен разрешать custom MCP servers.

Создайте ограниченный runtime API key в [Platform API keys](https://platform.openai.com/settings/organization/api-keys) и сохраните его в отдельный локальный файл. Это ключ OpenAI tunnel service, **другой**, чем agent key Ouro. Admin key для обычного foreground-запуска не нужен. Если разрешений нет, их выдаёт администратор соответствующей organization/workspace; локальная регистрация Ouro этого не заменяет.

## 3. Установить поддерживаемый tunnel-client

Используйте download на странице Platform Tunnels или [актуальный официальный release](https://github.com/openai/tunnel-client/releases/latest). Выберите свою ОС и архитектуру; сохраняйте файлы рекомендованного runtime-архива вместе.

| Система | Установка и запуск команды |
|---|---|
| macOS | Официальный путь Homebrew: `brew install openai/tools/tunnel-client` |
| Windows | Распакуйте официальный windows-amd64 или windows-arm64 ZIP; добавьте папку в PATH либо запускайте `C:/Tools/tunnel-client/tunnel-client.exe` |
| Linux | Распакуйте официальный linux-amd64 или linux-arm64 ZIP; разрешите выполнение бинарника и добавьте его папку в PATH либо используйте абсолютный путь |

Проверьте установленную версию и доступный help:

```sh
tunnel-client --version
tunnel-client help quickstart
tunnel-client help samples
tunnel-client init --help
```

Если бинарник не в PATH, заменяйте `tunnel-client` его путём; в PowerShell для пути в кавычках используйте оператор `&`. Установленный help имеет приоритет при изменении CLI. На дату исследования в официальных исходниках доступны используемые ниже sample и flags.

## 4. Задать проект и файлы ключей

Ниже только пример путей: подставьте **точные значения своей конфигурации**. Секреты не вставляются в команды, URL или разговор с ChatGPT.

macOS/Linux:

```sh
export OURO_URL='http://127.0.0.1:3000/api/projects/PROJECT_ID/mcp'
export OURO_AGENT_TOKEN_FILE='/absolute/private/ouro-agent.key'
```

Windows PowerShell:

```powershell
$env:OURO_URL = 'http://127.0.0.1:3000/api/projects/PROJECT_ID/mcp'
$env:OURO_AGENT_TOKEN_FILE = 'C:/Users/you/private/ouro-agent.key'
```

Оба файла ключей должны уже содержать соответствующие значения, сохранённые локально без вывода в журнал терминала. На macOS/Linux задайте им права `600`; на Windows ограничьте доступ своей учётной записью. В profile далее сохраняется только ссылка на файл runtime key. Bridge наследует OURO_URL и путь agent key из окружения этого терминала.

## 5. Создать stdio-профиль

Возьмите из конфигурации Ouro точные `command` и `args`. Для обычного Node из PATH команда выглядит как `node "/absolute/path/ouro/packages/mcp/bin/ouro-mcp.mjs"`; если путь Node задан явно, заключите и его в двойные кавычки внутри command string. Никаких значений ключей в этой строке нет.

Пример macOS/Linux, одной строкой:

```sh
tunnel-client init --sample sample_mcp_stdio_local --profile ouro-project --tunnel-id tunnel_0123456789abcdef0123456789abcdef --control-plane-api-key-ref 'file:/absolute/private/tunnel-runtime.key' --mcp-command 'node "/absolute/path/ouro/packages/mcp/bin/ouro-mcp.mjs"'
```

Пример PowerShell; прямые слеши внутри command string подходят для путей Node на Windows:

```powershell
tunnel-client init --sample sample_mcp_stdio_local --profile ouro-project --tunnel-id tunnel_0123456789abcdef0123456789abcdef --control-plane-api-key-ref 'file:C:/Users/you/private/tunnel-runtime.key' --mcp-command 'node "C:/Work/ouro/packages/mcp/bin/ouro-mcp.mjs"'
```

Замените пример tunnel_id полным ID, полученным от Platform, а `ouro-project` — отдельным именем этого подключения. `--control-plane-api-key-ref` — реальный флаг init; он принимает `file:...` или `env:CONTROL_PLANE_API_KEY`. Не передавайте значение runtime key в argv. Для другого проекта используйте отдельные profile/tunnel/регистрацию, чтобы не перепривязать существующее подключение.

Проверьте и запустите:

```sh
tunnel-client doctor --profile ouro-project --explain
tunnel-client run --profile ouro-project
```

В каждом новом терминале запуска сначала восстановите OURO_URL и OURO_AGENT_TOKEN_FILE. Оставьте Ouro и `tunnel-client run` работающими. Это foreground-процесс: Ctrl+C завершает tunnel runtime. Для одного stdio tunnel запускайте один экземпляр клиента; несколько процессов не делят один stdio child безопасно.

По умолчанию локальная панель tunnel-client — <http://127.0.0.1:8080/ui>. Проверьте healthy/ready и active polling. Если порт занят, настройте другой loopback health address по `init --help`/официальной configuration. `/readyz` и health сами по себе ещё не подтверждают вызов из ChatGPT.

## 6. Добавить custom MCP server в ChatGPT

1. Откройте [ChatGPT Plugins](https://chatgpt.com/plugins), нажмите плюс и **Add custom MCP server**.
2. Введите понятные имя и описание, например «Ouro — мой проект».
3. В **Connection** выберите **Tunnel**, затем нужный tunnel или его полный tunnel_id.
4. Этот stdio bridge уже авторизует доступ в Ouro через локальный agent-key file; дополнительный upstream OAuth Ouro не предоставляет. Настройте соответствующий вариант без upstream OAuth, проверьте предупреждение доступа, выберите **I understand and want to continue**, затем **Create as a plugin**.
5. Проверьте обнаруженный список инструментов. Для alpha.14/15 ожидаются 18 tools, включая `ouro.list_workspace_files` и `ouro.read_workspace_file`.
6. Установите созданный plugin, откройте новый разговор, введите `@` и выберите именно это подключение проекта.

Не вставляйте localhost URL в поле публичного HTTPS server и не переносите agent key в URL. Для этого сценария выбран Tunnel к локальной stdio-команде. Если tunnel не виден, проверьте organization/workspace association и Read + Use, затем состояние tunnel-client.

## 7. Назначить и проверить настоящую работу

В Ouro выберите это подключение в **«Исполнитель задачи»**, заполните задачу и DoD, нажмите **«Начать работу»**. Скопируйте выданную инструкцию попытки в новый разговор с выбранным plugin. В ней есть точные projectId и executionId, без ключей.

Первый безопасный запрос можно сформулировать так:

> Прочитай `ouro.get_context` для назначенного executionId. Назови проект, цель и критерии готовности. После проверки назначения подтверди начало через `ouro.confirm_started`. Используй `ouro.list_workspace_files` и прочитай README через `ouro.read_workspace_file`, если он есть; пути только относительные. Сообщай реальные факты с evidence. Если нужны сведения или решение, создай Question/Fork/Blocker. Завершение попытки и человеческая приёмка DoD отдельны. Не заявляй изменение файлов, если у тебя нет отдельного инструмента для этого.

Проверьте единый дашборд нужного проекта: queued → настоящий ACK → running, затем реальные факты/вопросы обновляют агентов/попытки, внимание человека, карту/выбранный Flow и ленту без reload. Запишите ответ в Ouro, дождитесь подтверждения применения, отдельно разрешите продолжение и запросите ACK агента. После результата проверьте каждый DoD. Наличие plugin или свежего lastSeen не доказывает прохождения этого сценария.

Чтение файлов ограничено назначенной папкой, 200 entries/папку и 128 KiB UTF-8/файл, с hash и без write/shell. Подробные ограничения — в [инструкции проекта](project-workspace-guide.md).

## Если подключение не проходит

- **Нет tunnel в ChatGPT:** нужный workspace должен быть связан с tunnel; нужны отдельные workspace permissions и Tunnels Read + Use. Уточните их у администратора, не меняя проектный ключ.
- **Doctor/ready неуспешны:** проверьте runtime-key reference, tunnel_id, исходящий HTTPS, OURO_URL, читаемость agent-key file и команду Node. Сверьтесь с `/ui` и `doctor --explain`, сохраняя значения ключей вне диагностики.
- **401 от Ouro:** используйте регистрацию того же проекта, проверьте отзыв ключа и точный endpoint. Отказ доступа после потерянного ответа не доказывает отсутствие записи ранее отправленной команды.
- **Пустые назначения:** назначьте задачу этой регистрации в этом проекте. Имя «ChatGPT» само не выбирает агента.
- **Tools устарели:** перезапустите соответствующий сервер/bridge, в ChatGPT Plugins откройте подключение и **Refresh**, затем начните новый разговор.

Неопределённый исход команды выясняется точным повтором с исходными requestId, телом и expectedVersion. Ошибка транспорта не даёт основания автоматически создать новую задачу. [Правила восстановления](protocol-guide.md#ошибки-и-неизвестный-исход-записи).
