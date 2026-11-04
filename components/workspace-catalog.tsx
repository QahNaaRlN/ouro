'use client';

import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useEffect,useState,type FormEvent} from 'react';
import {FolderOpen,Plus,ArrowUp,ChevronRight} from 'lucide-react';
import WorkspaceOnboarding from './onboarding';
import {EmailLogin} from './project-account';
import {WorkspacePending,freezeWorkspaceIntent,readWorkspaceJSON,sendWorkspaceIntent,useWorkspaceIntents,useWorkspaceSession,type WorkspaceProject} from './workspace-client';

type FolderListing={path:string;parentPath:string|null;entries:{name:string;path:string}[];truncated:boolean};
export default function WorkspaceCatalog(){
  const {actor,localOperator,loading,error:sessionError}=useWorkspaceSession(),router=useRouter();
  const [projects,setProjects]=useState<WorkspaceProject[]>([]),[rootPath,setRootPath]=useState(''),[name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
  const [browsing,setBrowsing]=useState(false),[folder,setFolder]=useState<FolderListing|null>(null),[folderPath,setFolderPath]=useState(''),[folderBusy,setFolderBusy]=useState(false);
  const pending=useWorkspaceIntents(null,actor?.id);
  const [createUnknown,setCreateUnknown]=useState(false);
  const refresh=async()=>{const body=await readWorkspaceJSON<{projects:WorkspaceProject[]}>('/api/projects');setProjects(body.projects);setReady(true);};
  useEffect(()=>{if(!actor)return;let live=true;const abort=new AbortController();void readWorkspaceJSON<{projects:WorkspaceProject[]}>('/api/projects',abort.signal).then(body=>{if(live){setProjects(body.projects);setReady(true);}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;abort.abort();};},[actor]);
  const browse=async(path:string)=>{setFolderBusy(true);setError('');try{const next=await readWorkspaceJSON<FolderListing>(`/api/workspace/folders${path?`?path=${encodeURIComponent(path)}`:''}`);setFolder(next);setFolderPath(next.path);setBrowsing(true);}catch(e){setError((e as Error).message);}finally{setFolderBusy(false);}};
  const create=async(event:FormEvent)=>{event.preventDefault();if(!actor||busy||pending.length||createUnknown)return;setBusy(true);setError('');try{
    if(!localOperator){
      // The existing account-project API has no idempotent create receipt. A
      // lost response must be reviewed in the catalog, never automatically retried.
      const response=await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name.trim()})});
      const body=await response.json();if(!response.ok){if(response.status>=500)setCreateUnknown(true);throw Object.assign(new Error(body.error?.message??'Создание проекта не подтверждено.'),{status:response.status});}
      router.push(`/projects/${encodeURIComponent(body.project.id)}`);return;
    }
    const intent=freezeWorkspaceIntent({actorId:actor.id,projectId:null,url:'/api/projects',slot:'create',label:`Добавить папку ${rootPath}`,body:{rootPath,...(name.trim()?{name:name.trim()}:{})}}),result=await sendWorkspaceIntent<{project:WorkspaceProject}>(intent);if(result.ok)router.push(`/projects/${encodeURIComponent(result.data.project.id)}`);
  }catch(e){const status=(e as {status?:number}).status;if(!localOperator&&!(status&&status>=400&&status<500))setCreateUnknown(true);setError((e as Error).message);}finally{setBusy(false);}};
  if(loading)return <p className="ws-loading">Проверяем сессию…</p>;
  if(!actor)return <><header className="ws-heading"><div><h1>Ouro</h1><p>Войдите в свой аккаунт, чтобы открыть доступные проекты.</p></div></header><EmailLogin surface="workspace"/></>;
  return <><header className="ws-heading"><div><h1>Проекты</h1><p>{localOperator?'Выберите папку и передайте задачу подключённому агенту.':'Ваши проекты, дорожные карты и единая история работы в облаке.'}</p></div></header>{localOperator&&<WorkspaceOnboarding scope="catalog"/>}{(sessionError||error)&&<div className="ws-error" role="alert">{sessionError||error}</div>}
    <WorkspacePending projectId={null} onRecovered={refresh}/>
    <div className="ws-catalog-grid"><section className="ws-panel" aria-label={localOperator?'Добавить папку-проект':'Создать облачный проект'}><h2>Добавить проект</h2><p>{localOperator?'Любая папка на машине с Ouro. Git не требуется; выбор папки сохраняет привязку и не меняет файлы.':'Новый проект начнётся с пустой историей. Файлы вашего компьютера и локальные проекты сюда не переносятся.'}</p><form onSubmit={create}><label>Название проекта<input aria-label="Название проекта" value={name} onChange={event=>setName(event.target.value)} required={!localOperator} maxLength={120} placeholder="Например: Мой продукт"/></label>{localOperator&&<label>Папка проекта<input aria-label="Папка проекта" data-onboarding="folder-input" value={rootPath} onChange={event=>setRootPath(event.target.value)} required placeholder="/абсолютный/путь/к/папке" autoComplete="off"/></label>}<div className="ws-actions">{localOperator&&<button type="button" disabled={!actor||folderBusy} onClick={()=>void browse(rootPath)}><FolderOpen size={16}/>Выбрать папку</button>}<button className="ws-primary" type="submit" disabled={!actor||busy||!(localOperator?rootPath.trim():name.trim())||!!pending.length||createUnknown}><Plus size={16}/>Добавить проект</button></div></form>
      {createUnknown&&<p role="status">Ответ на создание не подтверждён. Проект мог сохраниться. Проверьте список перед повтором. <button onClick={()=>{void refresh().then(()=>setCreateUnknown(false)).catch(cause=>setError(cause.message));}}>Перечитать проекты</button></p>}
      {browsing&&<section className="ws-folder-browser" aria-label="Папки на сервере"><div className="ws-section-top"><h3>Папки на сервере</h3><button type="button" onClick={()=>setBrowsing(false)}>Закрыть</button></div><p>Это файловая система машины, где запущен Ouro.</p><form onSubmit={event=>{event.preventDefault();void browse(folderPath);}}><label>Путь для просмотра<input value={folderPath} onChange={event=>setFolderPath(event.target.value)}/></label><button disabled={folderBusy}>Перейти</button></form>{folder&&<><div className="ws-actions"><button disabled={!folder.parentPath||folderBusy} type="button" onClick={()=>void browse(folder.parentPath!)}><ArrowUp size={15}/>Выше</button><button className="ws-primary" type="button" onClick={()=>{setRootPath(folder.path);setBrowsing(false);}}>Выбрать эту папку</button></div><code className="ws-path">{folder.path}</code><ul className="ws-folders">{folder.entries.map(entry=><li key={entry.path}><button type="button" disabled={folderBusy} onClick={()=>void browse(entry.path)}><FolderOpen size={16}/><span>{entry.name}</span><ChevronRight size={16}/></button></li>)}</ul>{!folder.entries.length&&<p>Вложенных доступных папок нет.</p>}{folder.truncated&&<p>Показана только часть папок. Укажите более точный путь.</p>}</>}</section>}
    </section><section aria-label="Сохранённые проекты"><div className="ws-section-top" data-onboarding="saved-projects"><h2>Сохранённые проекты</h2><span>{projects.length}</span></div>{!ready&&!error&&!sessionError?<p>Читаем каталог…</p>:projects.length?<div className="ws-project-list">{projects.map(project=><Link key={project.id} className="ws-project-card" href={`/projects/${encodeURIComponent(project.id)}`}><FolderOpen size={20}/><div><h3>{project.name}</h3><p className="ws-path">{localOperator?(project.rootPath??'Учебный проект · прежний Human View'):'Облачный проект · '+project.role}</p><span className="ws-muted">{localOperator?(project.kind==='demo'?'Demo':'Локальная папка'):'Единая история проекта'}</span></div><span className="ws-link-label">Открыть проект <ChevronRight size={16}/></span></Link>)}</div>:<div className="ws-empty">{localOperator?'Добавьте первую папку — у неё будет собственная история и подключение агента.':'Доступных проектов пока нет. Создайте проект или примите приглашение.'}</div>}</section></div>
  </>;
}
