'use client';
import { useId, useState } from 'react';
import { getWorkPairPresentation, type WorkPairGroup, type ProjectState } from '@/packages/core/src';
import { currentDecisionRequests } from '@/packages/core/src/decision-lineage';
import { getSpecWorkPresentation } from '@/packages/core/src/work-presentation';
import { WorkStatus } from './work-status';
import './verification.css';
export function VerificationPairCard({ state, group, onOpen, onOpenRequests, onOpenProposals }: {
    state: ProjectState;
    group: WorkPairGroup;
    onOpen: (specId: string, revisionId: string) => void;
    onOpenRequests?: (specId: string, revisionId: string) => void;
    onOpenProposals?: (specId: string, revisionId: string) => void;
}) {
    const pair = getWorkPairPresentation(state, group), [override, setOverride] = useState<string | null>(null);
    const foreground = [group.work, ...group.verifications].find(item => item.id === override) ?? pair.foreground;
    const verification = pair.verifications.find(item => item.spec.id === foreground.id) ?? pair.verifications.toSorted((a,b)=>b.phaseVersion-a.phaseVersion)[0];
    const rotorId = useId(), side = foreground.id === group.work.id ? 'work' : 'verification';
    const faces = [
        { side: 'work', spec: group.work, revisionId: verification?.revision.verification?.targetRevisionId ?? group.work.activeRevisionId ?? group.work.revisionIds.at(-1)! },
        ...(verification ? [{ side: 'verification', spec: verification.spec, revisionId: verification.revision.id }] : []),
    ];
    return <div className="verification-pair nodrag nopan" data-pair-id={group.id} data-foreground-id={foreground.id} data-side={side}>
  <div className="verification-layers" role="group" aria-label="Стороны карточки работы и проверки">{[group.work, ...group.verifications].map(item => <button key={item.id} type="button" aria-controls={rotorId} aria-pressed={item.id === foreground.id} onClick={event => { event.stopPropagation(); setOverride(item.id); }}>{item.id === group.work.id ? 'Работа' : 'Проверка'}{group.verifications.length > 1 && item.id !== group.work.id ? ' · ' + item.humanId : ''}</button>)}</div>
  <div className="verification-turntable">
    <div className="verification-rotor" id={rotorId}>
      {faces.map(face => {
          const revision = state.revisions.find(item => item.id === face.revisionId), active = face.side === side;
          const presentation = getSpecWorkPresentation(state, face.spec);
          const requests = currentDecisionRequests(state).filter(request => request.specId === face.spec.id && request.specRevisionId === face.revisionId);
          const proposalCount = state.agentProposals.filter(proposal => proposal.projectId === state.projectId && proposal.specId === face.spec.id && proposal.specRevisionId === face.revisionId).length;
          return <div key={face.side} className={`verification-face verification-face-${face.side}`} data-spec-id={face.spec.id} data-revision-id={face.revisionId} aria-hidden={!active} inert={!active}>
            <small>{face.spec.humanId} · r{revision?.revision} · {face.side === 'work' ? 'Работа' : 'Проверка'}</small>
            <button type="button" className="verification-open" tabIndex={active ? 0 : -1} onClick={event => { event.stopPropagation(); onOpen(face.spec.id, face.revisionId); }}>{revision?.title ?? face.spec.title}</button>
            <WorkStatus presentation={presentation}/>
            {verification && <><p className="verification-summary">{verification.resultLabel} · {verification.applicabilityLabel}</p><small>Записанная фаза: {verification.phaseLabel}</small></>}
            <div className="verification-card-context">
              <div>{requests.length > 0 && (onOpenRequests ? <button type="button" className="node-attention" tabIndex={active ? 0 : -1} aria-label={`Вопросы спеки ${face.spec.humanId}`} onClick={event => { event.stopPropagation(); onOpenRequests(face.spec.id, face.revisionId); }}>{requests.length} запросов · открыто {requests.filter(request => request.state === 'pending').length}</button> : <span>{requests.length} запросов · открыто {requests.filter(request => request.state === 'pending').length}</span>)}</div>
              <div>{proposalCount > 0 && (onOpenProposals ? <button type="button" className="node-proposals" tabIndex={active ? 0 : -1} aria-label={`Предложения спеки ${face.spec.humanId}`} onClick={event => { event.stopPropagation(); onOpenProposals(face.spec.id, face.revisionId); }}>Предложения · {proposalCount}</button> : <span>Предложения · {proposalCount}</span>)}</div>
              <p className="node-updated">{presentation.lastUpdatedAt ? <><span>Обновлено </span><time dateTime={presentation.lastUpdatedAt} aria-label={`Последнее событие ${face.spec.humanId}`}>{new Date(presentation.lastUpdatedAt).toLocaleString('ru-RU')}</time></> : <span>Событий пока нет</span>}</p>
            </div>
          </div>;
      })}
    </div>
  </div>
  <div className="verification-pair-footer">{override && <button type="button" className="verification-auto" onClick={event => { event.stopPropagation(); setOverride(null); }}>К записанной фазе</button>}</div>
 </div>;
}
