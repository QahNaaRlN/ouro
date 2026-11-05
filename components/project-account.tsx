'use client';

import {AppSelect} from './app-select';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Box, LogIn, LogOut, Mail, Plus, ShieldCheck, UserPlus, Users } from 'lucide-react';
import type { Actor } from '@/packages/core/src';
import { selectedProjectId } from '@/lib/client-project';
export { selectedProjectId } from '@/lib/client-project';
import type { ProjectMembership, ProjectRole } from '@ouro/protocol/http';
import {participantPresentation,type ParticipantSurface} from './participant-presentation';
import {useCatalogProjectsQuery} from '@/packages/frontend/src/api/catalog-reads';
import {ClientError,type CatalogReadScope} from '@/packages/client/src/ports';

async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? 'Операция не выполнена.');
  return body;
}
const post = (url: string, body: unknown, method = 'POST') => request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const selectProject = (projectId: string) => {
  document.cookie = `ouro_project=${encodeURIComponent(projectId)}; SameSite=Strict; Path=/; Max-Age=31536000${location.protocol === 'https:' ? '; Secure' : ''}`;
  location.reload();
};

export function AccountLogout({ identity }: { identity: Actor | null }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!identity) return null;
  const logout = async () => {
    if (busy) return; setBusy(true); setError('');
    try {
      await post('/api/auth/logout', {});
      document.cookie = 'ouro_project=; SameSite=Strict; Path=/; Max-Age=0';
      location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось выйти.'); setBusy(false); }
  };
  return <><button className="icon-btn" type="button" aria-label="Выйти из аккаунта" title="Выйти из аккаунта" disabled={busy} onClick={() => void logout()}><LogOut size={15}/></button>{error&&<span role="alert">{error}</span>}</>;
}

/** Показывает вход по почте, принятие приглашения и восстановление пароля аккаунта. */
export function EmailLogin({surface='legacy'}:{surface?:ParticipantSurface}) {
  const ui=participantPresentation(surface);
  const [mode, setMode] = useState<'login' | 'invitation' | 'reset'>('login');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [name, setName] = useState(''), [code, setCode] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const run = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'login') await post('/api/auth/login', { email, password });
      else if (mode === 'invitation') await post('/api/auth/invitations/accept', { code, name, password });
      else await post('/api/auth/password-reset/confirm', { code, password });
      setPassword(''); setCode(''); location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Операция не выполнена.'); }
    finally { setBusy(false); }
  };
  const requestReset = async () => {
    if (busy || !email.trim()) return; setBusy(true); setError(''); setNotice('');
    try { await post('/api/auth/password-reset/request', { email }); setNotice('Если аккаунт существует, код отправлен на указанный email.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось запросить код.'); }
    finally { setBusy(false); }
  };
  return <section className={ui.section} aria-label="Вход в аккаунт">
    <div className={ui.sectionHeading}><h2 className={ui.heading}><LogIn size={17}/>Аккаунт Ouro</h2></div>
    <div className="segmented" aria-label="Операция аккаунта">
      <button type="button" className={mode === 'login' ? 'selected' : ''} onClick={() => { setMode('login'); setError(''); }}>Вход</button>
      <button type="button" className={mode === 'invitation' ? 'selected' : ''} onClick={() => { setMode('invitation'); setError(''); }}>Приглашение</button>
      <button type="button" className={mode === 'reset' ? 'selected' : ''} onClick={() => { setMode('reset'); setError(''); }}>Сброс пароля</button>
    </div>
    <form className={`participant-login-form ${ui.form}`} onSubmit={run}>
      {mode !== 'invitation' && <label className={`${ui.label} flex-1`}><span>Email</span><input className={ui.field} type="email" autoComplete="email" required maxLength={254} value={email} disabled={busy} onChange={event => setEmail(event.target.value)}/></label>}
      {mode === 'invitation' && <label className={`${ui.label} flex-1`}><span>Имя для нового аккаунта</span><input className={ui.field} autoComplete="name" maxLength={120} value={name} disabled={busy} onChange={event => setName(event.target.value)}/></label>}
      {mode !== 'login' && <label className={`${ui.label} flex-1`}><span>Одноразовый код из письма</span><input className={ui.field} required minLength={43} maxLength={43} value={code} disabled={busy} onChange={event => setCode(event.target.value.trim())}/></label>}
      <label className={`${ui.label} flex-1`}><span>{mode === 'login' ? 'Пароль' : 'Новый пароль'}</span><input className={ui.field} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? 1 : 12} maxLength={128} value={password} disabled={busy} onChange={event => setPassword(event.target.value)}/></label>
      <button className={`btn btn-primary ${ui.formButton}`} disabled={busy} type="submit">{mode === 'login' ? 'Войти' : mode === 'invitation' ? 'Принять приглашение' : 'Установить пароль'}</button>
    </form>
    {mode === 'invitation' && <p className={ui.copy}>Для существующего аккаунта сначала войдите, затем примите приглашение на странице участников.</p>}
    {mode === 'reset' && <button className="btn btn-small" type="button" disabled={busy || !email.trim()} onClick={() => void requestReset()}><Mail size={14}/>Отправить код сброса</button>}
    {notice && <p className={ui.sectionNotice} role="status">{notice}</p>}{error && <p className={ui.sectionError} role="alert">{error}</p>}
  </section>;
}

