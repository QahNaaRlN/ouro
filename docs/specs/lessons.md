# OURO-ENG-000005 · Архив уроков и происхождение новых спек

SDD · 29.10.2026 · после GitHub, перед согласованной метрикой. Источник: ТЗ/ТС, ids-contracts.md, status-methodology.md. Непринятый вариант — материал для анализа, а не автоматически доказанный плохой подход.

## Контракт

Lesson `{id,projectId,latestRevisionId,publishedRevisionId?}` и immutable LessonRevision `{id,lessonId,revision,parentRevisionId?,title,context,conclusion,applicability,evidence,tags,sourceEventIds,createdBy,createdAt}` восстанавливаются из append-only domain events. Человек создаёт урок, предлагает новую ревизию и отдельно публикует snapshot. Правка не заменяет ранее опубликованную версию. История сохраняется тем же SQL event-store, без второго бизнес-хранилища. Старые snapshots/receipts не переписываются.

Команды `createLesson {content}`, `reviseLesson {lessonId,content}`, `publishLesson {lessonId,revisionId}` human-only; обычные requestId/expectedVersion/receipt. Content требует непустые title/context/conclusion/applicability/evidence, уникальные tags≤20 и sourceEventIds1–50, существующие committed события того же проекта. Связанные spec/revision/request/execution выводятся из этих событий, не принимаются как spoofed authority. Agent не публикует урок и не называет своё предположение человеческим выводом.

Отклонённые решения и невыбранные альтернативы Fork автоматически появляются в списке **кандидатов**, с точным DecisionResolved source. Человек может отобрать candidate в черновик урока, дополнить доказательство и область применимости. Публикация только явно; сам rejection/choice не создаёт опубликованный урок.

`createSpecFromLesson {lessonId,lessonRevisionId,content,sourceSpecId?}` выполняется только человеком от точной опубликованной версии. Создаётся обычная draft-спека с постоянным Human ID, immutable revision и provenance `{kind:'lesson',lessonId,lessonRevisionId}`. Активация/запуск не выполняются. Необязательный sourceSpecId человек выбирает из реальных source-спек урока; тогда отдельно сохраняется spec→spec derived_from. Нельзя подставлять lesson ID в существующую Dependency, выбирать источник автоматически или ссылаться на чужую/несуществующую версию.

UI: архив с поиском title/conclusion/tags, фильтр опубликован/черновик/sourceSpec, просмотр ревизий/источников, редактор нового snapshot, отдельная публикация и форма предложения новой спеки с DoD. Формы держат baseVersion и точные IDs, внешнее обновление не подменяет основу. Исторические версии доступны для чтения. Источники открываются в details с eventId/version/контекстом без выдуманной причинности. Semantic tokens, обе темы, доступные формы.

## AC/TDD

L01 reject/unchosen создают candidate, не publishedLesson. L02 human/project/source guards, missing/duplicate/foreign source, validated boundedcontent. L03 newrevision/oldpublished/reopen/replayimmutable. L04 publishточногоsnapshotотдельно. L05 specdraft/provenance/explicitderived_from/idempotency/atomicity, безactivation. L06 search/sourcefilters и браузерный полныйcuration→publish→draftspec. L07 typecheck/build и прежниеchecks зелёные. Сначала наблюдаемый RED, затем GREEN; средовые ошибки отдельно.

Ориентиры: собственный [append-only Event Sourcing research](../methodology-research.md), [Fowler Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html), [SEI Goal-Driven Software Measurement](https://www.sei.cmu.edu/library/goal-driven-software-measurement-a-guidebook/) для явной области/основания вывода. Методология архива — проектное решение Ouro; универсальность вывода не генерируется автоматически.
