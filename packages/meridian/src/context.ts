/** Narrow import adapter adapted from Meridian's pinned WorkScope validators.
 * Source: QahNaaRlN/meridian@1d3a9f80b196498b5fe2d8a1357f2aaef2aa9c76
 * meridian-desktop/ui/src/api/{work-scope,project-work,managed-work}.ts.
 * This module performs no IPC, filesystem access, network or authentication.
 */
import type {RevisionContent} from '../../core/src/types';
import {isWellFormedUnicode} from '../../core/src/unicode';
export interface Scope {type:'project-workspace'|'repository-scope'|'run-state';id:string;workspace_id:string;organization_profile_id:string|null}
export interface RecordKey {record_type:string;id:string;scope:Scope}
export interface Pin {key:RecordKey;revision:string;sha256:string}
export interface ManagedSubject {provider_id:string;workspace_id:string;record_key:RecordKey}
export interface RunRef {provider_id:string;workspace_id:string;run:Pin;specification:Pin;scope_revision:string}
export interface ScopeGoal {source_pin:Pin;goal:string;initial_state:string;target_model:string;constraints:string[];acceptance_criteria:{id:string;statement:string;verification:{method:string;expected_result:string}}[]}
export interface DocumentaryPin {source_id:string;relative_path:string;sha256:string;field_locator:string}
const keyOf=(k:RecordKey)=>JSON.stringify([k.record_type,k.id,k.scope.type,k.scope.id,k.scope.workspace_id,k.scope.organization_profile_id]);
const pinKey=(p:Pin)=>JSON.stringify([keyOf(p.key),p.revision,p.sha256]);
export interface ScopeSource { id: string; reference: string; purpose: string; mutable: boolean; revision: string | null; sha256: string | null; resolution: 'not_checked' }
export interface ScopeNorm { id: string; reference: string; origin: string; revision: string | null; sha256: string | null; applicability_rationale: string; resolution: 'not_checked' }
export interface ScopeResolution {
  applicable_norms: { norm: string; activation_reason: string; source: 'repository' | 'kernel' | 'delivery-adapter'; digest: string; delivery: 'kernel-doc' | 'skill-package' | 'cursor-rule' | 'agents-md-section'; matched_paths?: string[] }[];
  applicable_protocols: { protocol: string; routed_from: string; source: 'kernel' | 'instance' | 'repository'; scope: 'universal' | 'product-domain' | 'repository'; digest?: string; revision?: string }[];
  required_verification: string[]; conflicts: { norms: string[]; reason: string }[];
  unresolved_applicability: { subject: string; reason: string }[]; unresolved_items: { item: string; reason: string }[];
  requires_reresolution: boolean; decomposition_required: boolean; applicable_initiative_protocol: string | null; pre_decomposition_norms: string[];
}
export interface WorkScopeFacts {
  project_id: string; repository_id: string; subject_ref: ManagedSubject; run_ref: RunRef; goal: ScopeGoal;
  task_specification_pin: Pin; context_manifest_pin: Pin;
  authoritative_sources: ScopeSource[]; applicable_norms: ScopeNorm[]; decisions: { id: string; text: string }[];
  declared_scope: { declared_paths: string[]; decision_pin: DocumentaryPin; authority: 'declared_fixture_scope_only' };
  resolution: ScopeResolution;
  coverage: { scope: 'declared_fixture_input_set_only'; internal_pins: 'verified'; external_sources: 'not_checked'; action_readiness: 'not_confirmed' };
}
export interface WorkScopeView { contract: 'meridian-work-scope-view'; contract_version: 1; snapshot_id: string; facts: WorkScopeFacts; ordinary_writer: false; actions_authorized: false }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: unknown, fields: readonly string[]): v is Record<string, unknown> => object(v) && Object.keys(v).length === fields.length && fields.every(k => Object.hasOwn(v, k));
const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).byteLength;
const text = (v: unknown, cap = 4096): v is string => typeof v === 'string' && v.length > 0 && isWellFormedUnicode(v) && new TextEncoder().encode(v).byteLength <= cap && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v);
const id = (v: unknown): v is string => text(v, 256) && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(v);
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const revision = (v: unknown): v is string => typeof v === 'string' && /^[1-9][0-9]{0,19}$/.test(v) && BigInt(v) <= 18446744073709551615n;
const token = (v: unknown): v is string => typeof v === 'string' && /^[\x21-\x7e]{1,128}$/.test(v);
const list = (v: unknown, item: (v: unknown) => boolean, cap = 512): v is unknown[] => Array.isArray(v) && v.length <= cap && v.every(item);
const texts = (v: unknown): v is string[] => list(v, x => text(x));
const nullableText = (v: unknown) => v === null || text(v);
const nullableSha = (v: unknown) => v === null || sha(v);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a, canonical) === JSON.stringify(b, canonical);
function canonical(_: string, value: unknown): unknown { return object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value; }
function pin(v: unknown): v is Pin {
  if (!exact(v, ['key', 'revision', 'sha256']) || !revision(v.revision) || !sha(v.sha256) || !exact(v.key, ['record_type', 'id', 'scope']) || !id(v.key.record_type) || !id(v.key.id)) return false;
  const s = v.key.scope;
  return exact(s, ['type', 'id', 'workspace_id', 'organization_profile_id']) && ['project-workspace', 'repository-scope', 'run-state'].includes(String(s.type)) && id(s.id) && id(s.workspace_id)
    && (s.organization_profile_id === null || s.type === 'project-workspace' && id(s.organization_profile_id)) && (s.type !== 'project-workspace' || s.id === s.workspace_id);
}
function goal(v: unknown): v is ScopeGoal {
  return exact(v, ['source_pin', 'goal', 'initial_state', 'target_model', 'constraints', 'acceptance_criteria']) && pin(v.source_pin) && text(v.goal) && text(v.initial_state) && text(v.target_model) && texts(v.constraints)
    && list(v.acceptance_criteria, c => exact(c, ['id', 'statement', 'verification']) && id(c.id) && text(c.statement) && exact(c.verification, ['method', 'expected_result']) && text(c.verification.method) && text(c.verification.expected_result));
}
export function validScopePath(v: unknown): v is string {
  if (typeof v !== 'string' || !v.length || v.length > 512 || /[^\x20-\x7e]|[A-Z\\:*?"<>|]/.test(v)) return false;
  return v.split('/').every(segment => !!segment && segment !== '.' && segment !== '..' && !/[. ]$/.test(segment) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(segment.split('.')[0]!));
}
export function validScopePaths(v: unknown, cap = 64, nonempty = false): v is string[] { return Array.isArray(v) && v.length <= cap && (!nonempty || v.length > 0) && v.every(validScopePath) && new Set(v).size === v.length; }
function source(v: unknown): boolean { return exact(v, ['id', 'reference', 'purpose', 'mutable', 'revision', 'sha256', 'resolution']) && id(v.id) && text(v.reference) && text(v.purpose) && typeof v.mutable === 'boolean' && nullableText(v.revision) && nullableSha(v.sha256) && v.resolution === 'not_checked'; }
function norm(v: unknown): boolean { return exact(v, ['id', 'reference', 'origin', 'revision', 'sha256', 'applicability_rationale', 'resolution']) && id(v.id) && text(v.reference) && text(v.origin) && nullableText(v.revision) && nullableSha(v.sha256) && text(v.applicability_rationale) && v.resolution === 'not_checked'; }
function resolution(v: unknown): v is ScopeResolution {
  if (!exact(v, ['applicable_norms', 'applicable_protocols', 'required_verification', 'conflicts', 'unresolved_applicability', 'unresolved_items', 'requires_reresolution', 'decomposition_required', 'applicable_initiative_protocol', 'pre_decomposition_norms'])) return false;
  return list(v.applicable_norms, n => {
    if (!object(n) || !exact(n, ['norm', 'activation_reason', 'source', 'digest', 'delivery', ...(Object.hasOwn(n, 'matched_paths') ? ['matched_paths'] : [])])) return false;
    return text(n.norm) && text(n.activation_reason) && ['repository', 'kernel', 'delivery-adapter'].includes(String(n.source)) && sha(n.digest) && ['kernel-doc', 'skill-package', 'cursor-rule', 'agents-md-section'].includes(String(n.delivery))
      && (n.activation_reason === 'path-glob' ? texts(n.matched_paths) && n.matched_paths.length > 0 && new Set(n.matched_paths).size === n.matched_paths.length : !Object.hasOwn(n, 'matched_paths'));
  }) && list(v.applicable_protocols, p => object(p) && exact(p, ['protocol', 'routed_from', 'source', 'scope', ...(Object.hasOwn(p, 'digest') ? ['digest'] : []), ...(Object.hasOwn(p, 'revision') ? ['revision'] : [])]) && text(p.protocol)
    && ['change', 'assessment', 'operation', 'initiative', 'BUGFIX', 'FEATURE', 'BEHAVIOR_CHANGE', 'REFACTOR'].includes(String(p.routed_from)) && ['kernel', 'instance', 'repository'].includes(String(p.source)) && ['universal', 'product-domain', 'repository'].includes(String(p.scope))
    && (Object.hasOwn(p, 'digest') || Object.hasOwn(p, 'revision')) && (!Object.hasOwn(p, 'digest') || sha(p.digest)) && (!Object.hasOwn(p, 'revision') || typeof p.revision === 'string' && /^[0-9a-f]{7,40}$/.test(p.revision)))
    && texts(v.required_verification) && list(v.conflicts, c => exact(c, ['norms', 'reason']) && texts(c.norms) && c.norms.length >= 2 && text(c.reason))
    && list(v.unresolved_applicability, u => exact(u, ['subject', 'reason']) && text(u.subject) && text(u.reason)) && list(v.unresolved_items, u => exact(u, ['item', 'reason']) && text(u.item) && text(u.reason))
    && typeof v.requires_reresolution === 'boolean' && typeof v.decomposition_required === 'boolean' && nullableText(v.applicable_initiative_protocol) && texts(v.pre_decomposition_norms);
}
export function validWorkScopeView(v: unknown): v is WorkScopeView {
  if (!exact(v, ['contract', 'contract_version', 'snapshot_id', 'facts', 'ordinary_writer', 'actions_authorized']) || v.contract !== 'meridian-work-scope-view' || v.contract_version !== 1 || !token(v.snapshot_id) || v.ordinary_writer !== false || v.actions_authorized !== false || bytes(v) > 524288) return false;
  const f = v.facts;
  if (!exact(f, ['project_id', 'repository_id', 'subject_ref', 'run_ref', 'goal', 'task_specification_pin', 'context_manifest_pin', 'authoritative_sources', 'applicable_norms', 'decisions', 'declared_scope', 'resolution', 'coverage']) || !text(f.project_id, 256) || !text(f.repository_id, 256)
    || !goal(f.goal) || !pin(f.task_specification_pin) || !pin(f.context_manifest_pin) || !list(f.authoritative_sources, source) || !list(f.applicable_norms, norm) || !list(f.decisions, d => exact(d, ['id', 'text']) && id(d.id) && text(d.text)) || !resolution(f.resolution)) return false;
  for (const entries of [f.authoritative_sources, f.applicable_norms, f.decisions]) if (new Set(entries.map(entry => (entry as { id: string }).id)).size !== entries.length) return false;
  if (!validSelection(f.subject_ref,f.run_ref)) return false;
  // The pair validator checks both values; TS can narrow only its subject parameter.
  const selected={subject_ref:f.subject_ref,selected_run_ref:f.run_ref as RunRef},run=selected.selected_run_ref;
  if (keyOf(f.task_specification_pin.key) !== keyOf(selected.subject_ref.record_key) || pinKey(f.task_specification_pin) !== pinKey(run.specification) || pinKey(f.goal.source_pin) !== pinKey(run.specification)
    || f.context_manifest_pin.key.record_type !== 'context-manifest' || f.context_manifest_pin.key.scope.type !== 'run-state' || f.context_manifest_pin.key.scope.id !== run.run.key.id || f.context_manifest_pin.key.scope.workspace_id !== run.workspace_id) return false;
  const d = f.declared_scope;
  if (!exact(d, ['declared_paths', 'decision_pin', 'authority']) || !validScopePaths(d.declared_paths, 128, true) || d.authority !== 'declared_fixture_scope_only' || !exact(d.decision_pin, ['source_id', 'relative_path', 'sha256', 'field_locator']) || !id(d.decision_pin.source_id) || !validScopePath(d.decision_pin.relative_path) || !sha(d.decision_pin.sha256) || !text(d.decision_pin.field_locator)) return false;
  const c = f.coverage;
  return exact(c, ['scope', 'internal_pins', 'external_sources', 'action_readiness']) && c.scope === 'declared_fixture_input_set_only' && c.internal_pins === 'verified' && c.external_sources === 'not_checked' && c.action_readiness === 'not_confirmed';
}


const identifier=(v:unknown):v is string=>text(v,256)&&/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,255}$/.test(v);
function validKey(v:unknown):v is RecordKey {
 return exact(v,['record_type','id','scope'])&&id(v.record_type)&&id(v.id)
  &&exact(v.scope,['type','id','workspace_id','organization_profile_id'])
  &&['project-workspace','repository-scope','run-state'].includes(String(v.scope.type))&&id(v.scope.id)&&identifier(v.scope.workspace_id)
  &&(v.scope.type==='project-workspace'?v.scope.id===v.scope.workspace_id&&(v.scope.organization_profile_id===null||id(v.scope.organization_profile_id)):v.scope.organization_profile_id===null);
}
function validSelection(subject:unknown,run:unknown):subject is ManagedSubject {
 if(!exact(subject,['provider_id','workspace_id','record_key'])||!identifier(subject.provider_id)||!identifier(subject.workspace_id)||!validKey(subject.record_key)
  ||subject.record_key.record_type!=='task-specification'||!['project-workspace','repository-scope'].includes(subject.record_key.scope.type)||subject.record_key.scope.workspace_id!==subject.workspace_id)return false;
 if(!exact(run,['provider_id','workspace_id','run','specification','scope_revision'])||run.provider_id!==subject.provider_id||run.workspace_id!==subject.workspace_id||!revision(run.scope_revision)||!pin(run.run)||!pin(run.specification))return false;
 return validKey(run.run.key)&&run.run.key.scope.workspace_id===subject.workspace_id&&run.run.key.record_type==='execution-run'&&run.run.key.scope.type==='run-state'&&run.run.key.scope.id===run.run.key.id
  &&validKey(run.specification.key)&&keyOf(run.specification.key)===keyOf(subject.record_key);
}
export class MeridianContextError extends Error {
 readonly code='VALIDATION_ERROR';
 constructor(message='Файл не соответствует закрытому контракту Meridian work-scope v1.'){super(message);this.name='MeridianContextError';}
}
function invalid(message?:string):never {throw new MeridianContextError(message);}
/** Reject duplicate object keys after unescaping, before JSON.parse discards them.
 * JSON.parse separately validates the grammar; this scanner only walks that grammar.
 */
function checkJsonKeys(raw:string):void {
 let i=0;
 const whitespace=()=>{while(i<raw.length&&/\s/.test(raw[i]))i++;};
 const string=():string=>{
  const start=i++;while(i<raw.length){const c=raw[i++];if(c==='"')return JSON.parse(raw.slice(start,i));if(c==='\\')i++;}
  return invalid('Незавершённая строка JSON.');
 };
 const value=(depth:number):void=>{
  if(depth>64)invalid('Слишком глубокий JSON.');whitespace();
  if(raw[i]==='{'){
   i++;whitespace();const keys=new Set<string>();if(raw[i]==='}'){i++;return;}
   while(i<raw.length){whitespace();if(raw[i]!=='"')invalid();const key=string();if(keys.has(key))invalid('Повторяющееся поле JSON.');keys.add(key);whitespace();if(raw[i++]!==':')invalid();value(depth+1);whitespace();const c=raw[i++];if(c==='}')return;if(c!==',')invalid();}invalid();
  }else if(raw[i]==='['){
   i++;whitespace();if(raw[i]===']'){i++;return;}while(i<raw.length){value(depth+1);whitespace();const c=raw[i++];if(c===']')return;if(c!==',')invalid();}invalid();
  }else if(raw[i]==='"'){string();}
  else {const start=i;while(i<raw.length&&!/[\s,}\]]/.test(raw[i]))i++;if(i===start)invalid();}
 };
 value(0);whitespace();if(i!==raw.length)invalid();
}
export function parseMeridianScope(input:string|Uint8Array):WorkScopeView {
 try{
  if(typeof input!=='string'&&!(input instanceof Uint8Array))invalid();
  if(typeof input==='string'&&!isWellFormedUnicode(input))invalid('Исходный документ содержит некорректную последовательность Unicode.');
  const data=typeof input==='string'?new TextEncoder().encode(input):input;
  if(data.byteLength>524288)invalid('Файл превышает 512 KiB.');
  const raw=typeof input==='string'?input:new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(input);
  checkJsonKeys(raw);const parsed:unknown=JSON.parse(raw);
  if(!validWorkScopeView(parsed))invalid();return parsed;
 }catch(error){if(error instanceof MeridianContextError)throw error;return invalid();}
}
/** Source claims stay attached to provenance; this mapping grants no execution rights. */
export function mapMeridianExpectation(view:WorkScopeView):RevisionContent {
 if(!validWorkScopeView(view))invalid();
 const f=view.facts;
 const content:RevisionContent={
  title:`Meridian · ${f.subject_ref.record_key.id}`,goal:f.goal.goal,
  dod:f.goal.acceptance_criteria.map(c=>({id:`meridian:${c.id}`,text:`${c.statement}\nПроверка: ${c.verification.method}\nОжидаемый результат: ${c.verification.expected_result}`,required:true})),
  constraints:f.goal.constraints.join('\n'),assumptions:'Подлинность импортированного документа независимо не проверена.',
  risks:[...f.resolution.conflicts.map(c=>c.reason),...f.resolution.unresolved_items.map(u=>u.reason),...f.resolution.unresolved_applicability.map(u=>u.reason),...(f.resolution.requires_reresolution?['Источник требует повторного определения применимости.']:[]),...(f.resolution.decomposition_required?['Источник требует декомпозиции.']:[])].join('\n'),
  inputs:[`Проект: ${f.project_id}; репозиторий: ${f.repository_id}; workspace: ${f.subject_ref.workspace_id}`,`Run: ${f.run_ref.run.key.id} @${f.run_ref.run.revision}`,`Исходное состояние: ${f.goal.initial_state}`,`Целевая модель: ${f.goal.target_model}`,...f.authoritative_sources.map(s=>`Источник ${s.id}: ${s.reference} — ${s.purpose} [${s.resolution}]`),...f.applicable_norms.map(n=>`Норма ${n.id}: ${n.reference} — ${n.applicability_rationale} [${n.resolution}]`),...f.decisions.map(d=>`Решение ${d.id}: ${d.text}`),`Объявленные пути (данные): ${f.declared_scope.declared_paths.join(', ')}`,...f.resolution.required_verification.map(v=>`Заявленная проверка (не выполнялась): ${v}`)].join('\n'),
  comment:'Черновик из импортированного Meridian work-scope v1; активация отдельно.',
 };
 if(!content.dod.length)invalid('Документ корректен, но не содержит критериев приёмки для черновика спеки. Подготовьте контекст с DoD.');
 if(content.dod.length>50||new Set(content.dod.map(c=>c.id)).size!==content.dod.length||Object.values(content).some(v=>typeof v==='string'&&v.length>20000)||content.dod.some(c=>c.text.length>20000))invalid('Документ корректен, но автоматическое ожидание превышает ограничения спеки. Сначала подготовьте меньший контекст.');
 return content;
}
