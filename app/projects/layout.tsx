import Link from 'next/link';
import {WorkspaceProvider} from '@/components/workspace-client';
import OuroLogo from '@/components/ouro-logo';
import WorkspaceNavigation from '@/components/workspace-navigation';
import '@/components/workspace-styles.css';
import '@/components/workspace-redesign.css';

export default function ProjectsLayout({children}:{children:React.ReactNode}){
  return <WorkspaceProvider><div className="ws-shell"><header className="ws-topbar"><Link className="ws-brand" href="/projects" aria-label="Ouro — проекты"><OuroLogo size={32}/>ouro</Link><WorkspaceNavigation/></header><main className="ws-main">{children}</main></div></WorkspaceProvider>;
}
