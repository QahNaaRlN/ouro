'use client';

import { projectFetch } from '@/lib/client-project';

import { useEffect,useRef,useState,type FormEvent } from 'react';
import { Check,Copy,KeyRound,LoaderCircle,LogIn,LogOut,ShieldCheck,UserPlus,Users } from 'lucide-react';
import type { Actor } from '@/packages/core/src';
import type { ParticipantRegistration } from '@ouro/protocol/http';
import {participantUi} from './participant-presentation';
import {twMerge} from 'tailwind-merge';

type ParticipantLoginProps={onSignedIn?:()=>void;
  /** Добавляет оформление поля в конкретном редакторе, сохраняя стандартную поверхность. */
  inputClassName?:string;
  /** Оформляет подпись без зависимости от селектора внешнего контейнера. */
  captionClassName?:string;
};
export function ParticipantLogin({onSignedIn,inputClassName,captionClassName}:ParticipantLoginProps){
  const [credential,setCredential]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const login=async(event:FormEvent)=>{
    event.preventDefault();if(busy)return;setBusy(true);setError('');
    try{
      const response=await projectFetch('/api/participants/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:credential.trim()})}),body=await response.json();
      if(!response.ok)throw new Error(body.error?.message??'Не удалось войти.');
      setCredential('');if(onSignedIn)onSignedIn();else window.location.reload();
    }catch(error){setError(error instanceof Error?error.message:'Не удалось войти.');}finally{setBusy(false);}
  };
  const reset=async()=>{
    if(busy)return;setBusy(true);setError('');
    try{
      const response=await projectFetch('/api/participants/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),body=await response.json();
      if(!response.ok)throw new Error(body.error?.message??'Не удалось выйти.');
      setCredential('');if(onSignedIn)onSignedIn();else window.location.reload();
    }catch(error){setError(error instanceof Error?error.message:'Не удалось выйти.');setBusy(false);}
  };
  return <section className={participantUi.section} aria-label="Войти участником"><div className={participantUi.sectionHeading}><h2 className={participantUi.heading}><LogIn size={17}/>Войти участником</h2></div><p className={participantUi.copy}>Введите ключ, полученный у оператора Ouro. История изменений будет показывать вашу отдельную идентичность.</p><form className={`participant-login-form ${participantUi.form}`} onSubmit={login}><label className={`${participantUi.label} flex-1`}><span className={captionClassName}>Ключ участника</span><input className={twMerge(participantUi.field,inputClassName)} type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={80} value={credential} disabled={busy} onChange={event=>{setCredential(event.target.value);setError('');}} placeholder="ouro_human_…"/></label><button className={`btn btn-primary ${participantUi.formButton}`} disabled={busy||!credential.trim()} type="submit">{busy?<LoaderCircle className="spin" size={15}/>:<LogIn size={15}/>}Войти</button><button className={`btn btn-small ${participantUi.formButton}`} disabled={busy} type="button" onClick={()=>void reset()}>Выйти и сбросить сессию</button></form>{error&&<p className={participantUi.sectionError} role="alert">{error}</p>}</section>;
}

type Directory={participants:ParticipantRegistration[];actor:Actor;canManageParticipants:boolean};
export default function ParticipantsPanel({onIdentityChange}:{onIdentityChange?:()=>void}){
  const [directory,setDirectory]=useState<Directory|null>(null),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [created,setCreated]=useState<{participant:ParticipantRegistration;credential:string}|null>(null),[copied,setCopied]=useState(false);
  const mounted=useRef(false),activeRead=useRef<AbortController|null>(null),sequence=useRef(0);
  const reload=async()=>{
    const current=++sequence.current;activeRead.current?.abort();const controller=new AbortController();activeRead.current=controller;
    try{
      const response=await projectFetch('/api/participants',{cache:'no-store',signal:controller.signal}),body=await response.json();
      if(!response.ok)throw new Error(body.error?.message??'Не удалось прочитать участников.');
      if(mounted.current&&current===sequence.current){setDirectory(body);setError('');}
    }catch(error){if(!controller.signal.aborted&&mounted.current&&current===sequence.current)setError(error instanceof Error?error.message:'Не удалось прочитать участников.');}
  };
  useEffect(()=>{mounted.current=true;void reload();const timer=setInterval(()=>void reload(),8000);return()=>{mounted.current=false;sequence.current++;activeRead.current?.abort();clearInterval(timer);};},[]);
  const post=async(url:string,payload:unknown)=>{
    const response=await projectFetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),body=await response.json();
    if(!response.ok)throw new Error(body.error?.message??'Изменение не принято.');return body;
  };
  const create=async(event:FormEvent)=>{
    event.preventDefault();if(busy)return;setBusy(true);setError('');setNotice('');
    try{
      const result=await post('/api/participants',{name:name.trim()});setCreated(result);setCopied(false);setName('');await reload();
    }catch(error){setError(error instanceof Error?error.message:'Не удалось создать участника.');}finally{setBusy(false);}
  };
  const revoke=async(participant:ParticipantRegistration)=>{
    if(busy)return;setBusy(true);setError('');setNotice('');
    try{await post(`/api/participants/${encodeURIComponent(participant.id)}/revoke`,{});if(created?.participant.id===participant.id)setCreated(null);setNotice(`Доступ ${participant.name} отозван. История авторства сохранена.`);await reload();}
    catch(error){setError(error instanceof Error?error.message:'Не удалось отозвать доступ.');}finally{setBusy(false);}
  };
  const logout=async()=>{
    if(busy)return;setBusy(true);setError('');
    try{await post('/api/participants/logout',{});if(onIdentityChange)onIdentityChange();else window.location.reload();}
    catch(error){setError(error instanceof Error?error.message:'Не удалось выйти.');setBusy(false);}
  };
  const copy=async()=>{if(!created)return;try{await navigator.clipboard.writeText(created.credential);setCopied(true);}catch{setError('Скопируйте ключ из поля вручную.');}};
  const date=(value:string)=>new Date(value).toLocaleString('ru-RU');
  return <div className="participants-panel mx-auto my-0 flex w-[min(100%,1080px)] flex-col gap-[22px] px-[40px] pt-[36px] pb-[60px] [@media(max-width:760px)]:gap-[16px] [@media(max-width:760px)]:px-[18px] [@media(max-width:760px)]:pt-[24px] [@media(max-width:760px)]:pb-[40px]"><div className="page-heading"><div><div className="eyebrow">СОВМЕСТНАЯ РАБОТА</div><h1 className="flex items-center gap-[9px]"><Users size={25}/>Участники</h1><p className="page-description">Отдельное авторство для решений и общих черновиков.</p></div></div>
    <p className={`participant-scope-note ${participantUi.copy}`}>Все участники имеют человеческие полномочия текущего проекта: могут менять ожидания, принимать решения и DoD. Это реестр доступа standalone Ouro; подключение внешнего SSO и разделение ролей здесь не выполняются.</p>
    {error&&<p className={participantUi.error} role="alert">{error}</p>}{notice&&<p className="participant-notice rounded-[6px] border border-ouro-border px-[14px] py-[12px] text-[13px] text-ouro-text-muted" role="status">{notice}</p>}
    {directory&&<section className={participantUi.section} aria-label="Текущая идентичность"><div className={participantUi.sectionHeading}><h2 className={participantUi.heading}><ShieldCheck size={17}/>Вы вошли как {directory.actor.name??directory.actor.id}</h2>{!directory.canManageParticipants&&<button className="btn btn-small" disabled={busy} onClick={()=>void logout()}><LogOut size={14}/>Выйти из сессии участника</button>}</div><p className={participantUi.copy}>{directory.canManageParticipants?'Доверенный оператор этого рабочего места. Вы можете выдать или отозвать ключ участника.':'Именованный участник проекта. Регистрацией и отзывом ключей управляет оператор.'}</p><code className={participantUi.id}>{directory.actor.id}</code></section>}
    <ParticipantLogin onSignedIn={onIdentityChange}/>
    {directory?.canManageParticipants&&<section className={participantUi.section} aria-label="Пригласить участника"><div className={participantUi.sectionHeading}><h2 className={participantUi.heading}><UserPlus size={17}/>Пригласить участника</h2></div><form className={`participant-create-form ${participantUi.form}`} onSubmit={create}><label className={`${participantUi.label} flex-1`}><span>Имя участника</span><input className={participantUi.field} required maxLength={120} value={name} disabled={busy} onChange={event=>setName(event.target.value)} placeholder="Имя для истории изменений"/></label><button className={`btn btn-primary ${participantUi.formButton}`} disabled={busy||!name.trim()}>{busy?<LoaderCircle size={15} className="spin"/>:<UserPlus size={15}/>}Создать участника</button></form></section>}
    {created&&<section className={participantUi.secretSection} aria-label="Новый ключ участника"><div className={participantUi.sectionHeading}><h2 className={participantUi.heading}><KeyRound size={17}/>Ключ для {created.participant.name}</h2><button type="button" className="btn btn-small self-start" onClick={()=>void copy()}>{copied?<Check size={14}/>:<Copy size={14}/>}Скопировать ключ</button></div><p className={participantUi.copy}>Ключ показывается один раз. Передайте его участнику; до отзыва он позволяет повторно войти после выхода или перезапуска сервера.</p><label className={participantUi.label}><span>Выданный ключ участника</span><textarea className={participantUi.secretField} readOnly rows={2} value={created.credential} autoComplete="off" spellCheck={false}/></label><button className="btn btn-small self-start" onClick={()=>{setCreated(null);setCopied(false);}}>Я сохранил ключ — скрыть</button></section>}
    <section className={participantUi.section} aria-label="Реестр участников"><div className={participantUi.sectionHeading}><h2 className={participantUi.heading}>Участники проекта</h2><span className="quiet-label">{directory?.participants.filter(participant=>!participant.revokedAt).length??'…'} С ДОСТУПОМ</span></div>{!directory?<p className={`helper-note ${participantUi.copy}`}>Загрузка реестра…</p>:!directory.participants.length?<p className={`helper-note ${participantUi.copy}`}>Именованных участников пока нет. Демо-вкладки используют одну локальную идентичность.</p>:<div className="participant-directory flex flex-col gap-[10px]">{directory.participants.map(participant=><article className="participant-card flex justify-between gap-[18px] rounded-[7px] border border-ouro-border bg-ouro-bg p-[16px] [@media(max-width:760px)]:flex-col [@media(max-width:760px)]:gap-[12px]" key={participant.id}><div className="flex min-w-0 flex-col items-start gap-[7px]"><strong className="text-[14px]">{participant.name}</strong><code className={participantUi.id}>{participant.id}</code><small className="text-[11px] text-ouro-text-muted">Создан {date(participant.createdAt)}</small>{participant.revokedAt&&<small className="text-[11px] text-ouro-text-muted">Отозван {date(participant.revokedAt)}</small>}</div><div className="flex min-w-0 flex-col items-end gap-[7px] [@media(max-width:760px)]:items-start"><span className={`participant-badge whitespace-nowrap rounded-[4px] border border-ouro-border px-[7px] py-[4px] text-[11px] ${participant.revokedAt?'revoked text-ouro-text-muted':'text-ouro-text'}`}>{participant.revokedAt?'Доступ отозван':'Доступ действует'}</span>{directory.canManageParticipants&&!participant.revokedAt&&<button className="btn btn-small min-w-0 max-w-full whitespace-normal [overflow-wrap:anywhere]" disabled={busy} onClick={()=>void revoke(participant)}>Отозвать доступ {participant.name}</button>}</div></article>)}</div>}</section>
  </div>;
}
