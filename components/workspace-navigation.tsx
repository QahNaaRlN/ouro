'use client';

import Link from 'next/link';
import {useWorkspaceSession} from './workspace-client';
import {AccountLogout} from './project-account';

export default function WorkspaceNavigation(){
 const {actor,localOperator}=useWorkspaceSession();
 return <nav aria-label="Навигация проектов"><Link href="/projects">Проекты</Link><Link href="/projects/help" data-onboarding="agent-help">Подключить агента</Link>{localOperator&&<Link href="/">Учебный Human View</Link>}{actor&&!localOperator&&<><span>{actor.name}</span><AccountLogout identity={actor}/></>}</nav>;
}
