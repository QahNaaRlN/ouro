# SR · Полный backend runtime отдельного сервиса

Дата: 2026-11-04. Story разрешён владельцем эпика. Основание — принятые D01–D16 и предшествующая ограниченная transport qualification.

## Результат и границы

`apps/service` получает явную таблицу всех 47 исходных HTTP routes (59 экспортированных методов), единственный переданный store owner и управляемые startup/readiness/shutdown. Предметные правила, JSON/HTTP/MCP/cookie/SSE-контракты и схемы SQL сохраняются. Backend не получает hFSD. Next временно сохраняет рабочее API и рабочий профиль; новый runtime проверяется только на memory/temp fixture. Глобальный cutover выполняет интегратор после проверки паритета. Два процесса не открывают рабочий PGlite параллельно. Результат story — ограниченная runtime qualification; полный P2, packaged runner и browser parity отдельно не принимаются.

В этот story не входят изменение root launch/Docker, UI/Tailwind 4, публикация, native host или работа с существующими профилями. Service CLI принимает явные настройки; loopback — default, внешний bind требует явного режима и public origin. Статические ресурсы/SPA — опциональная capability, не доказательство готового Vite UI.

## Архитектура

- Transport остаётся Web Request/Response; параметры Hono преобразуются в типизированный application context.
- Auth/workspace/application factories получают store и runtime configuration явно. Compatibility defaults Next сохраняются, но service composition не обращается к глобальному store.
- Startup валидирует config/resources, получает эксклюзивное владение embedded profile, выполняет существующие migrations и seed до readiness, затем запускает observer/worker owners.
- Storage adapter использует встроенный Node 24.19 SQLite только как OS mutex metadata: rollback DELETE, собственный application ID/marker, BEGIN EXCLUSIVE. Предметная истина остаётся PGlite/PostgreSQL; mutex release — после PGlite.close. Foreign/symlink/неполный marker отклоняются, файл не удаляется при release. Crash после readiness и crash до первого marker COMMIT имеют отдельные границы доказательства.
- Пути SQL, MCP stdio executable, verification scratch/Playwright resolution, static root задаются от известного application/resource root, не случайного cwd.
- Shutdown снимает readiness/admission, останавливает запуск новых jobs/observers, отменяет streams и cooperative tasks/runner children, ждёт application handlers и фоновые операции/SQL, затем закрывает DB и освобождает profile ownership. Закрытие socket не считается завершением query. Deadline — явная ошибка, а не доказательство произвольной отмены Promise.
- GitHub webhook и retry сначала сохраняют durable состояние; прежний Next `after` заменяется owned after-response task. Worker сохраняет leases/recovery; cancellation не синтезирует завершённую delivery.
- Verification сохраняет фиксированный server-owned Playwright command, process-tree cleanup, прежние request receipts и UNKNOWN. Disconnect/stop не дают права повторно запустить зарезервированный request.
- API/отсутствующие assets не получают SPA index. Fallback допускается только для browser GET/HEAD navigation и явно заданного static root.

## Наблюдаемые критерии

| ID | Критерий |
|---|---|
| SR01 | Route manifest покрывает все 47 исходных patterns и 59 явных методов; auto HEAD/OPTIONS/implicit 405 сохраняют qualification contract |
| SR02 | Auth precedence, expected participant/project, project membership, local/hosted filesystem boundary, safe errors и no-store/cookie headers сохраняются через настоящий TCP |
| SR03 | Один явно созданный fixture store обслуживает legacy/project routes, MCP, SSE, drafts и worker; service не создаёт второй singleton |
| SR04 | Migrations/resources разрешаются вне repository cwd; startup failure закрывает частично открытые ресурсы; readiness невозможна до migrations |
| SR05 | Два процесса не владеют одним embedded fixture profile; ownership освобождается после close и OS освобождает его после killed child. Чужой/неполный marker не удаляется автоматически; first-marker crash остаётся recovery gate |
| SR06 | Readiness проверяет реальную БД и отвечает 503 при stopping/unready; failed timed probe остаётся учтённой in-flight operation |
| SR07 | Real TCP disconnect не позволяет закрыть DB до завершения уже выполняющегося handler/query; stop идемпотентен, bounded timeout честно сообщает незавершение |
| SR08 | Owned GitHub recovery timer/startup kick останавливаются; abort передаётся upstream fetch; durable enqueue и after-response ordering доказаны |
| SR09 | Verification child/observer operations имеют stop/drain; ожидающие операции сохраняют прежнюю семантику UNKNOWN и same-body receipts |
| SR10 | Опциональные static assets и SPA fallback безопасно ограничены static root; `/api/*`, неизвестные assets и неподходящие методы не превращаются в HTML |
| SR11 | Build/typecheck/test воспроизводимы для service package и CI; реальный production entry исполняется ordinary Node без Next runtime |

## Проверка

Сначала meaningful RED на отсутствующих application/lifecycle гарантиях, затем GREEN тех же assertions. Невозможность установить dependency/открыть порт не считается RED. Используются только memory/temp fixtures, настоящий TCP, stub upstream и отдельные child processes для ownership/cancellation. Существующие auth/store/MCP/verification/GitHub регрессии запускаются отдельно. PostgreSQL qualification, browser parity и global live cutover сообщаются отдельно, если не выполнены.

Точное evidence, команды и ограничения — в [журнале](../plans/service-runtime.md). Обнаруженное исходное несоответствие simulator project selection сначала характеризуется тестом; перенос не получает неявного права менять предметное поведение.

## Уточнения startup review

- При startup failure независимо выполняются попытки остановить HTTP, worker и фоновые операции store. DB.close допускается после подтверждённого drain всех трёх; ошибка одной попытки не пропускает остальные. Исходная startup error сохраняется как cause, а неполная cleanup возвращает явные статусы без raw cleanup exceptions. Неподтверждённый drain не означает освобождение ownership.
- Проверенный Windows baseline PGlite 0.3.16 сам отвергает junction в final dataDir и на fresh, и на initialized profile. Поэтому новая поддержка такого alias в эту историю не добавляется. Junction родительского каталога vendor принимает; этот случай не запрещён существующим guard конечного dataDir. Symlink/foreign mutex-файлы по-прежнему отклоняются; общего filesystem sandbox не создаётся. Linux baseline здесь не заявляется.
- Неиспользованное тело не задерживает ранний HTTP отказ. Ограниченная cleanup запускается владельцем после response finish/close и учитывается отдельно от handler/SQL drain; raw TCP fixture сохраняет исходные 403/415 при незавершённом upload.
