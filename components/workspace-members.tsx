'use client';
import {twMerge} from 'tailwind-merge';
import {workspacePresentation as ui} from './workspace-presentation';

import Link from 'next/link';
import {ProjectMembersPanel} from './project-account';
import {useWorkspaceSession} from './workspace-client';

export default function WorkspaceMembers({projectId}:{projectId:string}){
 const {actor,localOperator,loading,readScope,unavailable,error}=useWorkspaceSession();
 if(loading)return <p className={twMerge(ui.paragraph,ui.paragraph)}>Проверяем сессию…</p>;
 if(unavailable)return <p className={twMerge(ui.paragraph,ui.paragraph)} role="alert">{error}</p>;
 if(!actor||localOperator)return <p className={twMerge(ui.paragraph,ui.paragraph)} role="alert">Участники облачного проекта доступны после входа в аккаунт. <Link className={ui.link} href="/projects">Проекты</Link></p>;
 return <><Link className={ui.link} href={'/projects/'+encodeURIComponent(projectId)}>← Вернуться к проекту</Link><ProjectMembersPanel projectId={projectId} identity={actor} readScope={{...readScope,projectId}} surface="workspace"/></>;
}
