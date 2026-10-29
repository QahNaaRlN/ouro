'use client';

import Link from 'next/link';
import {useState,type FormEvent} from 'react';
import {Bot,Copy,Download,KeyRound,Plug,ShieldCheck} from 'lucide-react';
import {AGENT_CLIENTS,buildAgentClientConfig,type AgentClientId} from '@/lib/agent-client-config';
import type {AgentRegistration} from './agents-panel';
import {useWorkspaceSession,type WorkspaceConnection} from './workspace-client';

const profiles=AGENT_CLIENTS.map(profile=>({id:profile.id,name:profile.label}));

export default function WorkspaceConnectionPanel({projectId,agents,connection,onRefresh}:{projectId:string;agents:AgentRegistration[];connection:WorkspaceConnection;onRefresh:()=>Promise<unknown>}){
  const {actor}=useWorkspaceSession(),[client,setClient]=useState<AgentClientId>('cursor'),[name,setName]=useState('Cursor'),[issued,setIssued]=useState<{agent:AgentRegistration;token:string;connection:WorkspaceConnection}|null>(null),[keyFile,setKeyFile]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState('');
  const base=`/api/projects/${encodeURIComponent(projectId)}`;
  const headers={'Content-Type':'application/json','X-Ouro-Expected-Project':projectId,'X-Ouro-Expected-Participant':actor?.id??''};
  const selectClient=(value:AgentClientId)=>{const previous=profiles.find(profile=>profile.id===client)!.name,next=profiles.find(profile=>profile.id===value)!;setClient(value);setName(current=>current===previous?next.name:current);setCopied('');};
  const register=async(event:FormEvent)=>{event.preventDefault();if(!actor||busy)return;setBusy(true);setError('');try{const response=await fetch(`${base}/agents`,{method:'POST',headers,body:JSON.stringify({name:name.trim()})}),body=await response.json();if(!response.ok)throw new Error(body.error?.message??'Регистрация не подтверждена.');if(body.agent.projectId!==projectId||body.connection.projectId!==projectId)throw new Error('Подключение принадлежит другому проекту.');setIssued(body);setCopied('');await onRefresh();}catch(e){setError(`${(e as Error).message} Если ключ не получен, обновите список и отзовите лишнюю регистрацию перед созданием новой.`);}finally{setBusy(false);}};
  const revoke=async(agent:AgentRegistration)=>{if(!actor||busy)return;setBusy(true);setError('');try{const response=await fetch(`${base}/agents/${encodeURIComponent(agent.id)}/revoke`,{method:'POST',headers,body:'{}'}),body=await response.json();if(!response.ok)throw new Error(body.error?.message??'Отзыв не подтверждён. Обновите список.');if(issued?.agent.id===agent.id)setIssued(null);await onRefresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const copy=async(value:string,label:string)=>{try{await navigator.clipboard.writeText(value);setCopied(label);}catch{setError('Буфер обмена недоступен. Скопируйте текст из поля.');}};
  let generated:ReturnType<typeof buildAgentClientConfig>|null=null,validation='Укажите абсолютный путь к сохранённому файлу ключа.';
  if(keyFile!==''){try{generated=buildAgentClientConfig({client,connection,keyFile});validation='Конфигурация готова. Сам ключ в JSON не включён.';}catch(e){validation=e instanceof Error?e.message:'Проверьте параметры подключения.';}}
  const config=generated?JSON.stringify(generated.config,null,2):'',entry=generated?JSON.stringify(generated.entry,null,2):'';
  const configCopyId=`config:${client}:${projectId}:${keyFile}`,entryCopyId=`entry:${client}:${projectId}:${keyFile}`,keyCopyId=`key:${issued?.agent.id??''}`;
  const download=()=>{if(!generated)return;const url=URL.createObjectURL(new Blob([config+'\n'],{type:'application/json'})),anchor=document.createElement('a');anchor.href=url;anchor.download=`ouro-${client}-mcp.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),0);};
  return <section className="ws-panel" aria-label="Подключение MCP-агента">
    <div className="ws-section-top"><div><p className="ws-step">01 · ПОДКЛЮЧЕНИЕ</p><h2>MCP-агенты проекта</h2></div><Plug size={23}/></div>
    <p>Выберите клиент и подключите его к этому проекту. Cursor и Claude работают через локальный stdio bridge; отдельный туннель для них не нужен.</p>
    {error&&<p className="ws-error" role="alert">{error}</p>}
    <label className="ws-client-choice">MCP-клиент<select aria-label="MCP-клиент" value={client} disabled={busy} onChange={event=>selectClient(event.target.value as AgentClientId)}>{profiles.map(profile=><option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
    <form className="ws-inline-form" onSubmit={register}><label>Имя подключения<input value={name} onChange={event=>setName(event.target.value)} maxLength={100} required/></label><button disabled={!actor||busy||!name.trim()} type="submit"><KeyRound size={16}/>Зарегистрировать агента</button></form>
    <p className="ws-muted">Для одновременной работы Cursor и Claude создайте отдельные регистрации и файлы ключей. Это позволит различать их действия и отзывать доступ по отдельности.</p>
    {issued&&<section className="ws-issued" aria-label="Новое подключение агента"><h3><ShieldCheck size={18}/> Сохраните ключ — он показан один раз</h3><p>Ключ регистрации «{issued.agent.name}» закреплён за этим проектом.</p><label>Ключ агента<input aria-label="Ключ агента" readOnly value={issued.token} spellCheck={false} autoComplete="off"/></label><div className="ws-actions"><button type="button" onClick={()=>void copy(issued.token,keyCopyId)}><Copy size={15}/>{copied===keyCopyId?'Ключ скопирован':'Скопировать ключ'}</button><button type="button" onClick={()=>{setIssued(null);setCopied('');}}>Ключ сохранён — скрыть</button></div><p>Сохраните ключ в отдельный локальный файл вне репозитория и ограничьте доступ к нему. После скрытия ключа конфигурация ниже останется доступна по пути к вашему файлу.</p></section>}
    <section className="ws-client-config" aria-label="Конфигурация выбранного клиента">
      <h3>Конфигурация для {profiles.find(profile=>profile.id===client)!.name}</h3>
      <label>Файл ключа агента<input value={keyFile} onChange={event=>{setKeyFile(event.target.value);setCopied('');}} placeholder="/абсолютный/путь/ouro-agent.key" autoComplete="off" spellCheck={false}/></label>
      <p className="ws-muted" role="status" aria-label="Проверка конфигурации">{validation}</p>
      <label>Конфигурация MCP<textarea aria-label="Конфигурация MCP проекта" readOnly spellCheck={false} rows={12} value={config}/></label>
      <div className="ws-actions"><button disabled={!generated} type="button" onClick={()=>void copy(config,configCopyId)}><Copy size={15}/>{copied===configCopyId?'Конфигурация скопирована':'Скопировать конфигурацию'}</button><button disabled={!generated} type="button" onClick={download}><Download size={15}/>Скачать JSON</button></div>
      <div className="ws-client-instructions" data-testid="client-config-instructions"><ClientInstructions client={client}/></div>
      {client==='claude-code'&&<details><summary>Одна server entry для Claude Code CLI</summary><p className="ws-muted">Для claude mcp add-json нужна только эта запись сервера. Полный JSON выше подходит для .mcp.json или запуска claude --mcp-config с файлом.</p><textarea aria-label="Server entry для Claude Code" readOnly spellCheck={false} rows={10} value={entry}/><button type="button" disabled={!generated} onClick={()=>void copy(entry,entryCopyId)}>{copied===entryCopyId?'Server entry скопирована':'Скопировать server entry'}</button></details>}
      <p className="ws-muted">Ouro, Node.js, bridge и клиент должны быть доступны на вашей машине. 127.0.0.1 означает компьютер клиента. Скопированные пути относятся к машине, где запущен Ouro.</p>
      <Link href={`/projects/help#${client}`}>Пошаговая инструкция: {profiles.find(profile=>profile.id===client)!.name}</Link>
    </section>
    <ul className="ws-agent-list">{agents.map(agent=><li key={agent.id} data-agent-id={agent.id}><Bot size={18}/><div><strong>{agent.name}</strong><p>{agent.revokedAt?'Ключ отозван':agent.lastSeenAt?`Последнее обращение: ${new Date(agent.lastSeenAt).toLocaleString('ru-RU')}`:'Обращений ещё не было'}</p><code>{agent.id}</code></div>{!agent.revokedAt&&<button disabled={busy} onClick={()=>void revoke(agent)}>Отозвать ключ</button>}</li>)}</ul>
    {!agents.length&&<p className="ws-muted">Регистраций пока нет. Создайте подключение, затем выберите его при назначении задачи.</p>}
    <p className="ws-muted">Последнее обращение показывает наблюдавшийся вызов, а не постоянное соединение. Регистрация и сохранение JSON не запускают клиент или модель.</p>
    <details><summary>Адрес MCP этого проекта</summary><code className="ws-path">{connection.httpUrl}</code></details><Link href="/projects/help">Подключить Cursor, Claude или ChatGPT <span aria-hidden="true">↗</span></Link>
  </section>;
}

function ClientInstructions({client}:{client:AgentClientId}){
  if(client==='cursor')return <><h4>Куда добавить JSON</h4><p><code>.cursor/mcp.json</code> в папке проекта, открытой в Cursor, либо <code>~/.cursor/mcp.json</code> для всех проектов. Если файл уже существует, добавьте только запись Ouro в его <code>mcpServers</code>, сохранив другие подключения.</p><p>В Cursor откройте настройки MCP, включите сервер и проверьте Available Tools. Передавайте права на вызовы инструментов осознанно; регистрация в Ouro сама их не включает.</p></>;
  if(client==='claude-code')return <><h4>Куда добавить JSON</h4><p><code>.mcp.json</code> в папке, из которой вы запускаете Claude Code. Сохраните другие записи <code>mcpServers</code>. Подтвердите доверие к проекту и разрешение MCP-сервера, затем проверьте его через <code>/mcp</code>.</p><p>Можно сохранить скачанный JSON отдельно и запустить <code>claude --mcp-config "/абсолютный/путь/ouro-claude-code-mcp.json"</code>. Это не требует замены существующих настроек.</p></>;
  if(client==='claude-desktop')return <><h4>Куда добавить JSON</h4><p>В Claude Desktop откройте Settings → Developer → Edit Config и добавьте запись Ouro в <code>claude_desktop_config.json</code>, сохранив остальные подключения.</p><p>Полностью закройте и заново запустите Claude Desktop. Найдите сервер в Connectors → Manage connectors и проверьте доступные инструменты.</p></>;
  return <><h4>Подключение ChatGPT</h4><p>Настройте официальный Secure MCP Tunnel со stdio-профилем: команда, аргументы и env из JSON выше. Подключите туннель в аккаунте ChatGPT. Ключ OpenAI для туннеля настраивается отдельно от ключа агента Ouro.</p></>;
}
