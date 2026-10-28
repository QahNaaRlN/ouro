# SDD/TDD · OURO-ENG-000008

[Контракт](../specs/collaborative-drafts.md). Сначала этот контракт и наблюдаемые RED, затем минимальный код и GREEN. Ошибка установки/IPC/локатора сама по себе не считается продуктовым RED.

| Область | RED | GREEN |
|---|---|---|
| C01–02: человеческие сессии и отзыв | Registry 0/3 на отсутствовавшем поведении; participant SSE возвращал 401 вместо 200; simulator принимал отзываемого участника и отвечал 200 вместо 403 | 13/13 focused: реальный SQL/reopen/hash-only/append-only, signed cookies, HTTP login/bootstrap/logout, запрет captured receipt/agent management после отзыва и stream reauth до/после SQL await; 2/2 browser — ниже |
| C03–04: Yjs, SQL, валидаторы и dedupe | 0/8: createCollaborativeDraft отсутствует; отдельно валидатор пропускал trailing bytes | В составе 11/11 draft-тестов; concurrent Y.Docs/DoD, delete-set, strict update, SQL reopen |
| C05: атомарная публикация | Первоначальный 0/8; независимое ревью: publish ошибочно принимал u2 до u1 | 11/11: project/draft/hash/base guards, rollback/outbox, exact receipt, Flow/no activation; pending structs/delete sets блокируют publish и переживают reopen |
| C06–07: два браузера, offline, stale base | Ожидается | Ожидается |
| C08: общие проверки | Ожидается | Ожидается |

Ограничение: standalone человеческие ключи — отдельная идентичность, не внешний identity provider. Flow в shared draft сохраняется и просматривается, редактируется обычной новой ревизией в существующем процессном редакторе.

Identity browser gate: 2/2 на отдельном CI-сервере, порт 3217, собственная БД. Два настоящих браузерных контекста входят через UI по разным ключам и создают спеки с разными серверными actor ID. Проверены HttpOnly/SameSite, отсутствие ключей в browser storage, отказ человеческой cookie в MCP, отзыв через UI и запрет последующих чтений/записей. Невалидная participant-cookie после reload оставляет форму входа, не создавая демо-оператора.

Перед этим исправлены тестовые предположения: cold dev bootstrap требовал ожидания завершения загрузки; точный label DoD содержит дополнительный текст. Отдельный прогон попал на чужой worktree из-за занятого порта 3206 и не считается проверкой продукта. Итоговый прогон использовал CI=1 (без reuseExistingServer) и отдельный порт. [Граница доверенного локального оператора и прочитанный OWASP](../participants-guide.md).

Сверка upgrade-теста: легитимный список миграций расширен с [1,2,3] до [1,2,3,4,5], неизменяемая исходная история сохранена; selected agents+draft SQL checks18/18 GREEN. Первый общий прогон147/148 имел только прежнее ожидание migration list, не продуктовую ошибку.

Независимое ревью Yjs fixed types: скрытый list на Y.Map и скрытый map на Y.Text/Y.Array принимались при неизменном visible JSON — наблюдаемый RED; строгие constructor/internal-shape guards →11/11 SQL/draft GREEN. Метаданные head выделены из прежнего UI-правила: RED1/5 (закрытый draft вновь открывался равноверсионным GET) →GREEN5/5; observed publication теперь монотонна, несовместимый higher open head отклоняется.

UI intent RED: два реальных сценария lost response →401 ошибочно теряли receipt intent/разрешали менять основу. Исправление и повторные проверки выполняются отдельно; до GREEN готовность не заявляется.
