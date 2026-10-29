# Changelog

Версии продукта следуют [Semantic Versioning](https://semver.org/). Версия переносимого протокола независима от версии приложения. Подробная история реализации и фактические проверки сохранены в `docs/plans/`.

## 0.1.0-beta.1 — 2026-10-29

Первый выпуск для локальной установки. Состав и приёмка: [release notes](docs/releases/0.1.0-beta.1.md), [журнал](docs/plans/first-release.md).

### Added

- Устанавливаемый исходный ZIP, manifest с точным commit SHA и SHA-256 checksums; отдельный tarball `@ouro/protocol@0.1.2`.
- Команда `npm run launch`: установка зависимостей, production build и локальный старт из распакованной папки без Git.
- Документированный workflow `main`/`dev`, английские имена веток и Conventional Commits, автоматические проверки соглашений и release CI.
- Инструкция обновления с сохранением `.ouro`, внешних key files и неизменяемых привязок выбранных папок.

### Included from the accepted prototype

- Локальные папки как отдельные проекты и единый realtime-дашборд: дорожная карта, Flow, агенты/попытки, вопросы/блокеры и события.
- Общий MCP-контракт с 18 tools / 49 схемами, HTTP/stdio bridge, профили Cursor/Claude Code/Claude Desktop и отдельный пример ChatGPT.
- Раздельные состояния исполнения, человеческого решения, применения, разрешения/ACK, строгих проходов и приёмки DoD.
- Immutable история/ревизии, воспроизведение, exact receipts, project scope, live SSE и восстановление после потери ответа.
- Source-backed предложения агента с человеческим черновиком, совместные черновики/участники, GitHub evidence, уроки, показатель дрейфа и импорт контекста Meridian в прежнем Human View.

### Scope

- Локальный prerelease; GitHub-архив не является размещённым веб-сервисом.
- Протокол остаётся 0.1.2; существующая история не переписывается.
- Native Windows/macOS/WSL, GUI/аккаунты всех клиентов и production tenancy требуют собственной приёмки. Подробности проверки каждой возможности находятся в [validation](docs/validation.md).

## 0.1.0-alpha.15 — 2026-10-29

- Готовые профили Cursor, Claude Code и Claude Desktop, безопасный повторный экспорт и print-only CLI конфигурации.
- Проверено344/344 unit/integration и71/71 production E2E; настоящий Claude Code 2.1.312 подтвердил MCP Connected в изолированном health-check без аккаунта и LLM.

## Earlier prototypes

Пакеты alpha.1–14 и их границы: [roadmap](docs/roadmap.md), [validation](docs/validation.md). Общая исходная история и прежние feature branches сохраняются; релиз не требует rebase или переименования старых коммитов.
