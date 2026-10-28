# RFC · узкий нативный мост Meridian ↔ Ouro

2026-10-28 UTC · предложение для отдельного пакета хоста. Реализованный Ouro-side импорт описан в [инструкции](../meridian-guide.md). Этот RFC не объявляет native/SSO готовыми и не изменяет репозиторий Meridian.

## Проверенное основание

Изучен desktop snapshot Meridian [`1d3a9f8`](https://github.com/QahNaaRlN/meridian/tree/1d3a9f80b196498b5fe2d8a1357f2aaef2aa9c76), а не CLI из `main`.

- [Native IPC](https://github.com/QahNaaRlN/meridian/blob/1d3a9f80b196498b5fe2d8a1357f2aaef2aa9c76/meridian-desktop/src/native.rs) проверяет trusted main window и принимает raw UTF-8 bytes. [Envelope](https://github.com/QahNaaRlN/meridian/blob/1d3a9f80b196498b5fe2d8a1357f2aaef2aa9c76/meridian-desktop/src/ipc.rs) — `owner-panel-ipc/v1`, точный request_id и закрытые DTO.
- [CSP](https://github.com/QahNaaRlN/meridian/blob/1d3a9f80b196498b5fe2d8a1357f2aaef2aa9c76/meridian-desktop/tauri.conf.json): `connect-src ipc: http://ipc.localhost`, `frame-src 'none'`. [Capability owner-panel-read](https://github.com/QahNaaRlN/meridian/blob/1d3a9f80b196498b5fe2d8a1357f2aaef2aa9c76/meridian-desktop/capabilities/owner-panel-read.json) явно не даёт writer/fs/shell/http.
- [Scope DTO](https://github.com/QahNaaRlN/meridian/blob/1d3a9f80b196498b5fe2d8a1357f2aaef2aa9c76/meridian-desktop/ui/src/api/work-scope.ts) содержит `ordinary_writer:false`, `actions_authorized:false`, конкретный snapshot_id, выбранные subject/run и pins. [Project session](https://github.com/QahNaaRlN/meridian/blob/1d3a9f80b196498b5fe2d8a1357f2aaef2aa9c76/meridian-desktop/ui/src/api/project-session.ts) связывает активный проект с provider/workspace; это контекст чтения, не личность человека.
- [Team identity](https://github.com/QahNaaRlN/meridian/blob/1d3a9f80b196498b5fe2d8a1357f2aaef2aa9c76/governance/specifications/haee/team-identity-and-access.md) имеет `NOT_STARTED/DEFERRED`: «Сетевой/team backend пока не выбран». Действующий SSO-токен в контракте отсутствует.
- [Словарь ядра](https://github.com/QahNaaRlN/meridian/blob/1d3a9f80b196498b5fe2d8a1357f2aaef2aa9c76/meridian-core/src/run_contracts/vocabulary.rs) разделяет lifecycle_stage и work_status. `waiting_human` не тождественен `blocked`; завершённый запуск не означает принятую Spec в Ouro.

## Предлагаемый ограниченный пакет хоста

Нативная панель компонуется из локально собранных компонентов. Полный Next SSR-сервер нельзя просто скопировать в Tauri frontend; нужен отдельный frontend entry для компактной формы контекста и черновика. iframe и ослабление CSP для этого не требуются.

В хосте предлагаются две отдельные команды. Имена ниже — новые проектные предложения, не существующие API:

1. `ouro_context_read`: read-only companion над существующими admitted session + work_scope_read. Принимает `{view_handle,request_epoch,projection_version:1,selection:[ровно один subject/run]}` в обычном строгом envelope. Под одним контекстом активного проекта проверяет provider/workspace/project/repository и выбранные pins. Возвращает `{contract:'meridian-ouro-context',contract_version:1,request_epoch,context_token,project_binding,scope,theme}`. `project_binding` содержит только `{project_id,repository_id,provider_id,workspace_id,view_scope_ref,policy_sha256,manifest_sha256}` с теми же правилами идентификаторов и hashes, что у фактического read-контракта. `scope` — неизменённый `meridian-work-scope-view/v1`; `theme` — только `light|dark`; context_token — ограниченный непрозрачный токен RAM-снимка, закрываемый при смене проекта/selection. Вход<=32 KiB, выход<=1 MiB с учётом дублирования координат; неизвестные поля/версии отклоняются. Токен не даёт права записи.
2. `ouro_draft_import`: отдельная явно включаемая capability для создания черновика **в Ouro**. Обычный Meridian Writer остаётся false. Принимает только `{context_token,command_id,expected_project_version,content}` после видимого подтверждения человеком. `command_id` — неизменяемый business requestId импорта; внешний envelope request_id обозначает конкретный вызов IPC и может отличаться при повторе. Native controller берёт исходный документ из своего pinned RAM-снимка, повторно сверяет active session и направляет фиксированный POST `/api/meridian/import` в заранее настроенный Ouro. Нет URL, HTTP-метода, заголовков, пути файла или shell-команды из webview. Запрос<=2 MiB, ответ ограничен; при превышении ответа показывается неопределённость и восстанавливается квитанция, успех не подставляется.

Bindings хоста настраиваются оператором явно: один проект Meridian → один Ouro project, фиксированный loopback endpoint, отдельный отзываемый human credential Ouro. Разрешены только HTTP `127.0.0.1`/`[::1]` и выбранный порт; redirects запрещены. Native отправка имеет timeout, ограничение очереди и body caps. Аутентификация не использует view_handle/context_token как human credential. Credential остаётся в нативном credential store; renderer получает только состояние доступа. Если подходящего нативного credential store нет, пакет ограничивается read-only preview до согласования его конкретной реализации.

Отправка хранит один устойчивый request_id и неизменяемое тело до квитанции. При timeout/потере ответа нельзя создавать новое поручение или считать результат отсутствующим. Человек видит «результат не подтверждён», повтор получает прежнюю квитанцию. Отзыв доступа и смена active project прекращают новые записи, но сохраняют техническую информацию для выяснения исхода уже отправленного запроса.

Ouro v1 продолжает ставить `transportVerification:'unverified_import'`: даже нативный caller сам по себе не является подписанным свидетельством для внешнего сервера. Для повышения доверия потребуется отдельный согласованный аутентифицированный provenance-контракт; изменять v1 молча нельзя. SSO в этот пакет не включается.

Theme adapter применяет только закреплённую палитру по enum. Нельзя пересылать произвольный CSS/URL или позволять теме менять роль, проект и черновик. Уведомление о смене темы не подтверждает готовность источника или право запуска.

## Что требуется проверить на Windows/WebView2

- Trusted main window, неверные origin/label, JSON вместо Raw, unknown keys/version, request_id mismatch и byte caps.
- Смена проекта/selection во время чтения/отправки: поздний ответ не подменяет новый контекст; старый токен не разрешает новую запись. Exact project/provider/workspace/run/spec/context pins сохраняются.
- Только явная human-команда создаёт idea; активация, запуск и приёмка не происходят. Истёкший/отозванный Ouro credential отклоняется при операции.
- URL/method/path/header injection, redirects и oversized streaming response не расширяют нативную capability. CSP сохраняется; owner-panel-read не получает generic HTTP/fs/shell.
- Потеря ответа после SQL commit, перезапуск контроллера и отзыв ключа позволяют отличить подтверждённую квитанцию от неизвестного исхода. Повтор не создаёт вторую Spec.
- Тёмная/светлая тема совпадает с реальными tokens; ввод, фокус, cursor и исходный pinned документ сохраняются. Отсутствующий host/service даёт явную недоступность.

Parser/store/browser tests Ouro проверяют только свою сторону. Нативный пакет считается проверенным после реального Windows/WebView2 результата, без подмены Node fixtures нативными evidence.

## Полномочия и конкретная оставшаяся граница

В [Meridian AGENTS.md §5.1](https://github.com/QahNaaRlN/meridian/blob/1d3a9f80b196498b5fe2d8a1357f2aaef2aa9c76/AGENTS.md) сказано: «Обычный Writer=false, реальные данные вне области; roadmap не разрешает новый пакет, Git, установку или выпуск и не заменяет контракты/назначения/приёмки». Там же: «До готовности и приёмки MVP развивать и проверять только Windows». Последнее разовое Git-назначение2026-10-27 относится к передаче snapshot и заканчивается после публикации.

Эти правила относятся к изменениям самого Meridian. Они не препятствуют реализованному Ouro-side импорту. Для изменения host controller/capability/credential storage нужен конкретно назначенный нативный пакет с границами выше и Windows-средой; текущий RFC делает такой результат предметным для отдельного решения владельца. Изменения Meridian, live IPC, credential provisioning и native acceptance здесь не выполнялись.

## Прочитанные ориентиры

- [Tauri IPC](https://v2.tauri.app/concept/inter-process-communication/): command boundary и сериализуемые сообщения; применён фиксированный набор операций вместо общего webview→HTTP proxy.
- [Tauri CSP](https://v2.tauri.app/security/csp/): доступ внешних ресурсов задаётся явно; существующий запрет iframe сохраняется.
- [OWASP Input Validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html), [прочитанный исходник](https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Input_Validation_Cheat_Sheet.md): серверная проверка формата и семантической согласованности, allowlist и ограничения длины. Применены повторная серверная проверка закрытого DTO и ограничения bytes до parsing; валидация не выдаётся за аутентификацию источника.

Непосредственные shape/limits/pin-инварианты взяты из прочитанного исходного кода Meridian, а не из универсальных рекомендаций.
