import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '../../../../app/tailwind.css';
import '../../../../app/theme.css';
import '../../../../app/globals.css';
import '../../../../components/legacy-shared-defaults.css';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {WorkspaceProposals} from '../../../../components/workspace-proposals';
import {WorkspaceUIAppearanceProvider} from '../../../../components/workspace-ui';
import type {ProjectState} from '../../../../packages/core/src';

const root=createRoot(document.getElementById('root')!);
declare global{interface Window{previewPresentation:{configure(state:ProjectState,proposalId:string):void}}}

/** Показывает существующий компонент из сохранённых фактов; renderer не отправляет команды. */
window.previewPresentation={configure(state,proposalId){flushSync(()=>root.render(<WorkspaceUIAppearanceProvider><main className="ws-shell p-[20px]"><WorkspaceProposals state={state} proposalId={proposalId} disabled={false} onOpenProposal={()=>undefined} onOpenSpec={()=>undefined} command={async()=>{throw Error('Presentation renderer cannot send commands.');}}/></main></WorkspaceUIAppearanceProvider>));}};
