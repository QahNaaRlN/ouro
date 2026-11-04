import {twMerge} from 'tailwind-merge';
import {workspacePresentation as ui} from '@/components/workspace-presentation';
import Link from 'next/link';
import {WorkspaceProvider} from '@/components/workspace-client';
import OuroLogo from '@/components/ouro-logo';
import WorkspaceNavigation from '@/components/workspace-navigation';
import {AppSelectAppearanceProvider} from '@/components/app-select';
import {WorkspaceUIAppearanceProvider} from '@/components/workspace-ui';
import '@/components/legacy-shared-defaults.css';

/** Оформление элементов этого модуля; общие элементы используют workspacePresentation. */
const presentationSlots={
  topbar:"mx-auto flex max-w-[1440px] items-center justify-between gap-[24px] border-0 border-b border-solid border-ouro-border px-[40px] py-[23px] at-most-900:px-[24px] at-most-900:py-[20px] at-most-520:block at-most-520:p-[16px]",
  brand:"flex items-center gap-[10px] text-[30px] font-semibold tracking-[-1.5px] [&>svg]:shrink-0 [&>svg]:text-ouro-positive [&>span]:text-ouro-positive at-most-520:text-[27px] no-underline hover:no-underline",
  main:"mx-auto min-w-0 max-w-[1360px] px-[40px] pt-[42px] pb-[70px] at-most-900:px-[24px] at-most-900:pt-[30px] at-most-900:pb-[55px] at-most-520:px-[16px] at-most-520:pt-[28px] at-most-520:pb-[45px]",
} as const;

export default function ProjectsLayout({children}:{children:React.ReactNode}){
  return <WorkspaceProvider><WorkspaceUIAppearanceProvider><AppSelectAppearanceProvider triggerClassName="w-full rounded-[6px] border-ouro-border px-[12px] py-[11px] font-sans text-[13px] leading-[1.6] font-normal"><div className={twMerge("ws-shell","min-h-screen bg-ouro-bg text-ouro-text [--primary:#93dfbf] [--primary-text:#12231c]")}><header className={twMerge("ws-topbar",presentationSlots.topbar)}><Link className={twMerge(ui.link,"ws-brand",presentationSlots.brand)} href="/projects" aria-label="Ouro — проекты"><OuroLogo size={32}/>ouro</Link><WorkspaceNavigation/></header><main className={twMerge("ws-main",presentationSlots.main)}>{children}</main></div></AppSelectAppearanceProvider></WorkspaceUIAppearanceProvider></WorkspaceProvider>;
}
