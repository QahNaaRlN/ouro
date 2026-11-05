'use client';
import {twMerge} from 'tailwind-merge';
import {workspacePresentation as ui} from './workspace-presentation';

import Link from 'next/link';
import {useWorkspaceSession} from './workspace-client';
import {AccountLogout} from './project-account';

/** Показывает навигацию проектов и доступные элементы аккаунта текущей сессии. */
export default function WorkspaceNavigation(){
 const {actor,localOperator}=useWorkspaceSession();
 return <nav className="flex flex-wrap gap-[24px] text-[12px] text-ouro-text-muted at-most-900:gap-[14px] at-most-520:mt-[15px] at-most-520:gap-x-[18px] at-most-520:gap-y-[12px] at-most-520:text-[11px]" aria-label="Навигация проектов"><Link className={twMerge(ui.link,'hover:no-underline')} href="/projects">Проекты</Link><Link className={twMerge(ui.link,'hover:no-underline')} href="/projects/help" data-onboarding="agent-help">Подключить агента</Link>{localOperator&&<Link className={twMerge(ui.link,'hover:no-underline')} href="/">Учебный Human View</Link>}{actor&&!localOperator&&<><span>{actor.name}</span><AccountLogout identity={actor}/></>}</nav>;
}
