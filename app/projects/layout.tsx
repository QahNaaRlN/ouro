import Link from 'next/link';
import {WorkspaceProvider} from '@/components/workspace-client';
import OuroLogo from '@/components/ouro-logo';
import '@/components/workspace-styles.css';

export default function ProjectsLayout({children}:{children:React.ReactNode}){
  return <WorkspaceProvider><div className="ws-shell"><header className="ws-topbar"><Link className="ws-brand" href="/projects" aria-label="Ouro — проекты"><OuroLogo size={32}/>ouro</Link><nav aria-label="Навигация проектов"><Link href="/projects">Проекты</Link><Link href="/projects/help" data-onboarding="agent-help">Подключить агента</Link><Link href="/">Учебный Human View</Link></nav></header><main className="ws-main">{children}</main></div></WorkspaceProvider>;
}
