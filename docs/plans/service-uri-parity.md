# Журнал совместимости URL

Дата:2026-11-04. Статус:IN_PROGRESS. Ветка `codex/service-uri-parity`, база `85039af`.

Порядок: installed Next source/manifest → raw production baseline на отдельном профиле → RED transport fixture → минимальный normalizer и body ownership → GREEN + regressions → peer review/CI → эпик.

Прочитаны установленные `next/dist/server/lib/router-utils/resolve-routes.js`, `shared/lib/router/utils/parse-relative-url.js`, `server/server-route-utils.js`, `shared/lib/utils.js` и `.next/routes-manifest.json`. Проверка pathname предшествует Web Request/route admission; trailing slash — отдельный механизм.

## Фактические результаты

- Production Next16.4.3/Node24.19.0 на отдельном loopback3422, `.operations/next-uri-baseline-profile`, минимальный child environment без DB URLs/credentials. Raw Node HTTP сохранил исходный request-target. **16 cases**, включая14 redirects и2 отрицательных controls, записаны до изменения production-кода. Источник — квалифицированный predecessor900290a; ни один рабочий профиль не использовался.
- Важное обнаруженное различие сохранено: повторные slash/backslash возвращают raw search, а последующий trailing-slash308 сериализует decoded query через прежний `encodeURIComponent`: пробелы `%20`, группировка duplicate keys, порядок integer keys, пустые значения и percent-case отражены в [точном fixture](../../apps/service/tests/fixtures/uri-baseline.json). Непостоянные Date/connection framing исключены; status/Location/Refresh/redirect body и отсутствие Content-Type сохранены. HEAD body пуст.
- Meaningful RED:18 tests,2 PASS/16 FAIL (включая parent subtest). Новый Hono server возвращал404/200 вместо нужных308. Ошибок установки/сокетов не было. После реализации **19/19 GREEN**: все16 raw случаев, два исходных redirect hops с неизменными UTF-8 POST bytes и незавершённый raw POST, получивший redirect до EOF.
- Реализация normalizer не импортирует Next. Переход relative, Host не становится целью redirect. Доменный handler не запускается на redirect. Отдельный owner читает ненужное body только после finish, ограничивает discard2MiB/500ms, освобождает listeners/timer на terminal paths и отменяется при shutdown.
- Полный service suite после изменения early HTTP listener: **56/56 PASS,0 skip/fail** (88.7s), включая прежние auth/cookies/Origin, raw webhook, SSE/cancel, body limits, background/SQL/worker/store cleanup, packaged artifact и startup-failure cases.
- Service strict TypeScript и ESM artifact build PASS. Root TypeScript, architecture771/zero violations/16 exact legacy edges, migration baseline47/59, finite styles и conventions PASS. Исторический HTTP baseline не изменён.
- Независимый read-only review проверил relative URL/query semantics, порядок двух hops, отсутствие domain admission, HEAD/POST и terminal/shutdown ownership. Замечаний не обнаружено; peer не запускал suite, приведённые56 — корневой фактический run.

Scope: Windows Node24.19 и HTTP/1 origin-form. Linux CI и полный production UI/service cutover ещё PENDING. Полная совместимость произвольного proxy target/case-folding/dot-segment beyond fixture не объявляется. Fixtures, log и profile находятся в собственном `.operations`; canonical baseline содержит только стабильные наблюдаемые поля.
