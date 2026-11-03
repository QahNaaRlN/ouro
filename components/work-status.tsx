import {Ban,CircleCheck,CircleDashed,CircleHelp,CircleX,ClipboardCheck,Clock3,FileCheck2,LoaderCircle,LockKeyhole,Pause,TriangleAlert} from 'lucide-react';
import type {StatusPresentation,WorkIcon} from '@/packages/core/src/work-presentation';
import './work-status.css';

const icons={
  'ban':Ban,'circle-check':CircleCheck,'circle-dashed':CircleDashed,'circle-help':CircleHelp,'circle-x':CircleX,
  'clipboard-check':ClipboardCheck,'clock-3':Clock3,'file-check-2':FileCheck2,'loader-circle':LoaderCircle,
  'lock-keyhole':LockKeyhole,'pause':Pause,'triangle-alert':TriangleAlert,
} satisfies Record<WorkIcon,typeof Ban>;

export function WorkStatus({presentation,showCode=false,className=''}:{presentation:StatusPresentation;showCode?:boolean;className?:string}){
  const Icon=icons[presentation.icon];
  return <span className={`work-status work-status-${presentation.tone} work-state-${presentation.statusClass} ${className}`}>
    <Icon size={14} aria-hidden="true"/><span>{presentation.label}</span>{showCode&&<code>{presentation.code}</code>}
  </span>;
}
