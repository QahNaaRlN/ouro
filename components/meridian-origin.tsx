'use client';

import {WorkspaceAccordion} from './workspace-ui';
import {Download,FileJson} from 'lucide-react';
import type {ProjectState,Spec} from '@/packages/core/src';
import {MeridianPin} from './meridian-panel';
import {meridianPresentation as m} from './meridian-presentation';

/** Показывает сохранённое происхождение импорта Meridian и позволяет скачать исходный документ. */
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
  return <section className={m.origin} aria-label="Происхождение Meridian"><div className={m.originHeading}><h3 className={m.originTitle}><FileJson size={16}/>Происхождение Meridian</h3><span className={m.badge}>unverified_import</span></div><p className={m.originParagraph}>Черновик создан из проверенного по формату файла. Подлинность источника не проверена. Изменения ожидания в Ouro сохраняют исходный снимок.</p><dl className={m.originMeta}><div className={m.metaRow}><dt className={m.metaTerm}>Проект источника</dt><dd className={m.originValue}>{origin.projectId}</dd></div><div className={m.metaRow}><dt className={m.metaTerm}>Репозиторий</dt><dd className={m.originValue}>{origin.repositoryId}</dd></div><div className={m.metaRow}><dt className={m.metaTerm}>Workspace</dt><dd className={m.originValue}>{origin.workspaceId}</dd></div><div className={m.metaRow}><dt className={m.metaTerm}>Снимок</dt><dd className={m.originValue}>{origin.snapshotId}</dd></div><div className={m.hash}><dt className={m.metaTerm}>SHA256 исходного JSON</dt><dd className={m.originValue}><code className={m.hashCode}>{origin.documentSha256}</code></dd></div></dl><WorkspaceAccordion className={m.accordion} triggerClassName={m.accordionTrigger} title={<>Неизменяемые pins и исходный документ</>}><div className={m.pins}><MeridianPin label="Спецификация источника" pin={origin.taskSpecificationPin}/><MeridianPin label="Попытка источника" pin={origin.runRef.run}/><MeridianPin label="Манифест контекста" pin={origin.contextManifestPin}/></div><p className={m.note}>Контракт {origin.contract} · v{origin.contractVersion} · провайдер {origin.providerId}</p>{origin.criterionBindings.length>0&&<ul className={m.criterionMap}>{origin.criterionBindings.map(item=><li key={item.criterionId}>{item.criterionId} ← {item.sourceCriterionId}</li>)}</ul>}</WorkspaceAccordion>{raw!==null?<button type="button" className={m.originDownload} onClick={download}><Download size={14}/>Скачать исходный JSON</button>:<p className={m.note}>Исходный документ отсутствует в полученной истории.</p>}</section>;
}
