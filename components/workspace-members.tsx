'use client';

import Link from 'next/link';
import {ProjectMembersPanel} from './project-account';
import {useWorkspaceSession} from './workspace-client';

export default function WorkspaceMembers({projectId}:{projectId:string}){
 const {actor,localOperator,loading}=useWorkspaceSession();
 if(loading)return <p>Проверяем сессию…</p>;
 if(!actor||localOperator)return <p role="alert">Участники облачного проекта доступны после входа в аккаунт. <Link href="/projects">Проекты</Link></p>;
 return <><Link href={'/projects/'+encodeURIComponent(projectId)}>← Вернуться к проекту</Link><ProjectMembersPanel projectId={projectId} identity={actor} surface="workspace"/></>;
}
