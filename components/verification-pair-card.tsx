'use client';
import { useId, useState } from 'react';
import { getWorkPairPresentation, type WorkPairGroup, type ProjectState } from '@/packages/core/src';
import { getSpecWorkPresentation } from '@/packages/core/src/work-presentation';
import { WorkStatus } from './work-status';
import './verification.css';
export function VerificationPairCard({ state, group, onOpen }: {
    state: ProjectState;
    group: WorkPairGroup;
    onOpen: (specId: string, revisionId: string) => void;
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
          return <div key={face.side} className={`verification-face verification-face-${face.side}`} data-spec-id={face.spec.id} data-revision-id={face.revisionId} aria-hidden={!active} inert={!active}>
            <small>{face.spec.humanId} · r{revision?.revision} · {face.side === 'work' ? 'Работа' : 'Проверка'}</small>
            <button type="button" className="verification-open" tabIndex={active ? 0 : -1} onClick={event => { event.stopPropagation(); onOpen(face.spec.id, face.revisionId); }}>{revision?.title ?? face.spec.title}</button>
            <WorkStatus presentation={getSpecWorkPresentation(state, face.spec)}/>
            {verification && <><p className="verification-summary">{verification.resultLabel} · {verification.applicabilityLabel}</p><small>Записанная фаза: {verification.phaseLabel}</small></>}
          </div>;
      })}
    </div>
  </div>
  <div className="verification-pair-footer">{override && <button type="button" className="verification-auto" onClick={event => { event.stopPropagation(); setOverride(null); }}>К записанной фазе</button>}</div>
 </div>;
}
