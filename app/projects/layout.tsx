import Link from 'next/link';
import {WorkspaceProvider} from '@/components/workspace-client';
import '@/components/workspace-styles.css';

export default function ProjectsLayout({children}:{children:React.ReactNode}){
  return <WorkspaceProvider><div className="ws-shell"><header className="ws-topbar"><Link className="ws-brand" href="/projects">ouro<span>.</span><small>PROJECTS</small></Link><nav aria-label="Навигация проектов"><Link href="/projects">Проекты</Link><Link href="/projects/help">Подключить агента</Link><Link href="/">Учебный Human View</Link></nav></header><main className="ws-main">{children}</main><footer className="ws-footer">Ouro · ожидания, факты и решения человека</footer></div></WorkspaceProvider>;
}
