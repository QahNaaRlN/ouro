# SDD/TDD · OURO-ENG-000003

Основание: [SDD](../specs/live-updates.md).

| Область | RED | GREEN |
|---|---|---|
| SSE route, SQL delivery, abort | RED0/8: auth200, JSON вместоSSE, нетframe | 8/8 среальнымSQL и независимымHTTPfetchclient |
| Монотонное применение snapshot | RED0/11stubs; отдельныеREDнаsameID/другоеcontent, projectionбезevents, delayedrecovery | 14/14snapshot/controller/review +3filtertests |
| Draft/focus/reconnect и filters | BrowserRED: streamRequests0 послеbootstrap; позднийGETмоготкатитьданные; createвыбиралчужуюновуюспеку | 6liveE2E+2filterE2E+racecreate; finalgateниже |
| Регрессии и build | База alpha.3:63+13 | 88/88unit/integration, полный22/22E2E и productionbuild успешны |

Не подменять фактические проверки предположением. Старый preview3000 не изменяется.

Независимое ревью выявило и проверило RED: нельзя менять payload прошлого события под тем же ID; projection должна соответствовать core replay; старый неудачный recovery GET не вправе отменить более новый connected. Исправлены canonical comparison (JSONB порядок ключей не мешает), проверка тем же replay и отсутствие устаревшего status override. Offline не скрывает terminal reload-required.

Отдельный браузерный RED: create response после чужой новой спеки выбирал specs.at(-1). Теперь выбран точный SpecCreated.id из receipt собственных events. Формы держат pinned revision/version, ModalDialog не сбрасывает focus при смене callback.

При общем прогоне обнаружены fixture assumptions: одинаковый заголовок разных Question требовал выбора по Human ID; карточка вне viewport большого накопленного fixture выбирается доступным табличным путём. Assertions не ослаблены: проверяются точный запрос/commit и совпадения обеих проекций. Повтор targeted6/6 после исправления, затем полный22/22E2E успешен.

Реально изучены WHATWG§9.2.3–9.2.7, MDN SSE/ReadableStream и текущие Next Route Handler streaming. Native Last-Event-ID обновляется до callback — поэтому malformedframe закрывает source и восстанавливается от appliedcursor. Node24/Next16.4.3/PGlite/Chromium; внешний PostgreSQL multi-process и нагрузочный benchmark отдельно не заявляются.
