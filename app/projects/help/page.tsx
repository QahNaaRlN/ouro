import Link from 'next/link';

export default function ProjectHelp(){return <article className="ws-help">
  <Link href="/projects">← Проекты</Link><p className="ws-eyebrow">ОБЩИЙ MCP-КОНТРАКТ · ПОДКЛЮЧЕНИЕ</p><h1>Подключить агента к Ouro</h1>
  <p>Cursor, Claude Code и Claude Desktop подключаются к локальному Ouro через stdio bridge. Выберите нужный клиент в проекте: Ouro подготовит JSON с точным адресом проекта и путём к файлу ключа. ChatGPT подключается отдельно через Secure MCP Tunnel.</p>
  <p>Сначала запустите Ouro на своём компьютере. Затем откройте <code>http://127.0.0.1:3000/projects</code> или порт из строки Local вашего терминала. 127.0.0.1 обозначает устройство, на котором работает клиент; адрес из облачной среды сам по себе не открывает удалённый Ouro.</p>
  <nav className="ws-help-clients" aria-label="Клиенты MCP"><a href="#cursor">Cursor</a><a href="#claude-code">Claude Code</a><a href="#claude-desktop">Claude Desktop</a><a href="#chatgpt">ChatGPT</a></nav>
  <section aria-label="Общие шаги подключения"><h2>Сначала в Ouro</h2><ol>
    <li>Добавьте папку и откройте дашборд проекта. В «Назначить работу агенту» выберите MCP-клиент и нажмите «Зарегистрировать агента».</li>
    <li>Сохраните одноразовый ключ в отдельный локальный файл вне репозитория. В «Файл ключа агента» укажите его абсолютный путь. Ключ не нужно вставлять в JSON, URL или аргументы команды.</li>
    <li>Скопируйте конфигурацию либо скачайте JSON. Если настройки клиента уже существуют, добавьте только запись Ouro в mcpServers, сохранив остальные серверы. Node.js, bridge и файл ключа должны существовать по указанным абсолютным путям в среде запуска клиента.</li>
    <li>Для одновременной работы Cursor и Claude создайте отдельные регистрации и файлы ключей. Их действия и отзыв доступа будут различаться в дашборде.</li>
  </ol><p>Ключ Ouro даёт доступ к назначенной работе в одном проекте. Аккаунт, подписка или API-ключ клиента настраиваются в самом Cursor или Claude отдельно. Сохранение конфигурации не означает, что клиент уже подключился или модель начала работу.</p></section>
  <section id="cursor" className="ws-help-client"><h2>Cursor</h2><ol>
    <li>Выберите Cursor в панели подключения и получите конфигурацию.</li>
    <li>Добавьте её в <code>.cursor/mcp.json</code> папки, открытой в Cursor. Для всех проектов можно использовать <code>~/.cursor/mcp.json</code>. Конфигурация содержит mcpServers, а запись Ouro — type: stdio, command, args и env.</li>
    <li>В Cursor откройте настройки MCP в Customize, включите сервер Ouro и проверьте Available Tools. Разрешайте вызовы инструментов в соответствии с настройками доверия клиента.</li>
    <li>В Agent попросите прочитать назначение через <code>ouro.get_context</code>. Если изменили JSON и инструменты ещё не появились, обновите подключение или перезапустите Cursor.</li>
  </ol><p>Для локального stdio-подключения отдельный туннель не нужен. Если Cursor выполняет MCP в удалённой среде или контейнере, пути к Node.js, bridge и ключу должны быть доступны именно там.</p><a href="https://cursor.com/docs/mcp" target="_blank" rel="noreferrer">Официальная инструкция Cursor</a></section>
  <section id="claude-code" className="ws-help-client"><h2>Claude Code</h2><ol>
    <li>Выберите Claude Code в панели подключения. Скопируйте полный JSON в <code>.mcp.json</code> папки, из которой запускаете Claude Code; сохраните соседние записи mcpServers.</li>
    <li>Подтвердите доверие к проекту и разрешение MCP-сервера. Управление подключениями и их проверка доступны через <code>/mcp</code>; в терминале также доступны <code>claude mcp list</code> и <code>claude mcp get ИМЯ_СЕРВЕРА</code>.</li>
    <li>Можно использовать скачанный файл отдельно: <code>claude --mcp-config "/абсолютный/путь/ouro-claude-code-mcp.json"</code>. Это сохраняет существующие настройки клиента.</li>
    <li>Для <code>claude mcp add-json</code> нужна одна server entry, а не весь объект mcpServers. В панели Ouro откройте «Одна server entry для Claude Code CLI» и используйте формат импорта из официальной инструкции.</li>
  </ol><p>По умолчанию add-json использует локальную конфигурацию пользователя для текущей папки. Общий проектный файл .mcp.json может требовать отдельного подтверждения перед запуском сервера.</p><a href="https://code.claude.com/docs/en/mcp" target="_blank" rel="noreferrer">Официальная инструкция Claude Code</a></section>
  <section id="claude-desktop" className="ws-help-client"><h2>Claude Desktop</h2><ol>
    <li>Выберите Claude Desktop и получите JSON с command, args и env.</li>
    <li>В Claude Desktop откройте Settings → Developer → Edit Config. Добавьте запись Ouro в <code>claude_desktop_config.json</code>, сохранив остальные подключения.</li>
    <li>Полностью закройте приложение и запустите его заново. Найдите Ouro в Connectors → Manage connectors и проверьте доступные инструменты.</li>
    <li>Откройте разговор с разрешённым подключением и попросите Claude вызвать <code>ouro.get_context</code>.</li>
  </ol><p>Обычный путь macOS: <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>. Windows: <code>%APPDATA%\Claude\claude_desktop_config.json</code>. Если приложение использует другой путь, ориентируйтесь на Edit Config.</p><a href="https://modelcontextprotocol.io/docs/2026-07-28/develop/connect-local-servers" target="_blank" rel="noreferrer">Официальная инструкция локальных MCP-серверов</a></section>
  <section id="chatgpt" className="ws-help-client"><h2>ChatGPT</h2><ol>
    <li>Выберите ChatGPT в панели Ouro, сохраните ключ и получите stdio-конфигурацию этого проекта.</li>
    <li>Установите официальный tunnel-client и настройте Secure MCP Tunnel со stdio-профилем, командой, аргументами и переменными OURO_URL / OURO_AGENT_TOKEN_FILE из конфигурации.</li>
    <li>Подключите туннель в аккаунте ChatGPT по официальной инструкции. Доступ зависит от прав аккаунта и workspace. Ключ OpenAI для туннеля настраивается отдельно от ключа Ouro.</li>
  </ol><a href="https://developers.openai.com/api/docs/guides/secure-mcp-tunnels" target="_blank" rel="noreferrer">Secure MCP Tunnel</a><p><a href="https://developers.openai.com/plugins/deploy/connect-chatgpt" target="_blank" rel="noreferrer">Connect and test в ChatGPT</a></p></section>
  <section><h2>Начать работу и видеть её ход</h2><p>В проекте выберите регистрацию агента, введите цель и DoD, нажмите «Начать работу». Скопируйте задание для агента и передайте его в выбранном клиенте. Агент сначала читает ouro.get_context с executionId, затем отправляет ouro.confirm_started. До этого попытка остаётся в ожидании.</p><p>Попросите агента сообщать Action с evidence, вопросы, развилки и блокеры через инструменты Ouro. Стандартные сообщения обновят дашборд. Собственные файловые и shell-инструменты IDE не становятся автоматически событиями Ouro; агент должен явно сообщать выполненные действия.</p><p>Вопросы решает человек. Применение решения, разрешение продолжения, ACK, предъявление результата и человеческая приёмка DoD фиксируются отдельно. Файловые инструменты Ouro дают чтение назначенной папки; права редактора и терминала Cursor/Claude Code задаются самим клиентом.</p></section>
  <p>Инструкции в репозитории: <code>docs/agent-clients-guide.md</code>, <code>docs/chatgpt-guide.md</code> и <code>docs/project-workspace-guide.md</code>.</p><a href="https://github.com/QahNaaRlN/ouro/blob/feat/client-onboarding/docs/agent-clients-guide.md" target="_blank" rel="noreferrer">Пошаговая инструкция и устранение проблем</a>
</article>;}
