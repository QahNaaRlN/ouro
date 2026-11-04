# Сохранение нормализации URL при выделении HTTP-сервиса

Дата:2026-11-04. Ветка `codex/service-uri-parity` от эпика `85039af`. Это отдельная граница совместимости P2, ранее явно оставленная открытой.

Существующий Next16.4.3 до route handler возвращает308 для повторных slash/backslash в pathname; последующий framework redirect убирает trailing slash. Query, метод и смысл тела запроса должны сохраняться. Одного перечня47routes/59methods недостаточно, чтобы это поведение считать перенесённым.

До кода фиксируется реальный production Next baseline с raw HTTP request-target, отдельным fixture profile/портом и установленной версией. Проверяется pathname, а не только нормализованный WHATWG URL: обычный URL-клиент заранее скрывает часть backslash/repeated-slash случаев. Сравниваются статус, Location, Refresh и тело redirect. Фактический baseline выявил важное различие: repeated-slash/backslash redirect сохраняет raw search, а отдельный trailing-slash redirect декодирует query и сериализует его с прежним `encodeURIComponent`. Значения query сохраняют смысл; воспроизводится проверенная форма обоих механизмов, включая duplicate values. Несколько прежних redirect hops не объединяются без основания.

Область реализации: origin-form HTTP request targets, которые относятся к существующим API/UI/assets; normalizer перед Web Request/Hono, собственный lifecycle незавершённого body и shutdown. Redirect не исполняет domain handler и не разрешает сторонний host. Нет новых CORS/forwarded-header trust правил. Транспортные guards, авторизация и отсутствие SPA fallback для отсутствующих API/assets сохраняются. Case folding, dot-segment и произвольный absolute-form proxy target не объявляются квалифицированными одной этой историей.

Выход: реальный исходный baseline; meaningful RED новой реализации; GREEN raw HTTP GET/HEAD/POST redirect cases, неизменённые query/body/method semantics и корректное завершение незаконченного upload/shutdown; подходящие service typecheck/build/regressions. Результаты — в [журнале](../plans/service-uri-parity.md). Домен, протокол, живые профили и Meridian не меняются.
