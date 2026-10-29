# Cursor и Claude · SDD/TDD

29.10.2026 · [SDD OURO-ENG-000016](../specs/client-onboarding.md) · база `cdfb7ae`. Собственный worktree `/workspace/ouro-clients`, ветка `feat/client-onboarding`; пользовательский экземпляр и прежние preview не меняются.

До кода зафиксированы CO01–CO07, общий pure генератор, JSON wrapper/entry различие, абсолютные пути/file-key credentials, отсутствие автоматической записи клиентских настроек и честная граница настоящего IDE/desktop подключения. Прочитаны актуальные официальные Cursor/Claude Code/Desktop документы. Фактические RED/GREEN и результаты ревью добавляются по мере исполнения.

## Наблюдавшиеся RED → GREEN

Генератор сначала воспроизводил прежний generic stdio JSON:1/6 pass,5 fail — не было Cursor/Claude Code type, полный projectId не сохранял уникальность server name и отсутствовали новые отказы валидации. Загрузка модулей работала; RED не был ошибкой отсутствующего файла. Финальный target7/7 GREEN включает реальные CLI subprocess: wrapper/entry, вывод без ключа, запуск из чужой CWD и отсутствие изменений клиентских файлов. Дополнительный RED sparse argv исправлен проверкой плотного массива перед экспортом.

UI до реализации проверен на работающей alpha.14:0/2 RED — отсутствовали выбор MCP-клиента и общая help-страница. После изменений новые2 и затронутые прежние workspace3 дали5/5 GREEN (24s); финальные новые2 повторены2/2 GREEN (5.1s). Копирование/скачивание не содержит token, скрытие ключа не требует новой регистрации, A/B navigation не сохраняет старый JSON, mobile390 без overflow.

Root `agent-client-stdio.test.ts`:1/1 GREEN (5.7s). Для Cursor, Claude Code и Desktop именно сгенерированные entries запустили настоящий Node bridge через официальный SDK:18 tools/resources, собственная identity/assigned context, чтение файла с SHA-256 и реальный ACK. Три клиента имеют отдельные keys/actors. Ключ A на URL B отклонён без утечки значения; отзыв одной регистрации не меняет действительность другой. Это transport/config acceptance, не запуск трёх GUI-приложений.

## Реальная проверка Claude Code

Независимый reviewer установил официальный `@anthropic-ai/claude-code@2.1.312` в scratch `/tmp/ouro-claude-review-BT1D5x/cli`, не globally. `CLAUDE_CONFIG_DIR` и рабочая папка также изолированы; исходные пользовательские настройки не читались и не менялись. `mcp add-json --scope local` получил single entry от итогового генератора; `mcp list/get` показали **Connected**, а Ouro зафиксировал lastSeen. Проверены семантические отказы для A-key на B URL и отозванного A-key. Одного exit0 недостаточно: проверялись текст статуса и присутствие на сервере.

CLI работал без login/account/LLM-команд. Key file0600 был вне назначенной папки, с Unicode/пробелами/apostrophe/emoji в имени; значение не попадало в argv/JSON/output. Временные entries удалены, регистрация отозвана, ключ/контекст удалены. Доказательства: `/tmp/ouro-clients-claude-health-summary.json`, `/tmp/ouro-clients-claude-health.log`, независимое ревью `/tmp/ouro-clients-review-results.md`.

Блокеров source review не обнаружено. Cursor и Claude Desktop GUI, аккаунты и native Windows/macOS/WSL отдельно не запускались. У Cursor/Claude Code есть собственные edit/shell tools; read-only относится только к файловым tools Ouro. Дашборд получает только явно переданные контрактом факты. Протокол0.1.2, его18 tools/49 схем и доменные статусы остались прежними.

## Общая приёмка

Полный unit/integration прогон344/344 GREEN без пропусков (87.25s), `/tmp/ouro-clients-unit.log`. Typecheck/build и production browser gate фиксируются ниже по завершении.
