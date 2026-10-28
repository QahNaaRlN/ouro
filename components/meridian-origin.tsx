'use client';

import {Download,FileJson} from 'lucide-react';
import type {ProjectState,Spec} from '@/packages/core/src';
import {MeridianPin} from './meridian-panel';
import './meridian-panel.css';

export default function MeridianOrigin({spec,state}:{spec:Spec;state:ProjectState}){
  const origin=spec.origin;
  if(origin?.kind!=='meridian_import')return null;
  const event=state.events.find(event=>event.type==='SpecCreated'&&event.specId===spec.id);
  const source=event?.payload.meridianSource as {rawDocument?:unknown}|undefined;
  const raw=typeof source?.rawDocument==='string'?source.rawDocument:null;
  const download=()=>{
    if(raw===null)return;
    const url=URL.createObjectURL(new Blob([raw],{type:'application/json;charset=utf-8'})),link=document.createElement('a');
    link.href=url;link.download=`meridian-${spec.humanId.toLowerCase()}-source.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <section className="meridian-origin" aria-label="Происхождение Meridian"><div className="section-heading"><h3><FileJson size={16}/>Происхождение Meridian</h3><span className="meridian-badge">unverified_import</span></div><p>Черновик создан из проверенного по формату файла. Подлинность источника не проверена. Изменения ожидания в Ouro сохраняют исходный снимок.</p><dl className="meridian-meta"><div><dt>Проект источника</dt><dd>{origin.projectId}</dd></div><div><dt>Репозиторий</dt><dd>{origin.repositoryId}</dd></div><div><dt>Workspace</dt><dd>{origin.workspaceId}</dd></div><div><dt>Снимок</dt><dd>{origin.snapshotId}</dd></div><div className="meridian-hash"><dt>SHA256 исходного JSON</dt><dd><code>{origin.documentSha256}</code></dd></div></dl><details><summary>Неизменяемые pins и исходный документ</summary><div className="meridian-pins"><MeridianPin label="Спецификация источника" pin={origin.taskSpecificationPin}/><MeridianPin label="Попытка источника" pin={origin.runRef.run}/><MeridianPin label="Манифест контекста" pin={origin.contextManifestPin}/></div><p className="meridian-note">Контракт {origin.contract} · v{origin.contractVersion} · провайдер {origin.providerId}</p>{origin.criterionBindings.length>0&&<ul className="meridian-criterion-map">{origin.criterionBindings.map(item=><li key={item.criterionId}>{item.criterionId} ← {item.sourceCriterionId}</li>)}</ul>}</details>{raw!==null?<button type="button" className="btn btn-small" onClick={download}><Download size={14}/>Скачать исходный JSON</button>:<p className="meridian-note">Исходный документ отсутствует в полученной истории.</p>}</section>;
}
