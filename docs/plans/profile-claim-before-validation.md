# Журнал · конкурирующий запуск профиля

Дата: 2026-11-05. Статус: LOCAL_QUALIFIED / CI_PENDING. [SDD](../specs/profile-claim-before-validation.md). Отдельная ветка `codex/profile-contention`, исходный parent bddc33d.

CI41886653727/SPP03 выявил actual Linux отказ обоих initializers. На Windows60повторов старого сценария прошли; этот результат не выдан за опровержение Linux дефекта. Для Linux использован существующий Ubuntu и отдельный официальный Node24.19.0 внутри ignored test runtime; SHA25614b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647 сверён с официальным SHASUMS256. Системные Node/Windows/Ubuntu packages не изменены.

Исходный Linux probe воспроизвёл оба отказа на23-й паре. Отдельный test-only SQL trace повторил отказ на24-й: оба BEGIN EXCLUSIVE получили errcode5/BUSY. Операционные перехваты отсутствуют в production source. Первоначальная гипотеза о незакрытом Statement.get не используется: [исходник Node24.19](https://github.com/nodejs/node/blob/v24.19.0/src/node_sqlite.cc) reset-ит statements; [SQLite locking](https://www.sqlite.org/lockingv3.html) различает промежуточные read/reserved/pending и exclusive состояния.

Новый SPP16 даёт deterministic RED: первый process остановлен до canonical SQL validation, второй успевает стать owner. После перестановки BEGIN EXCLUSIVE перед validation SPP16 GREEN, но исходная гонка всё ещё отказала обоим на14-й паре. Этот промежуточный результат сохранён. Окончательный кандидат дополнительно задаёт native canonical busy budget1000ms; private initializer остаётся timeout0. После этого исходные **200/200 Linux пар** получили ровно одного owner. Это не предметный retry и не точный end-to-end SLA: FS/startup/scheduling имеют собственное время.

Проверки окончательного кандидата:

- Windows: все16SPP PASS,0skip,23.84s; все6service runtime lifecycle PASS,28.20s, включая настоящее закрытие PGlite и незавершённый startup drain.
- Linux: все15самостоятельных mutex SPP PASS,0skip,31.73s; SPP09 с реальным PGlite здесь не запускался, он прошёл Windows и требуется в полном Linux CI. Исходная contention matrix200/200 PASS.
- Root/service strict types PASS. После установки недостающих закреплённых web dependencies architecture876/0/11, styles5CSS/4inline/0 и diff checks PASS. Первые missing protocol build/router dependencies были setup failures, не domain RED. Generated protocol output восстановлен только после semantic-zero proof.
- Независимый bounded source/test peer producer owner принят: header/sidecar/inode guards, foreign-schema validation, release и own-temp cleanup сохранены; SPP16 проверяет второго process до продолжения первого.

Изменены только получение canonical lock, один fixture barrier/helper и regression. Никаких format/path/migrations, overwrite/fallback, PID/stale reclaim, command retries или test deadline increases. Реальные профили и production не открывались. Full CI/merge ещё не заявлены.