/** Показывает доступные проекты и позволяет переключить выбранный проект или создать новый. */
export function ProjectSwitcher({ identity,hasAccount,readScope }: { identity: Actor | null;hasAccount:boolean;readScope:CatalogReadScope }) {
  const catalog=useCatalogProjectsQuery(readScope,hasAccount?'account':'workspace',!!identity),reading=hasAccount?catalog.account:catalog.workspace;
  const projects=hasAccount?catalog.account.data??[]:catalog.workspace.data??[],[current]=useState(selectedProjectId);
  const [creating, setCreating] = useState(false), [name, setName] = useState(''), [actionError, setError] = useState('');
  const error=actionError||(reading.status==='unavailable'?'Чтение каталога недоступно в этом окружении.':reading.error?.message??'');
  const create = async (event: FormEvent) => {
    event.preventDefault(); if (!name.trim()) return; setError('');
    try { const body = await post('/api/projects', { name: name.trim() }); selectProject(body.project.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось создать проект.'); }
  };
  if (!identity) return <div className="workspace-switch"><span className="workspace-avatar"><Box size={17}/></span><div><strong>Ouro</strong><small>Требуется вход</small></div></div>;
  return <div className="workspace-switch block">
    <label className="flex w-full flex-col gap-[6px]">
      <span className="quiet-label">ТЕКУЩИЙ ПРОЕКТ</span>
      <AppSelect aria-label="Текущий проект" value={projects.some(project => project.id === current) ? current : ''} onValueChange={selectedValue=> selectProject(selectedValue)} className="w-full rounded-[6px] border border-solid border-ouro-border bg-ouro-bg p-[8px] text-ouro-text">
        {!projects.length && <option value="">{reading.status==='loading'?'Загрузка проектов…':reading.status==='unavailable'?'Каталог недоступен':reading.status==='error'?'Не удалось прочитать проекты':'Нет доступных проектов'}</option>}
        {projects.map(project => <option key={project.id} value={project.id}>{project.name} · {project.role}</option>)}
      </AppSelect>
    </label>
    {identity.id !== 'local-human' && identity.id !== 'human-token' && <button className="text-btn" type="button" onClick={() => setCreating(value => !value)}><Plus size={13}/>Новый проект</button>}
    {creating && <form onSubmit={create} className="mt-[8px] flex gap-[6px]"><input className="w-full min-w-0" aria-label="Название нового проекта" required maxLength={120} value={name} onChange={event => setName(event.target.value)}/><button className="btn btn-small" type="submit">Создать</button></form>}
    {error && <small role="alert">{error}</small>}
  </div>;
}

/** Показывает участников проекта и формы приглашения, изменения роли и отзыва доступа. */
export function ProjectMembersPanel({ projectId, identity,readScope,surface='legacy' }: { projectId: string; identity: Actor;readScope:CatalogReadScope;surface?:ParticipantSurface }) {
  const ui=participantPresentation(surface);
  const [members, setMembers] = useState<ProjectMembership[]>([]),catalog=useCatalogProjectsQuery(readScope,'account',true),projects=catalog.account.data??[];
  const refreshCatalog=catalog.refresh;
  const [email, setEmail] = useState(''), [role, setRole] = useState<ProjectRole>('Contributor'), [code, setCode] = useState('');
  const [actionError, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const error=actionError||(catalog.account.status==='unavailable'?'Чтение каталога недоступно в этом окружении.':catalog.account.error?.message??'');
  const currentRole = projects.find(project => project.id === projectId)?.role;
  const reload = useCallback(async () => {
    try {
      const [memberData] = await Promise.all([request(`/api/projects/${encodeURIComponent(projectId)}/members`), refreshCatalog()]);
      setMembers(memberData.members); setError('');
    } catch (cause) { if(!(cause instanceof ClientError&&cause.kind==='cancelled'))setError(cause instanceof Error ? cause.message : 'Не удалось прочитать участников.'); }
  }, [projectId,refreshCatalog]);
  useEffect(() => { void reload(); }, [reload]);
  const invite = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError(''); setNotice('');
    try { await post(`/api/projects/${encodeURIComponent(projectId)}/invitations`, { email, role }); setEmail(''); setNotice('Приглашение создано. Одноразовый код отправлен по email.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось пригласить участника.'); }
    finally { setBusy(false); }
  };
  const changeRole = async (membershipId: string, nextRole: ProjectRole) => {
    try { await post(`/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(membershipId)}`, { role: nextRole }, 'PATCH'); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось изменить роль.'); }
  };
  const revoke = async (membershipId: string) => {
    try { await post(`/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(membershipId)}`, {}, 'DELETE'); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось отозвать доступ.'); }
  };
  const accept = async (event: FormEvent) => {
    event.preventDefault(); try { await post('/api/auth/invitations/accept', { code }); setCode(''); location.reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось принять приглашение.'); }
  };
  return <div className={ui.panel}><div className="page-heading"><div><div className="eyebrow">ДОСТУП К ПРОЕКТУ</div><h1 className={ui.title}><Users size={25}/>Участники</h1><p className="page-description">Ваша роль: {currentRole ?? 'проверяется'}. Изменения сохраняются с отдельным user ID.</p></div></div>
    {error && <p className={ui.error} role="alert">{error}</p>}{notice && <p className={ui.notice} role="status">{notice}</p>}
    {currentRole === 'Owner' && <section className={ui.section}><div className={ui.sectionHeading}><h2 className={ui.heading}><UserPlus size={17}/>Пригласить по email</h2></div><form className={`participant-create-form ${ui.form}`} onSubmit={invite}><label className={`${ui.label} flex-1`}><span>Email</span><input className={ui.field} type="email" required value={email} onChange={event => setEmail(event.target.value)}/></label><label className={`${ui.label} flex-1`}><span>Роль</span><AppSelect aria-label="Роль" value={role} onValueChange={selectedValue=> setRole(selectedValue as ProjectRole)}><option>Contributor</option><option>Viewer</option><option>Owner</option></AppSelect></label><button className={`btn btn-primary ${ui.formButton}`} disabled={busy}>Пригласить</button></form></section>}
    <section className={ui.section}><div className={ui.sectionHeading}><h2 className={ui.heading}>Участники проекта</h2></div><div className={ui.directory}>{members.map(member => <article className={ui.card} key={member.id}><div className={ui.cardIdentity}><strong className={ui.name}>{member.name}</strong><small className={ui.small}>{member.email}</small><code className={ui.id}>{member.userId}</code>{member.revokedAt && <small className={ui.small}>Доступ отозван</small>}</div><div className={ui.cardActions}>{currentRole === 'Owner' && !member.revokedAt ? <><AppSelect aria-label={`Роль ${member.name}`} value={member.role} onValueChange={selectedValue=> void changeRole(member.id, selectedValue as ProjectRole)}><option>Owner</option><option>Contributor</option><option>Viewer</option></AppSelect><button className="btn btn-small" onClick={() => void revoke(member.id)}>Отозвать доступ</button></> : <span className={ui.badge}>{member.role}</span>}</div></article>)}</div></section>
    <section className={ui.section}><div className={ui.sectionHeading}><h2 className={ui.heading}><ShieldCheck size={17}/>Приглашение для {identity.name ?? 'текущего аккаунта'}</h2></div><form className={`participant-login-form ${ui.form}`} onSubmit={accept}><label className={`${ui.label} flex-1`}><span>Одноразовый код</span><input className={ui.field} required minLength={43} maxLength={43} value={code} onChange={event => setCode(event.target.value.trim())}/></label><button className={`btn ${ui.formButton}`}>Принять приглашение</button></form></section>
  </div>;
}
