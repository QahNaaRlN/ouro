# SDD/TDD · OURO-ENG-000010

[Контракт](../specs/meridian-context.md) зафиксирован коммитом edca708 до реализации.

Передача Ouro-side на базе GitHub `239d6de`: **153/153 unit/integration, 24/24 теста пакета внутри этого набора, 32/32 E2E на отдельном свежем seed fixture, typecheck и production build успешны**. Итоговый стек с новыми участниками, AI и быстрым replay проверяется после rebase. Нативная часть остаётся RFC.

Production smoke отдельного процесса3309 с отдельной БД: страница/импортный preview и переключение темы прошли, page errors=0. Сняты и просмотрены dark/light screenshots; тестовый процесс остановлен. Тестируемые пользователем preview не затронуты.

| Проверка | RED | GREEN |
|---|---|---|
| Parser/mapping | 0/4: операции импорта отсутствовали | 4/4: точный synthetic DTO, неизвестные поля/flags/pins, UTF-8/duplicate keys/u64/size/depth, пути, mapping verification |
| Typecheck | Ошибки narrowed pair и проверки отсутствующих полей в тесте | Исправлена типизация после полноценной проверки пары; typecheck успешен |
| Domain/store | 0/5: неизвестная команда и отсутствие import store method | 5/5: human draft/provenance, server proof, SQL reopen/exact bytes+SHA/receipt before version, rollback outbox/revision/source/receipt, denial generic/agent/unknown metadata |
| HTTP | Dedicated budget RED: обычный 256 KB предел отклонял допустимый 300 KB source; dedicated handler отсутствовал | 3/3: отдельный 2 MiB envelope, default generic budget сохранён, streamed overflow cancelled, malformed UTF-8/Origin/auth/unknown input без эффекта |
| Статические темы | Новый адаптер отсутствовал; два теста не находили его модуль | 2/2: реальные pinned tokens light/dark, закрытый enum, мутация результата не изменяет последующие вызовы |
| Browser | Страница загружалась, но отсутствовал регион импорта | 3/3: invalid/mobile/light без событий, file→edited draft→pins+exact source download, lost response→same body+requestId→точная SpecCreated |
| Browser review | После потерянного ответа повтор 401 открывал поля для изменения: readOnly=false | Исправлено: неизвестный исход и прежнее тело сохраняются даже при последующем отказе доступа; квитанция снимает неопределённость |
| Review границ | 0/3: пустой DoD оставлял неработоспособный preview; обычная proposed revision сохраняла claimed origin; непредвиденная SQL ошибка логировалась с её аргументами | 3/3: явная mapping error, guard metadata у обычных create/propose, неизвестные исключения адаптера без raw log/echo |
| RAM recovery при уходе из панели | После потерянного ответа поле исчезало при возврате в «Интеграции»; beforeunload не защищал пакет | Home хранит один scoped intent вне форм; точные тело/requestId восстанавливаются после unmount. Неотправленные изменения и принудительная перезагрузка отдельно не персистятся |
| Доказанное отсутствие квитанции | SQL test не находил marker; browser получил409 с meridianReceipt=undefined | Store отмечает только VERSION_CONFLICT после receipt lookup как meridianReceipt:absent; UI освобождает пакет для явного human rebase,401 и неизвестный исход остаются sealed |
| Независимое Unicode review | 5 RED: escaped lone high/low surrogate проходили parser; edited goal/Flow давали SQL22P02, NUL давал22P05. Один positive pair-case проходил | 6/6: Unicode scalar/NUL guards до JSONB, сохранение валидных surrogate pairs и точного raw UTF-8 digest. Reviewer независимо подтвердил GREEN |
| Участник сменился в другой вкладке | HTTP и browser получили409 с proof-of-absence другого участника вместо401; первоначальный импорт уже был записан от исходного named human | `X-Ouro-Expected-Participant` сверяется до store lookup:401 без proof-of-absence, sealed RAM-пакет переживает исторический режим, возврат исходного участника получает ровно прежнюю квитанцию. Отзыв его cookie запрещает импорт без fallback в demo |

На базе GitHub `239d6de`: полный прогон146/146 unit/integration после трёх review-исправлений;31/31 browser сценарий, включая весь прежний набор и 3 Meridian, успешен; production build прошёл. Последующее RAM recovery и proof-of-absence проверяются сфокусированно и входят в конечный повтор ниже. Проверка последующего стека с lessons/metrics/methodology/collaboration/AI выполняется после rebase; эти результаты относятся к текущей базе.

После RAM recovery и proof-of-absence:147/147 полный unit;18/18 сфокусированных тестов;4/4 Meridian E2E. После независимого Unicode review:24/24 сфокусированных теста и typecheck успешны. После заморозки продуктового кода конечный повтор153/153 unit,32/32 browser на отдельном свежем fixture и production build успешны.

Накопленная тестовая БД `/tmp/ouro-meridian-e2e` сохранена. На старой базе `239d6de` повтор32 сценариев при сотнях событий дал30 PASS и два5-секундных ожидания обновления старых Flow/States; четыре Meridian проходят. Отдельный повтор Flow прошёл. Это не объявляется полным GREEN на накопленной базе. Методологический пакет уже содержит отдельное ускорение authoritative replay visitor (`25f0925`, измерение350 событий1001ms→15ms); он войдёт после rebase и затем проверяется общим стеком. Графы и timeouts в этом пакете не менялись. Для собственной ограниченной приёмки выполняется отдельный свежий seed fixture; он не заменяет сохранённую БД или итоговый gate стека.

Адаптированы непосредственно прочитанные pure validators work-scope.ts и reference coherence из project-work.ts. Нативный transport/host reader не скопирован. Дополнительный scanner отклоняет duplicate JSON keys до потери информации в JSON.parse; byte decoder не скрывает BOM и ошибочную UTF-8 последовательность. Ограничение depth64 — дополнительная граница Ouro. Успех этих проверок не подтверждает подлинность документа или связь с настоящим Meridian.

После включения participant identity default обработчика использует асинхронный authenticatedParticipant; общий store проверяет действующее human полномочие под project lock. Home использует ID authenticated participant, очищает RAM-пакет при смене известной identity и хранит его вне условных read-only исторических форм. Отдельная проверка expected participant защищает неизвестный результат, когда cookie сменилась без обновления identity этой вкладки. Browser проверяет настоящее named human авторство, потерю ответа, смену cookie, исторический read-only режим, возврат исходного участника и отзыв доступа.

[Native RFC](../proposals/meridian-native-bridge.md) содержит конкретные ограничения новых команд и Windows/WebView2 приёмку. Репозиторий Meridian, capability и CSP не менялись. Live host, SSO и Windows не проверялись; synthetic fixture не выдаётся за native capture.
