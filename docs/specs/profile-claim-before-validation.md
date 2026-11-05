# Исключительное владение до SQL-проверки marker

Actual RED: CI41886653727/SPP03 отверг оба одновременных initializers. На Linux Node24.19 изолированный повтор воспроизвёл отказ на23-й попытке; SQL trace отдельно воспроизвёл его на24-й: оба `BEGIN EXCLUSIVE` получили SQLite BUSY. Windows60повторов PASS; это не опровергает Linux RED.

Текущий путь выполняет SQL-чтения validateDatabase перед EXCLUSIVE claim. Конкурирующие чтения пересекаются с попыткой повышения блокировки; timeout0 допускает отказ обоих процессов. Исправление сначала получает EXCLUSIVE, затем проверяет тот же неизменный v1 marker под этим владением. Только canonical acquisition получает native SQLite busy timeout1000ms: конкурирующий startup может подождать до одной секунды. Private initializer сохраняет timeout0. Header/identity/symlink/local inode guards до открытия сохраняются; формат, path budget, hardlink publication, отсутствие overwrite и fail-closed отказ действующему owner не меняются.

Причинный regression: первый процесс останавливается перед SQL-проверкой canonical marker; второй обычный процесс уже должен получить отказ владения. До исправления второй получает marker; после исправления первый удерживает EXCLUSIVE во время проверки. После продолжения, явного release и нового запуска допускается ровно один owner. Это проверка межпроцессного exclusion, без production test hooks, повторов предметной команды, PID/stale reclaim или изменения test deadlines.

Одна перестановка шагов дала SPP16GREEN, но исходный simultaneous initialization всё ещё отказал обоим на14-й попытке. Этот результат сохранён и не называется исправлением гонки. После добавления ограниченного native ожидания исходная Linux matrix завершила **200/200** новых профилей с ровно одним owner в каждой паре. Это bounded qualification, не гарантия справедливости планировщика для произвольного числа contenders.

Квалификация: сначала deterministic RED, затем GREEN и все прежние SPP/lifecycle tests; повтор исходной Linux contention matrix. Только изолированные профили, рабочие DB не открываются. Полный CI перед merge; это не доказательство защиты от power loss или некооперативного старого binary.
