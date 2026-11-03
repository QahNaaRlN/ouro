import Link from 'next/link';
import {WorkspaceProvider} from '@/components/workspace-client';
import OuroLogo from '@/components/ouro-logo';
import WorkspaceNavigation from '@/components/workspace-navigation';
import {AppSelectAppearanceProvider} from '@/components/app-select';
import '@/components/workspace-styles.css';
import '@/components/workspace-redesign.css';

export default function ProjectsLayout({children}:{children:React.ReactNode}){
  return <WorkspaceProvider><AppSelectAppearanceProvider triggerClassName="w-full rounded-[6px] border-ouro-border px-[12px] py-[11px] font-sans text-[13px] leading-[1.6] font-normal"><div className="ws-shell"><header className="ws-topbar"><Link className="ws-brand" href="/projects" aria-label="Ouro — проекты"><OuroLogo size={32}/>ouro</Link><WorkspaceNavigation/></header><main className="ws-main">{children}</main></div></AppSelectAppearanceProvider></WorkspaceProvider>;
}
