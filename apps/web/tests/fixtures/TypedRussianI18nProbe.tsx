import {StrictMode,useContext,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {I18nContext,useTranslation} from 'react-i18next';
import {ProjectRuntimeProvider} from '@/components/ProjectRuntimeProvider';
import {WorkspaceProvider} from '@/components/workspace-client';
import WorkspaceTaskForm from '@/components/workspace-task';
import {RootI18nProbe,type ObservedI18n} from '@/tests/fixtures/i18n/RootI18nProbe';
import '@/app/tailwind.css';
import '@/app/theme.css';

const observed=new Map<string,ObservedI18n>(),submissions:unknown[]=[];
const report=(name:string,value:ObservedI18n)=>{observed.set(name,value);};
/** Этот hook разрешается обычным web bare import, без explicit i18n prop или global plugin. */
function WebI18nProbe({name}:{name:string}){
 const instance=useContext(I18nContext)?.i18n,{ready,t}=useTranslation('assignWork'),text=t('heading');
 useEffect(()=>report(name,{instance,ready,text}),[name,instance,ready,text]);
 return <output data-testid={name}>{text}</output>;
}
const agents=[{id:'i18n-fixture-agent',projectId:'i18n-fixture-project',name:'Тестовый агент',createdAt:'2026-11-05T00:00:00.000Z',lastSeenAt:null,revokedAt:null}];
function FormProbe(){
 const [tick,setTick]=useState(0);
 return <><button onClick={()=>{void observed.get('a-root')?.instance?.changeLanguage('ru');setTick(value=>value+1);}}>Обновить RU</button><span data-testid="rerenders">{tick}</span><WorkspaceTaskForm projectId="i18n-fixture-project" agents={agents} onStart={async(agentId,content)=>{submissions.push({agentId,content});return false;}}/></>;
}
Object.assign(window,{typedRussianI18nProbe:{
 state:()=>({ready:[...observed].map(([name,value])=>({name,ready:value.ready,provided:!!value.instance,text:value.text})),sameA:observed.get('a-root')?.instance===observed.get('a-web')?.instance,sameB:observed.get('b-root')?.instance===observed.get('b-web')?.instance,isolated:observed.get('a-root')?.instance!==observed.get('b-root')?.instance,submissions:[...submissions]}),
 mutateFirst:()=>{const instance=observed.get('a-root')!.instance!;instance.addResource('ru','assignWork','heading','Изменён только первый экземпляр');void instance.changeLanguage('ru');},
}});
createRoot(document.getElementById('root')!).render(<StrictMode><ProjectRuntimeProvider><RootI18nProbe name="a-root" onObserved={report}/><WebI18nProbe name="a-web"/><WorkspaceProvider><FormProbe/></WorkspaceProvider></ProjectRuntimeProvider><ProjectRuntimeProvider><RootI18nProbe name="b-root" onObserved={report}/><WebI18nProbe name="b-web"/></ProjectRuntimeProvider></StrictMode>);
