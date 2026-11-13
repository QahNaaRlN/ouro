'use client';
import { useId, useState } from 'react';
import {
  getWorkPairPresentation,
  type WorkPairGroup,
  type ProjectState,
} from '@/packages/core/src';
import { currentDecisionRequests } from '@/packages/core/src/decision-lineage';
import { getSpecWorkPresentation } from '@/packages/core/src/work-presentation';
import { WorkStatus } from './WorkStatus';
import { twMerge } from 'tailwind-merge';
import { verificationPairPresentation as ui } from './verification-pair-presentation';

/** Потребитель задаёт только оформление context slots; карточка не знает поверхность родительского экрана. */
export type VerificationPairClassNames = Readonly<
  Partial<
    Record<
      | 'attention'
      | 'proposals'
      | 'updated'
      | 'time'
      | 'root'
      | 'face'
      | 'button'
      | 'open'
      | 'auto'
      | 'summary',
      string
    >
  >
>;

/** Показывает связанную работу и её проверки с локальным выбором стороны, не меняя записанную фазу. */
export function VerificationPairCard({
  state,
  group,
  onOpen,
  onOpenRequests,
  onOpenProposals,
  classNames,
}: {
  state: ProjectState;
  group: WorkPairGroup;
  onOpen: (specId: string, revisionId: string) => void;
  onOpenRequests?: (specId: string, revisionId: string) => void;
  onOpenProposals?: (specId: string, revisionId: string) => void;
  classNames?: VerificationPairClassNames;
}) {
  const pair = getWorkPairPresentation(state, group),
    [override, setOverride] = useState<string | null>(null);
  const foreground =
    [group.work, ...group.verifications].find((item) => item.id === override) ?? pair.foreground;
  const verification =
    pair.verifications.find((item) => item.spec.id === foreground.id) ??
    pair.verifications.toSorted((a, b) => b.phaseVersion - a.phaseVersion)[0];
  const rotorId = useId(),
    side = foreground.id === group.work.id ? 'work' : 'verification';
  const faces = [
    {
      side: 'work',
      spec: group.work,
      revisionId:
        verification?.revision.verification?.targetRevisionId ??
        group.work.activeRevisionId ??
        group.work.revisionIds.at(-1)!,
    },
    ...(verification
      ? [{ side: 'verification', spec: verification.spec, revisionId: verification.revision.id }]
      : []),
  ];
  return (
    <div
      className={twMerge('verification-pair nodrag nopan', ui.root, classNames?.root)}
      data-pair-id={group.id}
      data-foreground-id={foreground.id}
      data-side={side}
    >
      <div
        className={twMerge('verification-layers', ui.layers)}
        role="group"
        aria-label="Стороны карточки работы и проверки"
      >
        {[group.work, ...group.verifications].map((item) => (
          <button
            className={twMerge(ui.layerButton, classNames?.button)}
            key={item.id}
            type="button"
            aria-controls={rotorId}
            aria-pressed={item.id === foreground.id}
            onClick={(event) => {
              event.stopPropagation();
              setOverride(item.id);
            }}
          >
            {item.id === group.work.id ? 'Работа' : 'Проверка'}
            {group.verifications.length > 1 && item.id !== group.work.id
              ? ' · ' + item.humanId
              : ''}
          </button>
        ))}
      </div>
      <div className={twMerge('verification-turntable', ui.turntable)}>
        <div
          className={twMerge(
            'verification-rotor',
            ui.rotor,
            side === 'verification' && ui.reversed,
          )}
          id={rotorId}
        >
          {faces.map((face) => {
            const revision = state.revisions.find((item) => item.id === face.revisionId),
              active = face.side === side;
            const presentation = getSpecWorkPresentation(state, face.spec);
            const requests = currentDecisionRequests(state).filter(
              (request) =>
                request.specId === face.spec.id && request.specRevisionId === face.revisionId,
            );
            const proposalCount = state.agentProposals.filter(
              (proposal) =>
                proposal.projectId === state.projectId &&
                proposal.specId === face.spec.id &&
                proposal.specRevisionId === face.revisionId,
            ).length;
            return (
              <div
                key={face.side}
                className={twMerge(
                  `verification-face verification-face-${face.side}`,
                  ui.face,
                  face.side === 'work' ? ui.workFace : ui.verificationFace,
                  classNames?.face,
                )}
                data-spec-id={face.spec.id}
                data-revision-id={face.revisionId}
                aria-hidden={!active}
                inert={!active}
              >
                <small>
                  {face.spec.humanId} · r{revision?.revision} ·{' '}
                  {face.side === 'work' ? 'Работа' : 'Проверка'}
                </small>
                <button
                  type="button"
                  className={twMerge(
                    'verification-open',
                    ui.open,
                    classNames?.button,
                    classNames?.open,
                  )}
                  tabIndex={active ? 0 : -1}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(face.spec.id, face.revisionId);
                  }}
                >
                  {revision?.title ?? face.spec.title}
                </button>
                <WorkStatus presentation={presentation} />
                {verification && (
                  <>
                    <p className={twMerge('verification-summary', ui.summary, classNames?.summary)}>
                      {verification.resultLabel} · {verification.applicabilityLabel}
                    </p>
                    <small>Записанная фаза: {verification.phaseLabel}</small>
                  </>
                )}
                <div className={twMerge('verification-card-context', ui.context)}>
                  <div>
                    {requests.length > 0 &&
                      (onOpenRequests ? (
                        <button
                          type="button"
                          className={twMerge(
                            'node-attention',
                            ui.contextButton,
                            classNames?.button,
                            classNames?.attention,
                          )}
                          tabIndex={active ? 0 : -1}
                          aria-label={`Вопросы спеки ${face.spec.humanId}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenRequests(face.spec.id, face.revisionId);
                          }}
                        >
                          {requests.length} запросов · открыто{' '}
                          {requests.filter((request) => request.state === 'pending').length}
                        </button>
                      ) : (
                        <span>
                          {requests.length} запросов · открыто{' '}
                          {requests.filter((request) => request.state === 'pending').length}
                        </span>
                      ))}
                  </div>
                  <div>
                    {proposalCount > 0 &&
                      (onOpenProposals ? (
                        <button
                          type="button"
                          className={twMerge(
                            'node-proposals',
                            ui.contextButton,
                            classNames?.button,
                            classNames?.proposals,
                          )}
                          tabIndex={active ? 0 : -1}
                          aria-label={`Предложения спеки ${face.spec.humanId}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenProposals(face.spec.id, face.revisionId);
                          }}
                        >
                          Предложения · {proposalCount}
                        </button>
                      ) : (
                        <span>Предложения · {proposalCount}</span>
                      ))}
                  </div>
                  <p className={twMerge('node-updated', ui.updated, classNames?.updated)}>
                    {presentation.lastUpdatedAt ? (
                      <>
                        <span>Обновлено </span>
                        <time
                          className={classNames?.time}
                          dateTime={presentation.lastUpdatedAt}
                          aria-label={`Последнее событие ${face.spec.humanId}`}
                        >
                          {new Date(presentation.lastUpdatedAt).toLocaleString('ru-RU')}
                        </time>
                      </>
                    ) : (
                      <span>Событий пока нет</span>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className={twMerge('verification-pair-footer', ui.footer)}>
        {override && (
          <button
            type="button"
            className={twMerge(
              'verification-auto',
              ui.layerButton,
              classNames?.button,
              classNames?.auto,
            )}
            onClick={(event) => {
              event.stopPropagation();
              setOverride(null);
            }}
          >
            К записанной фазе
          </button>
        )}
      </div>
    </div>
  );
}
