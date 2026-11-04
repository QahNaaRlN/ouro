# Tailwind 4: реестр и вход участников

Дата: 2026-11-04. Атомарная история в `codex/tailwind-panels`, основание — принятый React/Vite-план и прямое поручение заменить обычные UI-стили Tailwind 4.

Область: `ParticipantsPanel`, `ParticipantLogin` и второй реальный потребитель общего stylesheet — `EmailLogin`/`ProjectMembersPanel` в `project-account.tsx`; их JSX utilities и удаление `participants-panel.css`. Обработчики создания, входа, выхода, отзыва, одноразового ключа и polling не меняются. Общие legacy button/heading defaults пока принадлежат следующему срезу и остаются учтённым долгом. ProjectSwitcher в том же файле принадлежит отдельной workspace-истории; его source не меняется. Эта история не объявляет полный CSS-перенос.

Перед изменением оформления снимается исходный интерфейс с отдельным fixture-профилем. После переноса сравниваются те же данные в dark/light при 1440×1000 и 390×844: реестр, отозванный участник, вход и форма приглашения. Ключевые размеры/шрифты/цвета, responsive wrapping, focus outline и readonly credential сохраняются. Создание/две независимые идентичности/отзыв проверяются существующими C01/C02 browser cases.

Utilities располагаются на конкретных элементах либо в явных презентационных константах этого слайса. Нет `@apply`, глобального important, переноса selectors в theme/base или автоматического runtime-конвертера class names. Семантические hook-классы могут остаться без CSS. Конечный style ledger обновляется только после удаления реального долга и review.

Исходный baseline: эпик `d3949fdc2c3cfa41cafd2bacabbbdc06d1c24983`. Фактические результаты и ограничения — в [журнале](../plans/tailwind-participants.md).
