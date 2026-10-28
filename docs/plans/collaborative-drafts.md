# SDD/TDD · OURO-ENG-000008

[Контракт](../specs/collaborative-drafts.md). Сначала этот контракт и наблюдаемые RED, затем минимальный код и GREEN. Ошибка установки/IPC/локатора сама по себе не считается продуктовым RED.

| Область | RED | GREEN |
|---|---|---|
| C01–02: человеческие сессии и отзыв | Registry 0/3 на отсутствовавшем поведении; participant SSE возвращал 401 вместо 200; simulator принимал отзываемого участника и отвечал 200 вместо 403 | 13/13 focused: реальный SQL/reopen/hash-only/append-only, signed cookies, HTTP login/bootstrap/logout, запрет captured receipt/agent management после отзыва и stream reauth до/после SQL await; 2/2 browser — ниже |
| C03–04: Yjs, SQL, валидаторы и dedupe | 0/8: createCollaborativeDraft отсутствует; отдельно валидатор пропускал trailing bytes | В составе 11/11 draft-тестов; concurrent Y.Docs/DoD, delete-set, strict update, SQL reopen |
| C05: атомарная публикация | Первоначальный 0/8; независимое ревью: publish ошибочно принимал u2 до u1 | 11/11: project/draft/hash/base guards, rollback/outbox, exact receipt, Flow/no activation; pending structs/delete sets блокируют publish и переживают reopen |
| C06–07: два браузера, offline, stale base | Intent RED0/2: после401 терялся receipt и разрешалась смена основы; поздний GET мог снять публикацию | 5/5 collaborative browser: actual two-human convergence/DoD/caret/offline, late export, create/publish lost-response→401→re-entry exact retry, equal-version closed head |
| C08: общие проверки | Первый dev full45/46: общий30s budget старого mobile-теста; тот же тест без изменений5.6s на той же БД | 206/206 unit/integration, typecheck, build, 46/46 полных production E2E |

Ограничение: standalone человеческие ключи — отдельная идентичность, не внешний identity provider. Flow в shared draft сохраняется и просматривается, редактируется обычной новой ревизией в существующем процессном редакторе.

Identity browser gate: 2/2 на отдельном CI-сервере, порт 3217, собственная БД. Два настоящих браузерных контекста входят через UI по разным ключам и создают спеки с разными серверными actor ID. Проверены HttpOnly/SameSite, отсутствие ключей в browser storage, отказ человеческой cookie в MCP, отзыв через UI и запрет последующих чтений/записей. Невалидная participant-cookie после reload оставляет форму входа, не создавая демо-оператора.

Перед этим исправлены тестовые предположения: cold dev bootstrap требовал ожидания завершения загрузки; точный label DoD содержит дополнительный текст. Отдельный прогон попал на чужой worktree из-за занятого порта 3206 и не считается проверкой продукта. Итоговый прогон использовал CI=1 (без reuseExistingServer) и отдельный порт. [Граница доверенного локального оператора и прочитанный OWASP](../participants-guide.md).

Сверка upgrade-теста: легитимный список миграций расширен с [1,2,3] до [1,2,3,4,5], неизменяемая исходная история сохранена; selected agents+draft SQL checks18/18 GREEN. Первый общий прогон147/148 имел только прежнее ожидание migration list, не продуктовую ошибку.

Независимое ревью Yjs fixed types: скрытый list на Y.Map и скрытый map на Y.Text/Y.Array принимались при неизменном visible JSON — наблюдаемый RED; строгие constructor/internal-shape guards →11/11 SQL/draft GREEN. Метаданные head выделены из прежнего UI-правила: RED1/5 (закрытый draft вновь открывался равноверсионным GET) →GREEN5/5; observed publication теперь монотонна, несовместимый higher open head отклоняется.

UI intent RED: два реальных сценария lost response →401 ошибочно теряли receipt intent/разрешали менять основу. Исправление и повторные проверки выполняются отдельно; до GREEN готовность не заявляется.

Ограниченная Unicode-сверка по независимому ревью: RED0/5 — Yjs NUL принимался, Lesson JSONB22P05, Agent TEXT22021, participant lone-surrogate принимался. GREEN5/5 после guards plainText/criterion ID/local edit, lesson fields/tags, registration names. `isWellFormedUnicode` совпадает с общим helper Meridian; валидный emoji сохраняется точно, invalid input не выдаёт ключ и не создаёт запись. Итоговый merged unit gate206/206 и typecheck GREEN.

## Итоговый gate alpha.9

После rebase на `25f0925` (alpha.8) сохранены архив уроков, согласованная метрика, история решений, read-only cursor и операторский revoked-agent proof. Новые write panels находятся внутри существующего historical read-only guard. MCP inventory остаётся14 tools; alpha.9 согласована в package/lock/footer/SDK/stdio.

- `npm ci --cache /tmp/ouro-npm-cache` —179 пакетов.
- `npm run typecheck` и встроенный TypeScript production build — GREEN.
- `npm test` — **206/206**.
- `npm run build` — GREEN; Yjs/lib0 используются единым native Node require в server bundle, duplicate-import warning отсутствует.
- Полный Playwright по **проверенному production artifact alpha.9** на своём3227 и `/tmp/ouro-collab-alpha9-production-e2e` — **46/46**,1.6мин. Server запущен отдельно из этого worktree и перед reuse проверен по HTML-версии/session contract; чужой сервер не засчитывается.

Предварительный dev full45/46 имел единственный30s timeout суммарного старого graph/table/theme/mobile сценария; целевой повтор без изменения приложения/таймаута на той же заполненной БД прошёл5.6s. Финальный production full46/46, включая этот сценарий1.5s, заменяет этот предварительный результат.

Не заявляются внешний SSO/RBAC/tenancy, долговременный browser storage неотправленного текста, внешний PostgreSQL/нагрузочный аудит или одновременное редактирование самой Flow. Flow закрепляется и сохраняется; клавиатурные updates остаются техническими данными.

Production preview3007 использует собственную `/workspace/ouro-collab/.ouro/preview-postgres`. Browser smoke:0 page errors, создание/сохранение общего текста подтверждено, техническая версия1/hasPendingUpdates=false; project cursor остался35→35. Проверены dark desktop1440×1000 и light mobile390×844, мобильная навигация и отсутствие горизонтального overflow. Снимки: `/tmp/ouro-alpha9-collaboration-dark.png`, `/tmp/ouro-alpha9-collaboration-light-mobile.png`. Исходная alpha.2/её process/data не изменялись.
