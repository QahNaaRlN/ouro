import {useState,useMemo} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {CatalogReadEnvironmentProvider} from '../../../../packages/frontend/src/shared/catalog-read-environment';
import {useCatalogProjects} from '../../../../packages/frontend/src/api/catalog-reads';
import type {CatalogReadPort,CatalogReadResult,CatalogReadScope,WorkspaceProjectDTO,IdentitySessionDTO} from '../../../../packages/client/src/ports';
import {WorkspaceProvider,useWorkspaceSession} from '../../../../components/workspace-client';

type Configuration={sourceId:string;hostEpoch:number;accessEpoch:number;actorId:string;enabled:boolean;unsupported:boolean;identity:boolean};
type Pending={scope:CatalogReadScope;resolve:(value:CatalogReadResult<readonly WorkspaceProjectDTO[]>)=>void};
type Probe={configure(patch:Partial<Configuration>):void;resolve(index:number,projects:WorkspaceProjectDTO[]):void;pending():readonly CatalogReadScope[];cache():readonly unknown[];fetches():number};
declare global{interface Window{catalogProbe:Probe}}
const pending:Pending[]=[],client=new QueryClient();let fetches=0;
globalThis.fetch=async()=>{fetches++;throw new Error('Ambient fixture HTTP forbidden');};
let configure:(patch:Partial<Configuration>)=>void=()=>{throw new Error('Fixture not mounted');};
window.catalogProbe={configure:patch=>configure(patch),resolve:(index,projects)=>{const entry=pending[index];if(!entry)throw new Error('Missing fixture read');entry.resolve({status:'available',value:projects});},pending:()=>pending.map(value=>value.scope),cache:()=>client.getQueryCache().getAll().filter(value=>value.state.data!==undefined).map(value=>({key:value.queryKey,data:value.state.data})),fetches:()=>fetches};

/** Наблюдает настоящий hook, сохраняя draft при замене bounded read environment. */
function CatalogPane({configuration}:{configuration:Configuration}){
 const scope={ownerId:'browser-owner',sourceId:configuration.sourceId,hostEpoch:configuration.hostEpoch,accessEpoch:configuration.accessEpoch,actorId:configuration.actorId,projectId:'project'},reading=useCatalogProjects(scope,'workspace',configuration.enabled),[draft,setDraft]=useState(''),[admitted,setAdmitted]=useState(false);
 return <><label>Несохранённый ввод<input value={draft} onChange={event=>setDraft(event.target.value)}/></label><p role="status" aria-label="Read state">{reading.workspace.status}</p><output>{reading.workspace.data?.map(value=>value.name).join(',')??''}</output><button onClick={()=>{void reading.refresh().then(()=>setAdmitted(true)).catch(()=>{});}}>Перечитать</button><p data-testid="admitted">{String(admitted)}</p></>;
}
/** Показывает результат существующего identity controller без собственного auth owner. */
function IdentityPane(){const session=useWorkspaceSession();return <p role="status">{session.loading?'loading':session.unavailable?'unavailable':session.actor?'accepted':session.error||'signed-out'}</p>;}
/** Собирает только ограниченный test host; product same-origin composition не переопределяется. */
function Fixture(){
 const [configuration,setConfiguration]=useState<Configuration>({sourceId:'fixture:A',hostEpoch:1,accessEpoch:1,actorId:'actor-A',enabled:true,unsupported:false,identity:false});
 configure=patch=>setConfiguration(current=>({...current,...patch}));
 const environment=useMemo(()=>{
  const reads:CatalogReadPort={
   readIdentitySession:async()=>({status:'unsupported',capability:'read-identity-session'} as CatalogReadResult<IdentitySessionDTO>),
   listWorkspaceProjects:async scope=>configuration.unsupported?{status:'unsupported',capability:'list-workspace-projects'}:new Promise(resolve=>{pending.push({scope,resolve});}),
   listAccountProjects:async()=>({status:'unsupported',capability:'list-account-projects'}),
  };
  return {sourceId:configuration.sourceId,hostEpoch:configuration.hostEpoch,reads};
 },[configuration.sourceId,configuration.hostEpoch,configuration.unsupported]);
 return <QueryClientProvider client={client}><CatalogReadEnvironmentProvider value={environment}>{configuration.identity?<WorkspaceProvider><IdentityPane/></WorkspaceProvider>:<CatalogPane configuration={configuration}/>}</CatalogReadEnvironmentProvider></QueryClientProvider>;
}
const element=document.getElementById('root');if(!element)throw new Error('Fixture root is missing');createRoot(element).render(<Fixture/>);
