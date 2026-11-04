"use client";

import {WorkspaceAccordion} from '@/components/workspace-ui';
import {AppSelect} from '@/components/app-select';
import { projectFetch } from '@/lib/client-project';
import {twMerge} from 'tailwind-merge';
import {humanShell} from './human-view/shell-presentation';
import {humanElements} from './human-view/element-presentation';
import {humanRoadmap} from './human-view/roadmap-presentation';
import {humanSpec} from './human-view/spec-presentation';
import {humanContext,humanRequestKinds} from './human-view/context-presentation';
import {humanHistory,humanMethodology} from './human-view/history-presentation';
import {humanModal} from './human-view/modal-presentation';
import {humanDecision} from './human-view/decision-presentation';

import packageInfo from '../package.json';
import Link from 'next/link';
import OuroLogo from '@/components/ouro-logo';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  BarChart3,
  Bot,
  Box,
  Check,
  CircleDot,
  Clock3,
  Code2,
  Columns2,
  FileText,
  GitBranch,
  History,
  Layers3,
  LayoutGrid,
  List,
  LoaderCircle,
  Menu,
  MessageCircle,
  Moon,
  Network,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Split,
  Sun,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import Roadmap, { specLabels, Status } from "@/components/roadmap";
import { RealityGraph } from "@/components/reality";
import AgentsPanel, { type AgentRegistration } from "@/components/agents-panel";
import GitHubPanel from '@/components/github-panel';
import MeridianPanel,{type MeridianPendingIntent} from '@/components/meridian-panel';
import MeridianOrigin from '@/components/meridian-origin';
import LessonsPanel from '@/components/lessons-panel';
import ImpactPanel from '@/components/impact-panel';
import ParticipantsPanel,{ParticipantLogin} from '@/components/participants-panel';
import { AccountLogout, EmailLogin, ProjectMembersPanel, ProjectSwitcher, selectProject, selectedProjectId } from '@/components/project-account';
import type { ProjectRole } from '@ouro/protocol/http';
import CollaborativeDraftsPanel from '@/components/collaborative-drafts';
import AgentProposalsPanel,{type ProposalReviewIntentRegistry} from '@/components/agent-proposals-panel';
import SpecFlow from "@/components/spec-flow";
import {FlowTrackingChoice,flowTrackingUnavailable} from '@/components/flow-runtime-panel';
import {runtimeEventNames,type FlowRuntimeCommand,type FlowCommandOutcome,type RuntimeIntentRegistry} from '@/components/flow-runtime-ui';
import { StateTransitions } from "@/components/state-transitions";
import HistoricalPanel from "@/components/historical-panel";
import {useProjectSession} from '@/components/project-session-provider';
import {createIdentityReadController} from '@/packages/client/src/lifecycle/create-identity-read-controller';
import {useIdentitySessionRead} from '@/packages/frontend/src/api/catalog-reads';
import {WorkspacePendingList,readWorkspaceJSON} from '@/components/workspace-client';
import {freezeProjectCommandIntent} from '@/packages/client/src/ports';
import {planProjectCommandDispatch} from '@/packages/client/src/http/project-command-dispatch';
import {getWorkspaceIntents,forgetRejectedWorkspaceIntent} from '@/packages/client/src/http/workspace-intents';
import { getRoadmapFilterOptions, matchesRoadmapFilter } from '@/packages/core/src/roadmap-filter';
import { currentDecisionRequests, decisionRoot, isCurrentDecisionRequest, openPhysicalBlockers } from '@/packages/core/src/decision-lineage';
import {
  AGENT_ID,
  type DecisionRequest,
  type ProjectState,
  type DomainEvent,
  type Spec,
  type SpecRevision,
  type FlowDefinition,
  type Actor,
} from "@/packages/core/src";

type View = "roadmap" | "specs" | "decisions" | "history" | "methodology" | "agents" | "integrations" | "lessons" | "impact" | "participants" | "drafts" | "proposals";
type Modal = "create" | "revision" | "accept" | "dependency" | null;
type Payload = Record<string, unknown>;
const kinds: Record<string, string> = {
  Question: "Вопрос",
  Fork: "Развилка",
  Blocker: "Блокер",
};
const eventLabels: Record<string, string> = {
  ProjectInitialized: "Проект создан",
  ExecutionCreated: "Попытка разрешена человеком",
  ResumeAuthorized: "Продолжение разрешено человеком",
  StopRequested: "Остановка запрошена",
  ExecutionPaused: "Остановка подтверждена",
  ExecutionCancelled: "Попытка отменена",
  SpecInvalidated: "Спецификация неактуальна",
  DecisionSuperseded: "Запрос замещён новой ревизией",
  SpecCreated: "Создана спецификация",
  SpecRevisionProposed: "Предложена ревизия",
  RevisionProposed: "Предложена ревизия",
  SpecRevisionActivated: "Активирована ревизия",
  RevisionActivated: "Активирована ревизия",
  ExecutionStarted: "Начата попытка",
  ExecutionQueued: "Попытка поставлена в очередь",
  ActionReported: "Действие агента",
  QuestionReported: "Агент задал вопрос",
  ForkReported: "Агент предложил варианты",
  BlockerReported: "Агент сообщил о блокере",
  DecisionRequested: "Запрос решения",
  DecisionResolved: "Решение человека записано",
  DecisionDeferred: "Решение отложено",
  DecisionWithdrawn: "Запрос отозван автором",
  DecisionClarificationRequested: "Человек запросил уточнение",
  DecisionClarificationSubmitted: "Агент представил уточнение",
  ExecutionOperatorCancelled: "Авторизация отозванного агента отменена",
  ExternalStopAttested: "Оператор засвидетельствовал внешнюю остановку",
  BlockerApplicabilityEnded: "Применимость прежнего блокера завершена",
  ExecutionResumeAuthorized: "Продолжение разрешено",
  ExecutionResumed: "Продолжение подтверждено",
  DecisionApplied: "Применение подтверждено",
  ExecutionCompleted: "Попытка завершена",
  SpecAccepted: "DoD принят человеком",
  DependencyAdded: "Добавлена зависимость",
  BlockerCleared: "Устранение блокера подтверждено",
  RemediationAuthorized: "Разрешено устранение блокера",
  LessonCreated: "Создан черновик урока",
  LessonRevisionProposed: "Предложена редакция урока",
  LessonPublished: "Опубликован урок",
  GitHubBindingCreated: "GitHub привязан к попытке",
  GitHubBindingRevoked: "Привязка GitHub отозвана",
  AgentProposalSubmitted:'Агент предложил сводку или спеку',AgentProposalRevisionSubmitted:'Агент уточнил предложение',AgentProposalReviewed:'Сводка рассмотрена человеком',AgentProposalDismissed:'Предложение отклонено',AgentProposalAdopted:'Из предложения создан черновик',
  ...runtimeEventNames,
};
function shortDate(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function RequestIcon({ kind, size = 16 }: { kind: string; size?: number }) {
  return kind === "Fork" ? (
    <Split size={size} />
  ) : kind === "Blocker" ? (
    <TriangleAlert size={size} />
  ) : (
    <MessageCircle size={size} />
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty-state">
      <p>{children}</p>
    </div>
  );
}

export default function Home() {
  const [agents, setAgents] = useState<AgentRegistration[]>([]);
  const [identity,setIdentity]=useState<Actor|null>(null),[sharedPending,setSharedPending]=useState(false);
  const [identityReads]=useState(createIdentityReadController),[accessEpoch,setAccessEpoch]=useState(0);
  const {read:readIdentity,scope:identityScope,readAccountProjects}=useIdentitySessionRead();
  const [hasAccount,setHasAccount]=useState(false),[identityUnavailable,setIdentityUnavailable]=useState(false);
  const readScope=identityScope({accessEpoch,actorId:identity?.id??null,projectId:selectedProjectId()});
  const owner=useProjectSession(identity?{projectId:selectedProjectId(),actorId:identity.id,accessEpoch}:undefined,'legacy');
  const state=owner.snapshot?.state??null,storage=owner.snapshot?.storage??'',cursor=owner.snapshot?.cursor??0;
  const [flowTrackingSelections,setFlowTrackingSelections]=useState<Record<string,boolean>>({});
  const flowRuntimeIntents=useRef<RuntimeIntentRegistry>(new Map());
  const [projectRole,setProjectRole]=useState<ProjectRole|null>(null);
  const canWrite=projectRole==='Owner'||projectRole==='Contributor';
  // Pending requests remain keyed to their original author. Another identity
  // cannot see or resend them; returning to that author can recover the receipt.
  useEffect(()=>{setFlowTrackingSelections({});},[identity?.id]);
  useEffect(()=>{
    const warn=(event:BeforeUnloadEvent)=>{if(flowRuntimeIntents.current.size){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[]);
  const [assignmentAgentId, setAssignmentAgentId] = useState(AGENT_ID);
  const streamStatus=owner.view.status;
  const [agentFilter,setAgentFilter] = useState(''),[requestFilter,setRequestFilter] = useState('');
  const [flowRevisionId, setFlowRevisionId] = useState<string | null>(null);
  const [integrationSource,setIntegrationSource]=useState<'github'|'meridian'>('github');
  const [proposalIntents]=useState<ProposalReviewIntentRegistry>(()=>new Map());
  const [proposalFocus,setProposalFocus]=useState<{proposalId:string;proposalRevisionId:string}|undefined>();
  const [view, setView] = useState<View>("roadmap"),
    [selected, setSelected] = useState<string | null>(null),
    [requestId, setRequestId] = useState<string | null>(null);
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [graphView, setGraphView] = useState(true),
    [layoutKey, setLayoutKey] = useState(0);
  const [authLoading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [localError, setError] = useState(""),
    [toast, setToast] = useState("");
  const error=localError||owner.view.error?.message||'',loading=authLoading||!!identity&&!state&&!owner.view.error;
  const [theme, setTheme] = useState<'light'|'dark'>("dark"),
    [mobileNav, setMobileNav] = useState(false),
    [modal, setModal] = useState<Modal>(null),
    [detailTab, setDetailTab] = useState("expectation"),
    [realityView, setRealityView] = useState<"history" | "graph">("history");
  const [historicalCursor,setHistoricalCursor]=useState<number|null>(null);
  const [historicalInput,setHistoricalInput]=useState('');
  const historicalCursorRef=useRef<number|null>(null);
  const returnToLive=()=>{historicalCursorRef.current=null;setHistoricalCursor(null);};
  const hasInitialSelection = useRef(false);
  const pendingRef = useRef(false);
  useEffect(()=>{setBusy(false);pendingRef.current=false;},[owner.session]);
  // An uncertain import belongs to the authenticated human and project. The raw
  // source remains in this page's RAM across panel/history navigation only.
  const meridianParticipantKey=identity?.id??'unauthenticated';
  const meridianPendingIntent=useRef<MeridianPendingIntent|null>(null);
  useEffect(()=>{
    const saved=meridianPendingIntent.current;
    if(saved&&identity&&state&&(saved.participantKey!==identity.id||saved.projectId!==state.projectId))meridianPendingIntent.current=null;
  },[identity?.id,state?.projectId]);
  useEffect(()=>{
    const guard=(event:BeforeUnloadEvent)=>{
      if(!meridianPendingIntent.current)return;
      event.preventDefault();event.returnValue='';
    };
    window.addEventListener('beforeunload',guard);
    return()=>window.removeEventListener('beforeunload',guard);
  },[]);
  const adoptSnapshot=useCallback((value:unknown)=>{
    const result=owner.session?.admit(value);
    if(!result||result.status==='invalid')throw new Error('Невозможно подтвердить историю проекта.');
    return result.snapshot;
  },[owner.session]);
  const refresh=useCallback(async()=>{
    await owner.session?.refresh(false);
    const adopted=owner.session?.getSnapshot();if(!adopted)throw new Error('Состояние проекта не подтверждено.');
    if(!hasInitialSelection.current){setSelected(adopted.state.specs[0]?.id??null);hasInitialSelection.current=true;}
    return adopted;
  },[owner.session]);
  const adoptMutation=async(data:unknown)=>{adoptSnapshot(data);if((data as {replayed?:boolean})?.replayed)await refresh();};
  useEffect(()=>{if(!state||hasInitialSelection.current)return;setSelected(state.specs[0]?.id??null);hasInitialSelection.current=true;},[state]);
  const refreshIdentity=useCallback(async()=>{
    const ticket=identityReads.begin();if(!ticket)return;
    setAccessEpoch(ticket.accessEpoch);setIdentity(null);setHasAccount(false);setIdentityUnavailable(false);setProjectRole(null);setAgents([]);setLoading(true);setError('');
    const outcome=await ticket.run(async signal=>{
      const result=await readIdentity({accessEpoch:ticket.accessEpoch,projectId:selectedProjectId()},signal);
      if(result.status==='unsupported')return result;
      const session=result.value,actor=session.actor;
      let role:ProjectRole|null=actor&&session.canManageParticipants?'Owner':actor?'Contributor':null,fallbackProjectId:string|null=null;
      if(session.hasAccount&&actor){
        const projects=await readAccountProjects(identityScope({accessEpoch:ticket.accessEpoch,actorId:actor.id,projectId:selectedProjectId()}),signal);
        if(projects.status==='unsupported')return projects;
        const selectedId=selectedProjectId(),current=projects.value.find(project=>project.id===selectedId);
        if(!current&&projects.value[0])fallbackProjectId=projects.value[0].id;
        role=current?.role??null;
      }
      const agents=await readWorkspaceJSON<{agents:AgentRegistration[]}>('/api/agents?projectId='+encodeURIComponent(selectedProjectId()),signal).then(value=>value.agents).catch(()=>[]);
      return {status:'available' as const,actor,role,agents,fallbackProjectId,hasAccount:session.hasAccount};
    });
    if(outcome.status==='superseded')return;
    if(outcome.status==='accepted'){
      if(outcome.value.status==='unsupported'){setIdentityUnavailable(true);setError('Чтение сессии или каталога недоступно в этом окружении.');}
      else{if(outcome.value.fallbackProjectId){selectProject(outcome.value.fallbackProjectId);return;}
      setIdentity(outcome.value.actor);setHasAccount(outcome.value.hasAccount);setProjectRole(outcome.value.role);setAgents(outcome.value.agents);}
    }else setError(outcome.error instanceof Error?outcome.error.message:'Не удалось проверить сессию.');
    setLoading(false);
  },[identityReads,readIdentity,identityScope,readAccountProjects]);
  useEffect(()=>{identityReads.mount();void refreshIdentity();return()=>identityReads.unmount();},[identityReads,refreshIdentity]);
  useEffect(() => {
    const saved = localStorage.getItem("ouro-theme");
    if (saved === "light") setTheme(saved);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("ouro-theme", theme);
  }, [theme]);
  useEffect(()=>{
    if(loading)return;let live=true;
    const timer=setInterval(()=>{void projectFetch('/api/agents',{cache:'no-store'}).then(async response=>{if(response.ok){const data=await response.json();if(live)setAgents(data.agents);}}).catch(()=>{});},8000);
    return()=>{live=false;clearInterval(timer);};
  },[loading]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const command = async (
    payload: Payload,
    notice = "Изменение записано в историю",
    expectedVersionOverride?: number,
    onCommitted?: (events:DomainEvent[])=>void,
    onOutcome?: (outcome:Omit<FlowCommandOutcome,'ok'>)=>void,
  ) => {
    if(!canWrite){setError('Роль Viewer разрешает только чтение проекта.');return false;}
    if(historicalCursorRef.current!==null){setError('Историческое состояние доступно только для чтения. Вернитесь к текущей работе.');return false;}
    const session=owner.session;
    if (!state || busy || !owner.view.active || !session) return false;
    setBusy(true);
    pendingRef.current = true;
    setError("");
    try {
      const expectedVersion=expectedVersionOverride??session.getSnapshot()?.cursor??state.version,requestId=typeof payload.requestId==='string'?payload.requestId:crypto.randomUUID(),body={...payload,expectedVersion,requestId};
      const intent=freezeProjectCommandIntent({scope:session.scope,operation:'execute-command',expectedVersion,requestId,body:JSON.stringify(body)});
      const dispatch=planProjectCommandDispatch(session.getView().active?session.scope:undefined,intent,getWorkspaceIntents(session.scope.projectId,session.scope.actorId));
      if(!dispatch.allowed)return false;
      dispatch.rejected.forEach(forgetRejectedWorkspaceIntent);
      const outcome=await owner.execute(body);
      if(!owner.session?.getView().active)return false;
      onOutcome?.(outcome.status==='confirmed'?{status:200}:outcome.status==='rejected'?{status:outcome.httpStatus,code:outcome.code}:{});
      if(outcome.status!=='confirmed')throw new Error(outcome.status==='rejected'?outcome.message:'Исход действия неизвестен. Сохранён исходный запрос для точного повтора.');
      onCommitted?.([...outcome.receipt.events]);
      setToast(notice);
      return true;
    } catch (e) {
      if(owner.session?.getView().active)setError((e as Error).message);
      return false;
    } finally {
      if(owner.session?.getView().active){setBusy(false);pendingRef.current = false;}
    }
  };
  const runFlowCommand:FlowRuntimeCommand=async(payload,expectedVersion)=>{
    if(!identity||identity.kind!=='human')return {ok:false,status:401,code:'UNAUTHENTICATED'};
    let outcome:Omit<FlowCommandOutcome,'ok'>={};
    const ok=await command(payload,'Действие процесса записано',expectedVersion,undefined,value=>{outcome=value;});
    return {ok,...outcome};
  };
  const simulateFlowCommand:FlowRuntimeCommand=async(payload,expectedVersion)=>{
    if(historicalCursorRef.current!==null||!state||busy)return {ok:false};
    if(!identity||!['local-human','human-token'].includes(identity.id))return {ok:false,status:403,code:'FORBIDDEN'};
    setBusy(true);pendingRef.current=true;setError('');
    let outcome:Omit<FlowCommandOutcome,'ok'>={};
    try{
      const response=await projectFetch('/api/simulator',{method:'POST',headers:{'Content-Type':'application/json','X-Ouro-Expected-Participant':identity.id},body:JSON.stringify({...payload,requestId:typeof payload.requestId==='string'?payload.requestId:crypto.randomUUID(),expectedVersion})});
      const data=await response.json();outcome={status:response.status,...(typeof data.error?.code==='string'?{code:data.error.code}:{})};
      if(!response.ok){if(data.state)adoptSnapshot(data);else await refresh();setError(`${data.error?.code??'ERROR'}: ${data.error?.message??'Учебное действие не записано.'}`);return {ok:false,...outcome};}
      await adoptMutation(data);setToast('Учебный симулятор записал явно синтетический факт процесса');return {ok:true,...outcome};
    }catch{setError('Результат учебного действия не подтверждён. Сохраните прежний запрос для повтора.');return {ok:false,...outcome};}
    finally{setBusy(false);pendingRef.current=false;}
  };
  const saveFlow = async (flow: FlowDefinition, base: {revisionId:string;expectedVersion:number}) => {
    const original=state?.revisions.find(r=>r.id===base.revisionId);
    const owner=state?.specs.find(s=>s.id===original?.specId);
    if(!original || !owner || owner.revisionIds.at(-1)!==original.id){
      setError('У спеки появилась другая ревизия. Черновик схемы сохранён в редакторе; проверьте новое ожидание перед продолжением.');
      return false;
    }
    const {title,goal,dod,constraints,assumptions,risks,inputs,comment}=original;
    return command({type:'proposeRevision',specId:original.specId,content:{title,goal,dod,constraints,assumptions,risks,inputs,comment,flow}},'Новая ревизия со схемой предложена. Активация выполняется отдельно.',base.expectedVersion);
  };
  const simulate = async (scenario: string) => {
    if(!canWrite){setError('Роль Viewer разрешает только чтение проекта.');return;}
    if(historicalCursorRef.current!==null){setError('Историческое состояние доступно только для чтения.');return;}
    if (!state || !selected || busy) return;
    const target=state.executions.filter(e=>e.specId===selected&&!['succeeded','failed','cancelled','skipped'].includes(e.state)).at(-1);
    if(target?.agentId!==AGENT_ID){setError('Подтверждение назначенного MCP-агента поступает через его подключение. Симулятор не управляет этой попыткой.');return;}
    setBusy(true);
    pendingRef.current = true;
    setError("");
    try {
      const r = await projectFetch("/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario,
          specId: selected,
          expectedVersion: state.version,
          requestId: crypto.randomUUID(),
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        await refresh();
        throw new Error(
          `${data.error?.code ?? "ERROR"}: ${data.error?.message ?? "Сценарий недоступен"}`,
        );
      }
      await refresh();
      setToast("Симулятор добавил подтверждённые демо-события");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      pendingRef.current = false;
    }
  };
  const pick = (id: string) => {
    setSelected(id);
    setRequestId(null);
  };
  const openSpecProcess = (id: string) => {
    const target = state?.specs.find(spec => spec.id === id);
    if (!target) return;
    pick(id);
    setFlowRevisionId(target.activeRevisionId ?? target.revisionIds.at(-1) ?? null);
    setDetailTab('process');
    setView('specs');
  };
  const openRequest = (r: DecisionRequest) => {
    setSelected(r.specId);
    setRequestId(r.id);
    setView("decisions");
  };
  const navigate = (v: View) => {
    if(view==='drafts'&&v!=='drafts'&&sharedPending){setToast('В общем черновике есть неотправленный текст или неподтверждённая публикация. Синхронизируйте его или экспортируйте перед переходом.');return;}
    if(v==='proposals')setProposalFocus(undefined);
    if (v === "decisions") {
      const first = state?.requests.find((r) => r.state === "pending");
      if (first) {
        setRequestId(first.id);
        setSelected(first.specId);
      }
    }
    setView(v);
    setMobileNav(false);
    setError("");
  };
  const spec = state?.specs.find((s) => s.id === selected),
    revision =
      state?.revisions.find((r) => r.id === spec?.activeRevisionId) ??
      state?.revisions.find((r) => r.specId === selected);
  const selectedOrigin=spec?.origin;
  const originLessonRevision=selectedOrigin?.kind==='lesson'?state?.lessonRevisions.find(item=>item.id===selectedOrigin.lessonRevisionId):undefined;
  const pending = state?.requests.filter((r) => r.state === "pending") ?? [];
  const selectedRequests =
    state?.requests.filter((r) => r.specId === selected) ?? [];
  const currentRequest =
    state?.requests.find((r) => r.id === requestId) ??
    selectedRequests.find((r) => r.state === "pending") ??
    null;
  const executions =
    state?.executions.filter((e) => e.specId === selected) ?? [];
  const execution = executions.at(-1);
  const simulationExecution = executions.filter(e=>!['succeeded','failed','cancelled','skipped'].includes(e.state)).at(-1);
  const simulatorAvailable = canWrite&&simulationExecution?.agentId===AGENT_ID&&!!identity&&['local-human','human-token'].includes(identity.id);
  const selectedAgentName = execution ? execution.agentId===AGENT_ID ? 'Симулятор агента' : agents.find(a=>a.id===execution.agentId)?.name??'Назначенный MCP-агент' : 'MCP и симулятор';
  const assignmentValid=assignmentAgentId===AGENT_ID || agents.some(a=>a.id===assignmentAgentId&&!a.revokedAt);
  const externalStopUnknown=state?.executions.some(e=>e.specId===selected&&e.stopConfirmation==='unknown')??false;
  const trackingKey=`${spec?.id??''}:${spec?.activeRevisionId??''}`;
  const trackingReason=flowTrackingUnavailable(state?.revisions.find(item=>item.id===spec?.activeRevisionId)?.flow);
  const trackingChecked=flowTrackingSelections[trackingKey]??false;
  const setTrackingChecked=(checked:boolean)=>setFlowTrackingSelections(current=>({...current,[trackingKey]:checked}));
  const authorizeAttempt=(notice:string)=>{
    if(!spec?.activeRevisionId)return;
    void command({type:'startExecution',specId:spec.id,specRevisionId:spec.activeRevisionId,agentId:assignmentAgentId,...(trackingChecked&&!trackingReason?{flowTracking:'enforced'}:{})},notice,undefined,()=>setFlowTrackingSelections(current=>({...current,[trackingKey]:false})));
  };
  const visibleSpecs = state?.specs.filter(s=>matchesRoadmapFilter(s,state,{query,status,agentId:agentFilter,requestKind:requestFilter}))??[];
  const filterOptions=state?getRoadmapFilterOptions(state):{agentIds:[],requestKinds:[]};
  const connected=streamStatus==='connected';
  const nav = [
    { id: "roadmap" as View, label: "Дорожная карта", icon: Network },
    { id: "specs" as View, label: "Спецификации", icon: FileText },
    { id: "decisions" as View, label: "Решения", icon: CircleDot },
    { id: "history" as View, label: "История", icon: History },
    { id: "agents" as View, label: "Агенты", icon: Bot },
    { id: 'integrations' as View, label:'Интеграции',icon:GitBranch },
    { id: 'lessons' as View, label:'Уроки',icon:BookOpen },
    { id: 'impact' as View, label:'Показатели',icon:BarChart3 },
    { id: 'drafts' as View,label:'Черновики',icon:FileText },
    { id: 'participants' as View,label:'Участники',icon:ShieldCheck },
    {id:'proposals' as View,label:'Предложения агента',icon:Bot},
  ];
  const exportHistory = () => {
    if (!state) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            format: "ouro-export",
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            projectId: state.projectId,
            events: state.events,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ouro-history-v${state.version}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`${humanShell.root} ${historicalCursor!==null?'historical-preview':''}`}>
      <aside className={twMerge(humanShell.sidebar,mobileNav?humanShell.sidebarOpen:'')}>
        <Link className={humanShell.brand} href="/projects" aria-label="Ouro — проекты">
          <OuroLogo size={28}/>
          <span>
            ouro<span className={humanShell.brandDot}>.</span>
          </span>
          <span className={humanShell.alpha}>{packageInfo.version.split('-')[1]?.split('.')[0].toUpperCase()??'RELEASE'}</span>
        </Link>
        <ProjectSwitcher identity={identity} hasAccount={hasAccount} readScope={readScope}/>
        <div className={humanShell.navigationLabel}>ПРОЕКТ</div>
        <nav className={humanShell.navigation} aria-label="Основная навигация">
          <a className={humanShell.navigationItem} href="/projects"><Box size={18}/><span>Проекты</span></a>
          {nav.map((item) => (
            <button
              className={twMerge(humanShell.navigationItem,view===item.id?humanShell.navigationActive:'')}
              key={item.id}
              disabled={historicalCursor!==null}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.id === "decisions" && pending.length > 0 && (
                <span className={humanShell.count}>{pending.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className={humanShell.bottom}>
          <button
            className={twMerge(humanShell.navigationItem,humanShell.navigationFooter,view==='methodology'?humanShell.navigationActive:'')}
            disabled={historicalCursor!==null}
            onClick={() => navigate("methodology")}
          >
            <BookOpen size={18} />
            Методология и источники
          </button>
          <div className={humanShell.session} role="status" aria-label="Текущая сессия">
            <span className="avatar">ВЫ</span>
            <div>
              <strong className={humanShell.sessionName}>{identity?.name??'Вход не выполнен'}</strong>
              <small className={humanShell.sessionDescription}>{identity?`${projectRole??'Проверяем роль'} · ${['local-human','human-token'].includes(identity.id)?'Локальный оператор':'Участник проекта'}`:'Нужна сессия человека'}</small>
            </div>
            {identity&&!['local-human','human-token'].includes(identity.id)&&<AccountLogout identity={identity}/>}
            <ShieldCheck size={15} />
          </div>
        </div>
      </aside>
      <div className={humanShell.main}>
        <header className={humanShell.topbar}>
          <div className={humanShell.topbarLeft}>
            <button
              className={twMerge(humanShell.icon,humanShell.mobileMenu)}
              aria-label="Открыть меню"
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu size={19} />
            </button>
            <Link className={humanShell.projectCrumb} href="/projects">Проекты</Link>
            <span className={humanShell.slash}>/</span>
            <span className={humanShell.currentProject}>
              <Box className={humanShell.currentProjectIcon} size={15} />
              {state?.roadmap.title ?? 'Ouro'}
            </span>
            <span className={humanShell.projectTag}>Human View</span>
          </div>
          <div className={humanShell.topbarActions}>
            <span className={humanShell.demo}>
              <span className={humanShell.dot} />
              {selectedAgentName}
            </span>
            <button
              className={twMerge(humanShell.icon,humanShell.topbarIcon)}
              title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
              aria-label={
                theme === "dark"
                  ? "Включить светлую тему"
                  : "Включить тёмную тему"
              }
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <a
              href="https://github.com/QahNaaRlN/ouro"
              className={twMerge(humanShell.icon,humanShell.topbarIcon,humanShell.repositoryLink)}
              target="_blank"
              rel="noreferrer"
              aria-label="Открыть репозиторий"
            >
              <Code2 size={18} />
            </a>
          </div>
        </header>
        {error && (
          <div className={humanShell.error} role="alert">
            <TriangleAlert className={humanShell.errorIcon} size={16} />
            <span>{error}</span>
            <button className={humanShell.errorClose} aria-label="Закрыть сообщение" onClick={() => setError("")}>
              <X size={15} />
            </button>
          </div>
        )}
        {identity&&<WorkspacePendingList projectId={selectedProjectId()} actorId={identity.id} onRecovered={refresh} onReceipt={value=>{adoptSnapshot(value);}}/>}
        {toast && (
          <div className={humanShell.toast} role="status">
            <Check className={humanShell.toastIcon} size={16} />
            {toast}
          </div>
        )}
        {projectRole==='Viewer'&&state&&<div className={humanShell.toast} role="status"><ShieldCheck className={humanShell.toastIcon} size={16}/>Роль Viewer: проект доступен только для чтения.</div>}
        {loading ? (
          <main className={humanShell.loading}>
            <LoaderCircle className="spin" size={25} />
            <h1 className={humanShell.loadingHeading}>Открываем рабочее место</h1>
            <p className={humanShell.loadingCopy}>Восстанавливаем состояние из истории событий…</p>
          </main>
        ) : !state ? (
          <main className={humanShell.loading}>
            <TriangleAlert size={30} />
            <h1 className={humanShell.loadingHeading}>Проект недоступен</h1>
            <p className={humanShell.loadingCopy}>{error || "Проверьте запуск сервера и локальную сессию."}</p>
            {!identityUnavailable&&<EmailLogin/>}
            {!identityUnavailable&&<WorkspaceAccordion defaultOpen title={<>Вход по прежнему ключу участника</>}><ParticipantLogin/></WorkspaceAccordion>}
            <button className="btn" onClick={() => void refreshIdentity()}>
              Повторить
            </button>
          </main>
        ) : (
          <div className={humanShell.body}>
            <main className={twMerge(`${humanShell.content} view-${view}`,historicalCursor!==null?humanShell.historicalContent:'')}>
              {historicalCursor!==null?<HistoricalPanel latest={state} cursor={historicalCursor} onReturn={returnToLive}/>:<>
              {view === "roadmap" && (
                <>
                  <div className={humanElements.pageHeading}>
                    <div>
                      <h1 className={humanElements.pageTitle}>
                        Дорожная карта{" "}
                        <span className={humanElements.count}>
                          {state.specs.length}
                        </span>
                      </h1>
                      <p className={humanElements.pageDescription}>
                        {state.roadmap.goal ||
                          "От замысла до подтверждённого результата — с решениями человека."}
                      </p>
                    </div>
                    <button
                      className={twMerge('btn btn-primary',humanElements.pageAction)}
                      disabled={!canWrite} onClick={() => setModal("create")}
                    >
                      <Plus className={humanElements.pageActionIcon} size={16} />
                      Новая спека
                    </button>
                  </div>
                  <div className={humanRoadmap.metrics}>
                    <div className={humanRoadmap.metric}>
                      <span className={twMerge(humanRoadmap.metricDot,humanRoadmap.running)} />
                      <strong className={humanRoadmap.metricValue}>
                        {
                          state.specs.filter((s) => s.state === "in_progress")
                            .length
                        }
                      </strong>
                      <span className={humanRoadmap.firstMetricLabel}>в работе</span>
                    </div>
                    <div className={humanRoadmap.metric}>
                      <span className={twMerge(humanRoadmap.metricDot,humanRoadmap.attention)} />
                      <strong className={humanRoadmap.metricValue}>{pending.length}</strong>
                      <span>ждут решения</span>
                    </div>
                    <div className={humanRoadmap.metric}>
                      <span className={twMerge(humanRoadmap.metricDot,humanRoadmap.done)} />
                      <strong className={humanRoadmap.metricValue}>
                        {state.specs.filter((s) => s.state === "done").length}
                        <small className={humanRoadmap.metricTotal}> / {state.specs.length}</small>
                      </strong>
                      <span>принято по DoD</span>
                    </div>
                    <span className={humanRoadmap.divider} />
                    <span className={humanRoadmap.state}>
                      <span className={twMerge(humanShell.dot,humanRoadmap.stateDot)} />
                      {state.roadmap.state === "active"
                        ? "Активная карта"
                        : state.roadmap.state}
                    </span>
                  </div>
                  <div className={humanRoadmap.toolbar}>
                    <div
                      className={humanRoadmap.segmented}
                      aria-label="Представление дорожной карты"
                    >
                      <button
                        className={twMerge(humanRoadmap.segment,graphView?humanRoadmap.segmentSelected:'')}
                        onClick={() => setGraphView(true)}
                      >
                        <Network size={15} />
                        Граф
                      </button>
                      <button
                        className={twMerge(humanRoadmap.segment,!graphView?humanRoadmap.segmentSelected:'')}
                        onClick={() => setGraphView(false)}
                      >
                        <List size={15} />
                        Таблица
                      </button>
                    </div>
                    <div className={humanRoadmap.toolbarRight}>
                      <div className={humanRoadmap.search}>
                        <Search size={14} />
                        <input
                          className={humanRoadmap.searchInput}
                          aria-label="Поиск спецификаций"
                          placeholder="Найти спеку…"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </div>
                      <AppSelect
                        aria-label="Фильтр по статусу"
                        className="filter-select h-[34px] max-w-[143px] border-ouro-border px-[5px] py-[4px] text-[12px] [@media(max-width:1250px)]:max-w-[118px] [@media(max-width:900px)]:w-[114px] [@media(max-width:680px)]:max-w-[120px] [@media(max-width:680px)]:w-[120px]"
                        value={status}
                        onValueChange={(value) => setStatus(value)}
                      >
                        <option value="">Все статусы</option>
                        {Object.entries(specLabels).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </AppSelect>
                      <AppSelect aria-label="Фильтр по агенту" className="filter-select h-[34px] max-w-[143px] border-ouro-border px-[5px] py-[4px] text-[12px] [@media(max-width:1250px)]:max-w-[118px] [@media(max-width:900px)]:w-[114px] [@media(max-width:680px)]:max-w-[120px] [@media(max-width:680px)]:w-[120px]" value={agentFilter} onValueChange={(value) =>setAgentFilter(value)}>
                        <option value="">Все агенты</option>{[...new Set([...filterOptions.agentIds,...(agentFilter?[agentFilter]:[])])].map(id=><option key={id} value={id}>{id===AGENT_ID?'Симулятор агента':`${agents.find(a=>a.id===id)?.name??id.slice(0,8)}${agents.find(a=>a.id===id)?.revokedAt?' · ключ отозван':''}`}</option>)}
                      </AppSelect>
                      <AppSelect aria-label="Фильтр по открытому запросу" className="filter-select h-[34px] max-w-[143px] border-ouro-border px-[5px] py-[4px] text-[12px] [@media(max-width:1250px)]:max-w-[118px] [@media(max-width:900px)]:w-[114px] [@media(max-width:680px)]:max-w-[120px] [@media(max-width:680px)]:w-[120px]" value={requestFilter} onValueChange={(value) =>setRequestFilter(value)}>
                        <option value="">Все открытые запросы</option>{Object.entries(kinds).map(([kind,label])=><option key={kind} value={kind}>{label}</option>)}
                      </AppSelect>
                      <button
                        className={twMerge(humanShell.icon,humanRoadmap.toolbarIcon)}
                        title="Новая зависимость"
                        aria-label="Добавить зависимость"
                        disabled={!canWrite}
                        onClick={() => setModal("dependency")}
                      >
                        <GitBranch size={17} />
                      </button>
                      <button
                        className={twMerge(humanShell.icon,humanRoadmap.toolbarIcon)}
                        title="Пересчитать расположение графа"
                        aria-label="Пересчитать расположение графа"
                        onClick={() => setLayoutKey((k) => k + 1)}
                      >
                        <LayoutGrid size={17} />
                      </button>
                    </div>
                  </div>
                  <div
                    className={graphView?humanRoadmap.graph:humanRoadmap.tableSurface}
                  >
                    {graphView ? (
                      <Roadmap
                        state={state}
                        selected={selected}
                        onSelect={openSpecProcess}
                        query={query}
                        status={status}
                        layoutKey={layoutKey}
                        visibleIds={visibleSpecs.map(s=>s.id)}
                      />
                    ) : (
                      <SpecTable
                        specs={visibleSpecs}
                        state={state}
                        selected={selected}
                        onSelect={openSpecProcess}
                      />
                    )}
                  </div>
                  {selected&&!visibleSpecs.some(s=>s.id===selected)&&<p className="helper-note" role="status">Выбранная спека вне фильтра. Выбор и контекст сохранены.</p>}
                  <div className={humanRoadmap.canvasBottom}>
                    <span className={humanRoadmap.legend}>
                      <span className={humanRoadmap.legendLine} />
                      Обязательная зависимость
                    </span>
                    <span className={humanRoadmap.canvasExplanation}>Положение узла не определяет порядок исполнения</span>
                  </div>
                  {spec && (
                    <div className={humanRoadmap.selection}>
                      <div className={humanRoadmap.selectionText}>
                        <span className={humanRoadmap.selectionId}>{spec.humanId}</span>
                        <strong className={humanRoadmap.selectionTitle}>{spec.title}</strong>
                      </div>
                      <button
                        className={twMerge('text-btn',humanRoadmap.selectionAction)}
                        onClick={() => openSpecProcess(spec.id)}
                      >
                        Открыть процесс
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  )}
                </>
              )}
              {view === "specs" && (
                <>
                  <div className="page-heading compact">
                    <div>
                      <h1>Спецификация</h1>
                      <p>Ожидание версионируется. Факты сохраняются.</p>
                    </div>
                    <button className="btn" disabled={!canWrite} onClick={() => setModal("create")}>
                      <Plus size={16} />
                      Новая спека
                    </button>
                  </div>
                  <div className={humanSpec.picker}>
                    <AppSelect className="w-full border-ouro-border bg-ouro-subtle p-[10px] text-[12px]"
                      aria-label="Выбрать спецификацию"
                      value={selected ?? ""}
                      onValueChange={(value) => pick(value)}
                    >
                      {state.specs.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.humanId} — {s.title}
                        </option>
                      ))}
                    </AppSelect>
                  </div>
                  {spec && revision ? (
                    <>
                      <div className={humanSpec.titleRow}>
                        <div>
                          <span className="mono eyebrow">{spec.humanId}</span>
                          <h2 className={humanSpec.title}>{spec.title}</h2>
                        </div>
                        <Status state={spec.state} />
                      </div>
                      <div className={humanSpec.metadata}>
                        <span>
                          Ревизия <strong className={humanSpec.revisionNumber}>{revision.revision}</strong>
                        </span>
                        <span className={`mono ${humanSpec.id}`} title={spec.id}>
                          Agent ID · {spec.id}
                        </span>
                      </div>
                      <div className={humanSpec.tabs}>
                        <button
                          className={twMerge(humanSpec.tab,detailTab==='expectation'?humanSpec.tabSelected:'')}
                          onClick={() => setDetailTab("expectation")}
                        >
                          <FileText className={humanSpec.tabIcon} size={15} />
                          Ожидание
                        </button>
                        <button
                          className={twMerge(humanSpec.tab,detailTab==='process'?humanSpec.tabSelected:'')}
                          onClick={()=>{if(!state.revisions.some(r=>r.id===flowRevisionId&&r.specId===spec.id))setFlowRevisionId(spec.revisionIds.at(-1)??revision.id);setDetailTab('process');}}
                        >
                          <GitBranch className={humanSpec.tabIcon} size={15}/>Процесс
                        </button>
                        <button className={twMerge(humanSpec.tab,detailTab==='states'?humanSpec.tabSelected:'')} onClick={()=>setDetailTab('states')}>
                          <Network className={humanSpec.tabIcon} size={15}/>Состояния
                        </button>
                        <button
                          className={twMerge(humanSpec.tab,detailTab==='compare'?humanSpec.tabSelected:'')}
                          onClick={() => setDetailTab("compare")}
                        >
                          <Columns2 className={humanSpec.tabIcon} size={15} />
                          Сопоставление
                        </button>
                        <button
                          className={twMerge(humanSpec.tab,detailTab==='reality'?humanSpec.tabSelected:'')}
                          onClick={() => setDetailTab("reality")}
                        >
                          <History className={humanSpec.tabIcon} size={15} />
                          Реальность
                          <span className={humanSpec.tabCount}>
                            {
                              state.events.filter((e) => e.specId === selected)
                                .length
                            }
                          </span>
                        </button>
                        <button
                          className={twMerge(humanSpec.tab,detailTab==='revisions'?humanSpec.tabSelected:'')}
                          onClick={() => setDetailTab("revisions")}
                        >
                          <Layers3 className={humanSpec.tabIcon} size={15} />
                          Ревизии<span className={humanSpec.tabCount}>{spec.revisionIds.length}</span>
                        </button>
                      </div>
                      {detailTab==='process' && (()=>{
                        const shown=state.revisions.find(r=>r.id===flowRevisionId&&r.specId===spec.id)??state.revisions.find(r=>r.id===spec.revisionIds.at(-1))??revision;
                        return <>
                          <div className={humanSpec.toolbar}>
                            <label className={humanElements.formLabel}>Ревизия схемы<AppSelect className="w-full font-normal max-w-full p-[8px] text-[12px]" aria-label="Ревизия схемы" value={shown.id} onValueChange={(value) =>setFlowRevisionId(value)}>{state.revisions.filter(r=>r.specId===spec.id).toReversed().map(r=><option key={r.id} value={r.id}>r{r.revision} · {r.id===spec.activeRevisionId?'активная':r.id===spec.revisionIds.at(-1)?'предложена':'историческая'}</option>)}</AppSelect></label>
                            {shown.id!==spec.activeRevisionId&&shown.id===spec.revisionIds.at(-1)&&<button className="btn" disabled={!canWrite||busy} onClick={()=>command({type:'activateRevision',specId:spec.id,revisionId:shown.id},'Ревизия схемы активирована. История прежних попыток сохранена.')}><Check size={14}/>Активировать ревизию {shown.revision}</button>}
                          </div>
                          <SpecFlow key={shown.id} revision={shown} state={state} busy={busy} readOnly={!canWrite} onSave={saveFlow} actorId={identity?.id??'unauthenticated'} intents={flowRuntimeIntents.current} onCommand={runFlowCommand} onSimulateFlow={identity&&['local-human','human-token'].includes(identity.id)?simulateFlowCommand:undefined}/>
                        </>;
                      })()}
                      {detailTab==='states'&&<StateTransitions state={state} specId={spec.id} executionId={execution?.id}/>}
                      {detailTab === "expectation" && (
                        <div className={humanSpec.expectation}>
                          <MeridianOrigin spec={spec} state={state}/>
                          {spec.origin?.kind==='lesson'&&<section className={`${humanSpec.section} small-section`} aria-label="Происхождение спеки">
                            <h3 className={humanSpec.smallHeading}>Происхождение спеки</h3>
                            {originLessonRevision?<><p className={humanSpec.smallCopy}>Урок «{originLessonRevision.title}» · r{originLessonRevision.revision}</p><p className={humanSpec.smallCopy}>Спека создана из этой опубликованной редакции. Новые публикации урока не меняют её источник.</p></>:<p className={humanSpec.smallCopy}>Редакция урока-источника недоступна в текущем снимке.</p>}
                          </section>}
                          {spec.origin?.kind==='agent_proposal'&&(()=>{const origin=spec.origin,proposal=state.agentProposals.find(p=>p.id===origin.proposalId),source=state.agentProposalRevisions.find(r=>r.id===origin.proposalRevisionId);return <section className={humanSpec.section} aria-label="Происхождение предложения агента"><div className="section-heading"><h3>Происхождение</h3><span className="quiet-label">ПРЕДЛОЖЕНИЕ АГЕНТА · v{source?.revision??'?'}</span></div><p>{source?.content.title} · {proposal?.agentId}</p><p className="helper-note">Исходная интерпретация сохранена. Человек создал и отредактировал это ожидание; активация отдельно.</p><button className="text-btn" onClick={()=>{setProposalFocus({proposalId:origin.proposalId,proposalRevisionId:origin.proposalRevisionId});setView('proposals');}}>Прочитать предложение и источники<ArrowRight size={14}/></button></section>;})()}
                          <section className={humanSpec.section}>
                            <div className="section-heading">
                              <h3>Что должно измениться</h3>
                              <span className="quiet-label">
                                {spec.activeRevisionId
                                  ? "АКТИВНОЕ ОЖИДАНИЕ"
                                  : "ПРОЕКТ РЕВИЗИИ"}
                              </span>
                            </div>
                            <p className={humanSpec.goal}>{revision.goal}</p>
                          </section>
                          <section className={humanSpec.section}>
                            <div className="section-heading">
                              <h3>Definition of Done</h3>
                              <span className="quiet-label">
                                {revision.dod.length} КРИТЕРИЯ
                              </span>
                            </div>
                            <div className={humanSpec.criteria}>
                              {revision.dod.map((c, i) => (
                                <div className={humanSpec.criterion} key={c.id}>
                                  <span
                                    className={twMerge(humanSpec.criterionNumber,spec.acceptance?humanSpec.criterionChecked:'')}
                                  >
                                    {spec.acceptance ? (
                                      <Check size={13} />
                                    ) : (
                                      String(i + 1).padStart(2, "0")
                                    )}
                                  </span>
                                  <div>
                                    <p className={humanSpec.criterionCopy}>{c.text}</p>
                                    {spec.acceptance?.evidence[c.id] && (
                                      <small className={humanSpec.criterionEvidence}>
                                        {spec.acceptance.evidence[c.id]}
                                      </small>
                                    )}
                                  </div>
                                  {c.required && (
                                    <span className={humanSpec.criterionRequired}>
                                      обязательный
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </section>
                          {[
                            ["Ограничения", revision.constraints],
                            ["Входные данные", revision.inputs],
                            ["Допущения", revision.assumptions],
                            ["Риски", revision.risks],
                          ]
                            .filter(([, v]) => v)
                            .map(([label, value]) => (
                              <section
                                className={`${humanSpec.section} small-section`}
                                key={label}
                              >
                                <h3 className={humanSpec.smallHeading}>{label}</h3>
                                <p className={humanSpec.smallCopy}>{value}</p>
                              </section>
                            ))}
                          {!spec.activeRevisionId && (
                            <div className={humanSpec.draft}>
                              <p className={humanSpec.draftCopy}>
                                Ревизия ещё не активирована. До активации
                                исполнение недоступно.
                              </p>
                              <button
                                className="btn btn-small"
                                disabled={!canWrite||busy}
                                onClick={() =>
                                  command(
                                    {
                                      type: "activateRevision",
                                      specId: spec.id,
                                      revisionId: revision.id,
                                    },
                                    "Ревизия активирована человеком",
                                  )
                                }
                              >
                                Активировать ревизию {revision.revision}
                              </button>
                            </div>
                          )}
                          <div className={humanSpec.actions}>
                            <button
                              className={twMerge('btn',humanSpec.actionButton)}
                              disabled={!canWrite}
                              onClick={() => setModal("revision")}
                            >
                              <Plus size={15} />
                              Предложить ревизию
                            </button>
                            <button
                              className={twMerge('btn btn-primary',humanSpec.actionButton)}
                              disabled={!canWrite || busy || spec.state === "done"}
                              onClick={() => setModal("accept")}
                            >
                              <ShieldCheck size={15} />
                              Принять по DoD
                            </button>
                          </div>
                          <p className="helper-note">
                            Успех попытки агента не означает приёмку
                            спецификации. Каждый критерий подтверждает человек.
                          </p>
                        </div>
                      )}
                      {detailTab === "compare" && (
                        <div className={humanSpec.comparison}>
                          <section className={humanSpec.comparisonExpectation}>
                            <div className={humanSpec.comparisonHeading}>
                              <FileText size={16} />
                              <h3 className={humanSpec.comparisonTitle}>Ожидание</h3>
                              <span className={humanSpec.comparisonCaption}>Ревизия {revision.revision}</span>
                            </div>
                            <div className={humanSpec.comparisonBlock}>
                              <span className="quiet-label">ЦЕЛЬ</span>
                              <p className={twMerge(humanSpec.goal,humanSpec.comparisonCopy)}>{revision.goal}</p>
                            </div>
                            <div className={humanSpec.comparisonBlock}>
                              <h3 className={humanSpec.comparisonBlockTitle}>Definition of Done</h3>
                              <div className={humanSpec.criteria}>
                                {revision.dod.map((c, i) => (
                                  <div className={twMerge(humanSpec.criterion,humanSpec.comparisonCriterion)} key={c.id}>
                                    <span
                                      className={twMerge(humanSpec.criterionNumber,spec.acceptance?humanSpec.criterionChecked:'')}
                                    >
                                      {spec.acceptance ? (
                                        <Check size={13} />
                                      ) : (
                                        i + 1
                                      )}
                                    </span>
                                    <div>
                                      <p className={twMerge(humanSpec.criterionCopy,humanSpec.comparisonCriterionCopy)}>{c.text}</p>
                                      {spec.acceptance?.evidence[c.id] && (
                                        <small className={humanSpec.criterionEvidence}>
                                          {spec.acceptance.evidence[c.id]}
                                        </small>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            {revision.constraints && (
                              <div className={humanSpec.comparisonBlock}>
                                <h3 className={humanSpec.comparisonBlockTitle}>Ограничения</h3>
                                <p className={humanSpec.comparisonCopy}>{revision.constraints}</p>
                              </div>
                            )}
                            <button
                              className="text-btn"
                              onClick={() => setDetailTab("expectation")}
                            >
                              Открыть полное ожидание
                              <ArrowRight size={14} />
                            </button>
                          </section>
                          <section className={humanSpec.comparisonReality}>
                            <div className={humanSpec.comparisonHeading}>
                              <History size={16} />
                              <h3 className={humanSpec.comparisonTitle}>Реальность</h3>
                              <span className={humanSpec.comparisonCaption}>Только r{revision.revision}</span>
                            </div>
                            {execution &&
                              execution.specRevisionId === revision.id && (
                                <ExecutionPanel
                                  compact
                                  execution={execution}
                                  agents={agents}
                                  version={state.version}
                                  state={state}
                                  requests={selectedRequests.filter(
                                    (r) => r.specRevisionId === revision.id,
                                  )}
                                  busy={busy}
                                  command={command}
                                  readOnly={!canWrite}
                                />
                              )}
                            <Timeline
                              comparison
                              state={{
                                ...state,
                                events: state.events.filter(
                                  (e) => e.specRevisionId === revision.id,
                                ),
                              }}
                              specId={selected}
                            />
                            <button
                              className="text-btn"
                              onClick={() => setDetailTab("reality")}
                            >
                              Открыть историю и причинный граф
                              <ArrowRight size={14} />
                            </button>
                          </section>
                        </div>
                      )}
                      {detailTab === "reality" && (
                        <>
                          <div className={humanSpec.toolbar}>
                            <div className={humanSpec.toolbarGroup}>
                              <h3 className={humanSpec.toolbarHeading}>Управление попыткой</h3>
                              <p className={humanSpec.toolbarCopy}>
                                Выберите исполнителя и разрешите одну попытку.
                                Назначенный агент отдельно подтверждает запуск.
                              </p>
                            </div>
                            {(!execution ||
                              [
                                "succeeded",
                                "failed",
                                "cancelled",
                                "skipped",
                              ].includes(execution.state)) &&
                              spec.activeRevisionId &&
                              spec.state !== "done" && (
                                <div className={twMerge(humanSpec.assignment,humanSpec.toolbarGroup)}>
                                <FlowTrackingChoice checked={trackingChecked} reason={trackingReason} disabled={!canWrite||busy} onChange={setTrackingChecked}/>
                                <AgentPicker agents={agents} value={assignmentAgentId} onChange={setAssignmentAgentId} disabled={!canWrite||busy}/>
                                <button
                                  className="btn btn-small"
                                  disabled={!canWrite || busy || !assignmentValid || externalStopUnknown}
                                  onClick={() =>
                                    authorizeAttempt("Попытка разрешена. Ожидается подтверждение назначенного исполнителя")
                                  }
                                >
                                  <Play size={13} />
                                  Разрешить попытку
                                </button>
                                </div>
                              )}
                            <AppSelect className="max-w-full p-[8px] text-[12px]"
                              aria-label="Симулятор в контексте спецификации"
                              value=""
                              disabled={busy || !simulatorAvailable}
                              onValueChange={(value) => {
                                if (value)
                                  void simulate(value);
                              }}
                            >
                              <option disabled value="">
                                Сценарий симулятора…
                              </option>
                              <option value="apply">
                                Подтвердить применение / запуск
                              </option>
                              <option value="action">Сообщить Action</option>
                              <option value="question">Задать Question</option>
                              <option value="fork">Предложить Fork</option>
                              <option value="blocker">Сообщить Blocker</option>
                              <option value="stop">
                                Подтвердить остановку
                              </option>
                              <option value="clear">
                                Подтвердить устранение блокера
                              </option>
                              <option value="complete">
                                Завершить попытку с evidence
                              </option>
                            </AppSelect>
                          </div>
                          <ExecutionPanel
                            execution={execution}
                            agents={agents}
                            version={state.version}
                            state={state}
                            requests={selectedRequests}
                            busy={busy}
                            command={command}
                            readOnly={!canWrite}
                          />
                          <RealitySwitch
                            value={realityView}
                            onChange={setRealityView}
                          />
                          {realityView === "graph" ? (
                            <RealityGraph
                              events={state.events.filter(
                                (e) => e.specId === selected,
                              )}
                            />
                          ) : (
                            <Timeline state={state} specId={selected} />
                          )}
                        </>
                      )}
                      {detailTab === "revisions" && (
                        <div className={humanSpec.revisions}>
                          {state.revisions
                            .filter((r) => r.specId === selected)
                            .toReversed()
                            .map((r) => (
                              <article key={r.id} className={humanSpec.revision}>
                                <div className="section-heading">
                                  <h3>Ревизия {r.revision}</h3>
                                  {r.id === spec.activeRevisionId ? (
                                    <span className="status status-done">
                                      <Check size={13} />
                                      Активная
                                    </span>
                                  ) : (
                                    <button
                                      className="btn btn-small"
                                      disabled={busy}
                                      onClick={() =>
                                        command(
                                          {
                                            type: "activateRevision",
                                            specId: spec.id,
                                            revisionId: r.id,
                                          },
                                          "Ревизия активирована. Старые факты сохранены",
                                        )
                                      }
                                    >
                                      Активировать
                                    </button>
                                  )}
                                </div>
                                <strong className={humanSpec.revisionTitle}>{r.title}</strong>
                                <p className={humanSpec.revisionGoal}>{r.goal}</p>
                                <small className={humanSpec.revisionAuthor}>
                                  {shortDate(r.createdAt)} · {r.authorId}
                                </small>
                                <code className={humanSpec.revisionId}>{r.id}</code>
                              </article>
                            ))}
                          <button
                            className="btn"
                            onClick={() => setModal("revision")}
                          >
                            <Plus size={16} />
                            Предложить новую ревизию
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <Empty>
                      Выберите спецификацию или создайте первую.
                    </Empty>
                  )}
                </>
              )}
              {view === "decisions" && (
                <>
                  <div className="page-heading">
                    <div>
                      <h1>
                        Решения{" "}
                        <span className="heading-count attention-count">
                          {pending.length}
                        </span>
                      </h1>
                      <p>
                        Вопросы, развилки и блокеры требуют явного человеческого
                        решения.
                      </p>
                    </div>
                  </div>
                  <div className={humanDecision.layout}>
                    <div className={humanDecision.list}>
                      {state.requests.length ? (
                        state.requests.toReversed().map((r) => (
                          <button
                            className={twMerge(humanDecision.row,r.id===currentRequest?.id?humanDecision.selected:'')}
                            key={r.id}
                            data-testid={`decision-${r.id}`}
                            onClick={() => {
                              setRequestId(r.id);
                              setSelected(r.specId);
                            }}
                          >
                            <div
                              className={twMerge(humanContext.kind,humanRequestKinds[r.kind])}
                            >
                              <RequestIcon kind={r.kind} />
                              <span>{kinds[r.kind]}</span>
                              <span
                                className={twMerge(humanDecision.dot,r.state==='pending'?humanDecision.pendingDot:'')}
                              />
                            </div>
                            <strong className={humanDecision.rowTitle}>{r.title}</strong>
                            <small className={humanDecision.rowMeta}>
                              {
                                state.specs.find((s) => s.id === r.specId)
                                  ?.humanId
                              }{" "}
                              ·{" "}
                              {r.state === "pending"
                                ? "Нужно решение"
                                : r.state === "resolved"
                                  ? "Решение записано"
                                  : r.state}
                            </small>
                          </button>
                        ))
                      ) : (
                        <Empty>
                          Открытых запросов нет. Запрос появится, когда назначенный агент сообщит вопрос, развилку или блокер.
                        </Empty>
                      )}
                    </div>
                    <div className="decision-detail">
                      {currentRequest ? (
                        <DecisionForm
                          key={currentRequest.id}
                          request={currentRequest}
                          spec={state.specs.find(
                            (s) => s.id === currentRequest.specId,
                          )}
                          busy={busy}
                          command={command}
                          agents={agents}
                          version={state.version}
                          state={state}
                          onOpenRequest={openRequest}
                          readOnly={!canWrite}
                        />
                      ) : (
                        <Empty>
                          Выберите запрос, чтобы увидеть основания и варианты.
                        </Empty>
                      )}
                    </div>
                  </div>
                </>
              )}
              {view === "history" && (
                <>
                  <div className="page-heading">
                    <div>
                      <h1>Факты и решения</h1>
                      <p>
                        Серверный порядок событий · {state.events.length}{" "}
                        записей · cursor {cursor}
                      </p>
                    </div>
                    <button className="btn" onClick={exportHistory}>
                      <ArrowDownToLine size={16} />
                      Экспорт JSON
                    </button>
                  </div>
                  <form className="history-cursor-form" onSubmit={event=>{event.preventDefault();const value=Number(historicalInput);if(historicalInput.trim()===''||!Number.isSafeInteger(value)||value<0||value>state.version){setError(`Cursor должен быть целым числом от 0 до ${state.version}.`);return;}historicalCursorRef.current=value;setHistoricalCursor(value);setModal(null);setError('');}}>
                    <label>Исторический cursor<input type="number" min={0} max={state.version} step={1} required value={historicalInput} onChange={event=>setHistoricalInput(event.target.value)}/></label>
                    <button type="submit" className="btn" disabled={busy}>Открыть состояние на cursor</button>
                    <p>Состояние из сохранённого префикса истории. В просмотре прошлой точки запись недоступна.</p>
                  </form>
                  <div className={humanHistory.filter}>
                    <label className={humanHistory.filterLabel}>
                      Контекст
                      <AppSelect className="mt-[6px] block w-full border-ouro-border p-[8px] text-[12px]"
                        aria-label="Контекст"
                        value={selected ?? ""}
                        onValueChange={(value) => setSelected(value || null)}
                      >
                        <option value="">Весь проект</option>
                        {state.specs.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.humanId} — {s.title}
                          </option>
                        ))}
                      </AppSelect>
                    </label>
                    <button
                      className={twMerge('text-btn',humanHistory.filterAction)}
                      onClick={() => setSelected(null)}
                    >
                      Показать весь проект
                    </button>
                  </div>
                  <RealitySwitch
                    value={realityView}
                    onChange={setRealityView}
                  />
                  {realityView === "graph" ? (
                    <RealityGraph
                      events={state.events.filter(
                        (e) => !selected || e.specId === selected,
                      )}
                    />
                  ) : (
                    <Timeline state={state} specId={selected} expanded />
                  )}
                </>
              )}
              {view === "methodology" && <Methodology />}
              {view === "agents" && <AgentsPanel onAgentsChange={setAgents} readOnly={projectRole!=='Owner'}/>}
              {view==='integrations'&&<>
                <div className="integration-source-switch" role="group" aria-label="Источник интеграции"><button type="button" aria-pressed={integrationSource==='github'} onClick={()=>setIntegrationSource('github')}>GitHub</button><button type="button" aria-pressed={integrationSource==='meridian'} onClick={()=>setIntegrationSource('meridian')}>Meridian</button></div>
                <div hidden={integrationSource!=='github'}><GitHubPanel state={state} onSnapshot={adoptMutation} readOnly={!canWrite}/></div>
                <div hidden={integrationSource!=='meridian'}><MeridianPanel key={`${state.projectId}:${meridianParticipantKey}`} participantKey={meridianParticipantKey} pendingIntent={meridianPendingIntent} theme={theme} state={state} onSnapshot={adoptMutation} readOnly={!canWrite} onOpenSpec={id=>{pick(id);setDetailTab('expectation');setView('specs');}}/></div>
              </>}
              {view==='lessons'&&<LessonsPanel state={state} onSnapshot={adoptMutation} readOnly={!canWrite} onOpenSpec={id=>{pick(id);setView('specs');setDetailTab('expectation');}}/>}
              {view==='impact'&&<ImpactPanel state={state}/>}
              {view==='participants'&&(identity&&!['local-human','human-token'].includes(identity.id)?<ProjectMembersPanel projectId={state.projectId} identity={identity} readScope={{...readScope,projectId:state.projectId}}/>:<ParticipantsPanel/>)}
              {view==='drafts'&&<CollaborativeDraftsPanel state={state} actorId={identity?.id??'local-human'} onSnapshot={adoptMutation} onPendingChange={setSharedPending} readOnly={!canWrite} onOpenSpec={id=>{pick(id);setView('specs');}}/>}
              {view==='proposals'&&<AgentProposalsPanel state={state} actorId={identity?.id??'unauthenticated'} onSnapshot={adoptMutation} intents={proposalIntents} initialSelection={proposalFocus} readOnly={!canWrite} onOpenSpec={id=>{pick(id);setView('specs');setDetailTab('expectation');}}/>}
              </>}
            </main>
            {historicalCursor===null && view !== 'agents' && view!=='integrations' && view!=='lessons' && view!=='impact' && view!=='participants' && view!=='drafts' && view!=='proposals' && <aside className={humanShell.context}>
              <div className={humanContext.heading}>
                <span>Требует внимания</span>
                <span className={humanContext.count}>{pending.length}</span>
                <button
                  className={twMerge(humanShell.icon,humanContext.refresh)}
                  aria-label="Обновить проект"
                  onClick={() => refresh().catch((e) => setError(e.message))}
                >
                  <RefreshCw size={14} />
                </button>
              </div>
              <div className={humanContext.list}>
                {pending.length ? (
                  pending.slice(0, 4).map((r) => (
                    <button
                      className={twMerge(humanContext.card,r.specId===selected?humanContext.selectedCard:'')}
                      key={r.id}
                      onClick={() => openRequest(r)}
                    >
                      <div
                        className={twMerge(humanContext.kind,humanRequestKinds[r.kind])}
                      >
                        <RequestIcon kind={r.kind} />
                        <span>{kinds[r.kind]}</span>
                        <ArrowUpRight className={humanContext.openRequestIcon} size={14} />
                      </div>
                      <strong className={humanContext.cardTitle}>{r.title}</strong>
                      <small className={humanContext.cardMeta}>
                        {state.specs.find((s) => s.id === r.specId)?.humanId}
                        <span className={humanContext.cardMetaLabel}>Решение за вами</span>
                      </small>
                    </button>
                  ))
                ) : (
                  <div className={humanContext.clear}>
                    <ShieldCheck className={humanContext.clearIcon} size={22} />
                    <strong className={humanContext.clearTitle}>Всё разобрано</strong>
                    <p className={humanContext.clearCopy}>Новых запросов человеку нет.</p>
                  </div>
                )}
              </div>
              {spec && (
                <div className={humanContext.selected}>
                  <div className={humanElements.sectionHeading}>
                    <h3 className={humanContext.selectedHeading}>Контекст работы</h3>
                    <FileText size={15} />
                  </div>
                  <span className={humanContext.selectedId}>{spec.humanId}</span>
                  <strong className={humanContext.selectedTitle}>{spec.title}</strong>
                  <Status state={spec.state} />
                  <div className={humanContext.facts}>
                    <div className={humanContext.fact}>
                      <span className={humanContext.factLabel}>Ревизия</span>
                      <strong className={humanContext.factValue}>{revision?.revision ?? "—"}</strong>
                    </div>
                    <div className={humanContext.fact}>
                      <span className={humanContext.factLabel}>Исполнение</span>
                      <strong className={humanContext.factValue}>
                        {execution
                          ? execution.kind === "remediation"
                            ? "Устранение блокера"
                            : "Основная попытка"
                          : "Не начато"}
                      </strong>
                    </div>
                    <div className={humanContext.fact}>
                      <span className={humanContext.factLabel}>Результат принят</span>
                      <strong className={humanContext.factValue}>{spec.acceptance ? "Человеком" : "Нет"}</strong>
                    </div>
                  </div>
                  {(!execution ||
                    ["succeeded", "failed", "cancelled", "skipped"].includes(
                      execution.state,
                    )) &&
                    spec.activeRevisionId &&
                    spec.state !== "done" &&
                    spec.state !== "invalidated" && (
                      <div className={twMerge(humanSpec.assignment,humanSpec.verticalAssignment)}>
                      <FlowTrackingChoice checked={trackingChecked} reason={trackingReason} disabled={!canWrite||busy} onChange={setTrackingChecked}/>
                      <AgentPicker agents={agents} value={assignmentAgentId} onChange={setAssignmentAgentId} disabled={!canWrite||busy}/>
                      <button
                        className={twMerge('btn btn-small btn-full',humanContext.action)}
                        disabled={!canWrite || busy || !assignmentValid || externalStopUnknown}
                        onClick={() =>
                          authorizeAttempt("Попытка разрешена человеком. Ожидается подтверждение назначенного исполнителя")
                        }
                      >
                        <Play size={13} />
                        Разрешить одну попытку
                      </button>
                      </div>
                    )}
                  {execution && (
                    <ExecutionPanel
                      compact
                      context
                      execution={execution}
                      agents={agents}
                      version={state.version}
                      state={state}
                      requests={selectedRequests}
                      busy={busy}
                      command={command}
                      readOnly={!canWrite}
                    />
                  )}
                  <button
                    className={twMerge('btn btn-full',humanContext.action)}
                    onClick={() => setView("specs")}
                  >
                    Открыть ожидание и реальность
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
              <div className={humanContext.simulator}>
                <div className="section-heading">
                  <h3 className={humanContext.simulatorHeading}>
                    <Zap size={15} />
                    Симулятор
                  </h3>
                  <span className={humanContext.badge}>DEMO</span>
                </div>
                <p className={humanContext.simulatorCopy}>{execution?.agentId && execution.agentId!==AGENT_ID ? 'Эта попытка назначена MCP-агенту. Его факты и подтверждения поступают через подключение.' : 'Учебные сценарии работают только для попыток, назначенных симулятору.'}</p>
                <label className={humanContext.simulatorLabel}>
                  Сообщение агента
                  <AppSelect className="mt-[7px] block w-full p-[8px] text-[12px]"
                    aria-label="Сценарий симулятора"
                    value=""
                    disabled={busy || !selected || !simulatorAvailable}
                    onValueChange={(value) => {
                      if (value) void simulate(value);
                    }}
                  >
                    <option value="" disabled>
                      Выбрать сценарий…
                    </option>
                    <option value="action">Сообщить Action</option>
                    <option value="question">Задать Question</option>
                    <option value="fork">Предложить Fork</option>
                    <option value="blocker">Сообщить Blocker</option>
                    <option value="apply">
                      Подтвердить применение / продолжение
                    </option>
                    <option value="stop">Подтвердить остановку</option>
                    <option value="complete">
                      Завершить попытку с evidence
                    </option>
                    <option value="clear">
                      Подтвердить устранение блокера
                    </option>
                  </AppSelect>
                </label>
                <span className={humanContext.simulatorNote}>
                  Action фиксирует факт. Решения остаются за человеком.
                </span>
              </div>
            </aside>}
          </div>
        )}
        <footer className={humanShell.footer}>
          <div className={humanShell.footerGroup} role="status" aria-live="polite">
            <span className={twMerge(humanShell.connection,connected?humanShell.connected:'')} />
            {connected?'Живые обновления подключены':streamStatus==='reload-required'?'История сервера изменилась · требуется проверка и перезагрузка':streamStatus==='connecting'?'Подключаем живые обновления…':'Нет связи · переподключаемся, показаны последние данные'}
            <span className={humanShell.footerSeparator} />
            <span className="mono">cursor {cursor}</span>
          </div>
          <div className={humanShell.footerGroup}>
            <span className={humanShell.footerStorage}>
              {storage === "postgres"
                ? "PostgreSQL"
                : storage
                  ? "PostgreSQL · embedded"
                  : "Хранилище…"}
            </span>
            <span className={twMerge(humanShell.footerSeparator,humanShell.footerStorage)} />
            <span>{packageInfo.version}</span>
          </div>
        </footer>
      </div>
      {modal && state && historicalCursor===null && (
        <ModalDialog
          title={
            modal === "create"
              ? "Новая спецификация"
              : modal === "revision"
                ? "Предложить новую ревизию"
                : modal === "accept"
                  ? "Приёмка по Definition of Done"
                  : "Новая зависимость"
          }
          onClose={() => !busy && setModal(null)}
        >
          {(modal === "create" || modal === "revision") && (
            <SpecForm
              revision={modal === "revision" ? revision : undefined}
              version={state.version}
              busy={busy}
              onSubmit={async (content,base) => {
                let createdId:string|undefined;
                const ok = await command(
                  modal === "create"
                    ? { type: "createSpec", content }
                    : { type: "proposeRevision", specId: base.revision?.specId, content },
                  modal === "create"
                    ? "Спецификация создана"
                    : "Новая ревизия предложена. Активируйте её отдельно",
                  base.expectedVersion,
                  events=>{createdId=(events.find(event=>event.type==='SpecCreated')?.payload.spec as Spec|undefined)?.id;},
                );
                if (ok) {
                  setModal(null);
                  setView("specs");
                  if (modal === "create") {
                    if(createdId)setSelected(createdId);
                  } else setDetailTab("revisions");
                }
              }}
            />
          )}
          {modal === "accept" && spec && revision && (
            <AcceptanceForm
              spec={spec}
              revision={revision}
              version={state.version}
              busy={busy}
              onSubmit={async (evidence,base) => {
                if (
                  await command(
                    {
                      type: "acceptSpec",
                      specId: base.specId,
                      specRevisionId: base.revisionId,
                      evidence,
                    },
                    "DoD принят человеком. Спецификация завершена",
                    base.expectedVersion,
                  )
                )
                  setModal(null);
              }}
            />
          )}
          {modal === "dependency" && (
            <DependencyForm
              specs={state.specs}
              busy={busy}
              onSubmit={async (from, to) => {
                if (
                  await command(
                    {
                      type: "addDependency",
                      from,
                      to,
                      relationship: "depends_on",
                    },
                    "Зависимость добавлена. Циклы проверены",
                  )
                )
                  setModal(null);
              }}
            />
          )}
        </ModalDialog>
      )}
    </div>
  );
}

function SpecTable({
  specs,
  state,
  selected,
  onSelect,
}: {
  specs: Spec[];
  state: ProjectState;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className={humanRoadmap.tableWrap}>
      <table className={humanRoadmap.table}>
        <thead>
          <tr>
            <th className={humanRoadmap.tableHeading}>Спецификация</th>
            <th className={humanRoadmap.tableHeading}>Статус</th>
            <th className={humanRoadmap.tableHeading}>Ревизия</th>
            <th className={humanRoadmap.tableHeading}>Решения</th>
            <th className={humanRoadmap.tableHeading}/>
          </tr>
        </thead>
        <tbody>
          {specs.map((s) => (
            <tr key={s.id} className={twMerge(humanRoadmap.tableRow,s.id===selected?humanRoadmap.tableSelected:'')}>
              <td className={humanRoadmap.tableCell}>
                <button className={humanRoadmap.tableSpec} onClick={() => onSelect(s.id)}>
                  <span className={humanRoadmap.tableSpecId}>{s.humanId}</span>
                  <strong className={humanRoadmap.tableSpecTitle}>{s.title}</strong>
                </button>
              </td>
              <td className={humanRoadmap.tableCell}>
                <Status state={s.state} />
              </td>
              <td className={twMerge('mono',humanRoadmap.tableCell)}>
                r
                {state.revisions.find((r) => r.id === s.activeRevisionId)
                  ?.revision ?? "—"}
              </td>
              <td className={humanRoadmap.tableCell}>
                {state.requests.filter(
                  (r) => r.specId === s.id && r.state === "pending",
                ).length || "—"}
              </td>
              <td className={humanRoadmap.tableCell}>
                <button
                  className={humanShell.icon}
                  onClick={() => onSelect(s.id)}
                  aria-label={`Открыть ${s.humanId}`}
                >
                  <ArrowUpRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!specs.length && (
        <Empty>
          По текущим фильтрам ничего не найдено.
        </Empty>
      )}
    </div>
  );
}

function AgentPicker({agents,value,onChange,disabled=false}:{agents:AgentRegistration[];value:string;onChange:(id:string)=>void;disabled?:boolean}){
  const valid=value===AGENT_ID||agents.some(a=>a.id===value&&!a.revokedAt);
  return <label className={humanSpec.agentPicker}>Исполнитель попытки<AppSelect className="min-h-[36px] w-full max-w-[300px] rounded-[var(--radius)] bg-ouro-bg p-[8px] text-[12px] text-ouro-text [.agent-assignment-vertical_&]:max-w-full" aria-label="Исполнитель попытки" value={valid?value:''} onValueChange={(value) =>onChange(value)} disabled={disabled}><option value="" disabled>Выберите исполнителя</option><option value={AGENT_ID}>Симулятор · учебный режим</option>{agents.filter(a=>!a.revokedAt).map(a=><option value={a.id} key={a.id}>{a.name} · MCP</option>)}</AppSelect></label>;
}

function DecisionForm({
  request: r,
  spec,
  busy,
  command,
  agents,
  version,
  state,
  onOpenRequest,
  readOnly=false,
}: {
  request: DecisionRequest;
  spec?: Spec;
  busy: boolean;
  command: (p: Payload, n?: string, expectedVersion?:number, onCommitted?:(events:DomainEvent[])=>void) => Promise<boolean>;
  agents: AgentRegistration[];
  version:number;
  state:ProjectState;
  onOpenRequest:(request:DecisionRequest)=>void;
  readOnly?:boolean;
}) {
  const [text, setText] = useState(""),
    [option, setOption] = useState(""),
    [mode, setMode] = useState<"decide" | "reject" | "defer">("decide");
  const [remediationAgentId,setRemediationAgentId]=useState(r.agentId);
  const [baseVersion,setBaseVersion]=useState(version);
  const closed=readOnly||r.state!=='pending';
  const remediationValid=remediationAgentId===AGENT_ID||agents.some(a=>a.id===remediationAgentId&&!a.revokedAt);
  const outcome = r.decision?.outcome;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if(closed||busy)return;
    if (mode === "defer") {
      await command(
        {
          type: "deferDecision",
          decisionRequestId: r.id,
          reason: text,
          until: new Date(Date.now() + 86400000).toISOString(),
        },
        "Запрос отложен на сутки. Решение по-прежнему требуется",
        baseVersion,
      );
      return;
    }
    await command(
      {
        type: "resolveDecision",
        decisionRequestId: r.id,
        specRevisionId: r.specRevisionId,
        outcome:
          mode === "reject"
            ? { kind: "reject", reason: text }
            : r.kind === "Question"
              ? { kind: "answer", answer: text }
              : { kind: "approve", chosenOptionId: option },
      },
      "Решение записано. Применение подтверждается отдельно",
      baseVersion,
    );
  };
  return (
    <article className="request-detail">
      <div className={humanDecision.metadata}>
        <span className={twMerge(humanContext.kind,humanRequestKinds[r.kind])}>
          <RequestIcon kind={r.kind} />
          {kinds[r.kind]}
        </span>
        <Status state={r.state} />
      </div>
      <span className={twMerge('mono eyebrow',humanDecision.eyebrow)}>{spec?.humanId}</span>
      <h2 className={humanDecision.title}>{r.title}</h2>
      <div className={humanDecision.context}>
        <span className="quiet-label">КОНТЕКСТ</span>
        <p className={twMerge(humanDecision.copy,humanDecision.contextCopy)}>{r.context}</p>
      </div>
      {r.question && (
        <section className={humanDecision.section}>
          <h3 className={humanDecision.sectionTitle}>Вопрос агента</h3>
          <p className={humanDecision.copy}>{r.question}</p>
        </section>
      )}
      {r.reason && (
        <section className={humanDecision.section}>
          <h3 className={humanDecision.sectionTitle}>Основание</h3>
          <p className={humanDecision.copy}>{r.reason}</p>
        </section>
      )}
      {r.kind === "Blocker" && (
        <div className={humanDecision.blocker}>
          <div className={humanDecision.blockerFact}>
            <span className={humanDecision.blockerLabel}>Ожидалось</span>
            <p className={twMerge(humanDecision.copy,humanDecision.blockerCopy)}>{r.expected}</p>
          </div>
          <div className={humanDecision.blockerFact}>
            <span className={humanDecision.blockerLabel}>Наблюдается</span>
            <p className={twMerge(humanDecision.copy,humanDecision.blockerCopy)}>{r.actual}</p>
          </div>
          <p className={humanDecision.blockerImpact}>Влияние: {r.impact}</p>
        </div>
      )}
      {(r.state === 'pending'||text.length>0||option.length>0) && (
        <form onSubmit={submit}>
          {r.state!=='pending'&&<p className="helper-note">Запрос уже закрыт. Ваш введённый текст сохранён для сравнения; повторная запись недоступна.</p>}
          {readOnly&&r.state==='pending'&&<p className="helper-note">Роль Viewer разрешает читать запрос и его источники. Ответ может записать Owner или Contributor.</p>}
          {!closed&&version!==baseVersion&&<p className="helper-note">Проект изменился после начала ответа. <button type="button" className="text-btn" onClick={()=>setBaseVersion(version)}>Обновить версию после проверки</button></p>}
          <div className={humanDecision.modes}>
            <button
              type="button"
              disabled={closed||busy}
              className={twMerge(humanDecision.mode,mode==='decide'?humanDecision.modeSelected:'')}
              onClick={() => {
                setMode("decide");
                setText("");
              }}
            >
              {r.kind === "Question" ? "Ответить" : "Выбрать путь"}
            </button>
            <button
              type="button"
              disabled={closed||busy}
              className={twMerge(humanDecision.mode,mode==='reject'?humanDecision.modeSelected:'')}
              onClick={() => {
                setMode("reject");
                setText("");
              }}
            >
              Отклонить
            </button>
            <button
              type="button"
              disabled={closed||busy}
              className={twMerge(humanDecision.mode,mode==='defer'?humanDecision.modeSelected:'')}
              onClick={() => {
                setMode("defer");
                setText("");
              }}
            >
              Отложить
            </button>
          </div>
          {mode === "decide" && r.kind !== "Question" && (
            <fieldset className={humanDecision.options}>
              <legend className={humanDecision.optionsTitle}>
                {r.kind === "Blocker" ? "План устранения" : "Варианты решения"}
              </legend>
              {r.options.map((o) => (
                <label
                  className={twMerge(humanDecision.option,option===o.id?humanDecision.optionSelected:'')}
                  key={o.id}
                >
                  <input className={humanDecision.optionInput}
                    type="radio"
                    disabled={closed||busy}
                    name="decision-option"
                    value={o.id}
                    checked={option === o.id}
                    onChange={() => setOption(o.id)}
                    required
                  />
                  <div>
                    <strong className={humanDecision.optionTitle}>{o.title}</strong>
                    <p className={humanDecision.optionCopy}>{o.description}</p>
                    {r.recommendationOptionId === o.id && (
                      <small className={humanDecision.recommendation}>Рекомендация агента</small>
                    )}
                  </div>
                </label>
              ))}
              {r.options.length === 0 && (
                <p className={twMerge(humanDecision.copy,humanElements.inlineWarning)}>
                  Путь устранения пока неизвестен: {r.noPathReason}. Нужен
                  уточняющий запрос; одобрение без плана недоступно.
                </p>
              )}
            </fieldset>
          )}
          {(mode !== "decide" || r.kind === "Question") && (
            <label className={humanElements.formLabel}>
              {mode === "reject"
                ? "Причина отклонения"
                : mode === "defer"
                  ? "Почему откладываем на сутки"
                  : "Ваш ответ"}
              <textarea className={humanElements.field}
                readOnly={closed}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  mode === "decide"
                    ? "Дайте агенту конкретный ответ…"
                    : "Укажите причину…"
                }
                rows={5}
                required
                minLength={1}
              />
            </label>
          )}
          <div className={humanDecision.warning}>
            <ShieldCheck className={humanDecision.warningIcon} size={16} />
            <p className={humanDecision.warningCopy}>
              {mode === "defer"
                ? "Отсрочка не закрывает запрос и не разрешает продолжение."
                : r.kind === "Blocker"
                  ? "Одобрение разрешает план устранения. Сам блокер остаётся до отдельного подтверждения с evidence."
                  : "Решение будет записано в историю. Продолжение и его применение подтверждаются отдельно."}
            </p>
          </div>
          <button
            className={`btn ${mode === "reject" ? "btn-danger" : "btn-primary"}`}
            disabled={
              busy ||
              closed ||
              (mode === "decide" && r.kind !== "Question" && !option) ||
              ((mode !== "decide" || r.kind === "Question") && !text.trim())
            }
            type="submit"
          >
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : mode === "defer" ? (
              <Clock3 size={15} />
            ) : (
              <Check size={15} />
            )}{" "}
            {mode === "reject"
              ? "Отклонить с причиной"
              : mode === "defer"
                ? "Отложить на сутки"
                : r.kind === "Question"
                  ? "Записать ответ"
                  : r.kind === "Blocker"
                    ? "Разрешить план"
                    : "Зафиксировать выбор"}
          </button>
        </form>
      )}
      {r.state!=='pending' && (
        <div className={humanDecision.recorded}>
          <div className="section-heading">
            <h3 className={humanDecision.recordedTitle}>Решение человека</h3>
            <ShieldCheck className={humanDecision.recordedIcon} size={17} />
          </div>
          <p>
            {outcome?.kind === "answer"
              ? outcome.answer
              : outcome?.kind === "approve"
                ? `Выбран путь: ${r.options.find((o) => o.id === outcome.chosenOptionId)?.title ?? outcome.chosenOptionId}`
                : outcome?.kind === "reject"
                  ? `Отклонено: ${outcome.reason}`
                  : "Запрос закрыт без решения"}
          </p>
          {r.decision && (
            <small className={humanDecision.recordedMeta}>
              {shortDate(r.decision.at)} · {r.decision.actorId}
            </small>
          )}
          {r.decision&&<div className={humanDecision.application}>
            {!isCurrentDecisionRequest(state,r)?<>Историческое решение · применение не разрешено</>:r.decision.appliedAt ? (
              <>
                <Check size={15} />
                Применение подтверждено {shortDate(r.decision.appliedAt)}
              </>
            ) : (
              <>
                <Clock3 size={15} />
                Применение не подтверждено
              </>
            )}
          </div>}
          {r.kind === "Blocker" && (
            <>
              <p className="helper-note">
                {r.clearedEvidence
                  ? `Блокер снят: ${r.clearedEvidence}`
                  : "Одобрение плана не снимает блокер."}
              </p>
              {r.decision?.outcome.kind === "approve" && !r.clearedEvidence && isCurrentDecisionRequest(state,r) && spec?.activeRevisionId===r.specRevisionId && !r.applicabilityEndedEvidence && (
                <div className={twMerge(humanSpec.assignment,humanSpec.verticalAssignment)}>
                <AgentPicker agents={agents} value={remediationAgentId} onChange={setRemediationAgentId} disabled={busy}/>
                <button
                  className={twMerge('btn',humanDecision.recordedAction)}
                  disabled={busy || !remediationValid}
                  onClick={() =>
                    command(
                      {
                        type: "authorizeRemediation",
                        decisionRequestId: r.id,
                        agentId: remediationAgentId,
                      },
                      "Разрешена отдельная попытка устранения блокера",
                    )
                  }
                >
                  Разрешить remediation-попытку
                </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {r.deferredReason && (
        <p className="helper-note">
          Отложено до {shortDate(r.deferredUntil!)}: {r.deferredReason}
        </p>
      )}
      <DecisionMaintenance request={r} state={state} busy={busy||readOnly} command={command} onOpenRequest={onOpenRequest}/>
      <div className={humanDecision.requestId}>
        <span className={humanDecision.idLabel}>Decision Request</span>
        <code className={humanDecision.idValue}>{r.id}</code>
      </div>
    </article>
  );
}

function DecisionMaintenance({request:r,state,busy,command,onOpenRequest}:{request:DecisionRequest;state:ProjectState;busy:boolean;command:(payload:Payload,notice?:string,expectedVersion?:number,onCommitted?:(events:DomainEvent[])=>void)=>Promise<boolean>;onOpenRequest:(request:DecisionRequest)=>void}) {
  const [mode,setMode]=useState<'clarify'|'correct'|'reopen'|'retire'|null>(null),[draft,setDraft]=useState(''),[evidence,setEvidence]=useState(''),[baseVersion,setBaseVersion]=useState(state.version);
  const original=r.supersedesDecisionId?state.requests.find(item=>item.decision?.id===r.supersedesDecisionId):r.supersedesRequestId?state.requests.find(item=>item.id===r.supersedesRequestId):undefined;
  const replacement=state.requests.find(item=>item.supersedesRequestId===r.id||(!!r.decision&&item.supersedesDecisionId===r.decision.id));
  const execution=state.executions.find(item=>item.id===r.executionId),spec=state.specs.find(item=>item.id===r.specId);
  const root=decisionRoot(r),lineage=state.requests.filter(item=>decisionRoot(item)===root);
  const hasRemediation=state.executions.some(item=>lineage.some(request=>request.id===item.remediatesBlockerId));
  const resolvedVersion=state.events.find(event=>event.type==='DecisionResolved'&&event.payload.decisionRequestId===r.id)?.version??0;
  const resultAfterDecision=state.events.some(event=>event.executionId===r.executionId&&(event.type==='ExecutionCompleted'||event.type==='ActionReported'&&event.payload.phase!=='started'&&event.version>resolvedVersion));
  const canCorrect=r.state==='resolved'&&!!r.decision&&!r.decision.appliedAt&&isCurrentDecisionRequest(state,r)&&!!execution&&!['succeeded','failed','cancelled','skipped'].includes(execution.state)&&spec?.activeRevisionId===r.specRevisionId&&spec.state!=='done'&&spec.state!=='invalidated'&&!spec.acceptance&&!hasRemediation&&!resultAfterDecision;
  const clarifications=state.events.filter(event=>event.type==='DecisionClarificationRequested'&&event.payload.decisionRequestId===r.id);
  const openPhysicalBlocker=openPhysicalBlockers(state,r.specId).some(item=>item.id===r.id);
  const priorContextReview=r.state==='resolved'&&!!r.applicabilityEndedEvidence&&r.applicabilityEndedForRevisionId!==spec?.activeRevisionId;
  const allWorkStopped=state.executions.filter(item=>item.specId===r.specId).every(item=>['succeeded','failed','cancelled','skipped'].includes(item.state)&&item.stopConfirmation!=='unknown');
  const canReopen=r.kind==='Blocker'&&(['withdrawn','superseded'].includes(r.state)||priorContextReview)&&openPhysicalBlocker&&spec?.activeRevisionId===r.specRevisionId&&spec.state!=='done'&&spec.state!=='invalidated'&&!!execution&&(!['succeeded','failed','cancelled','skipped'].includes(execution.state)||allWorkStopped);
  const canRetire=r.kind==='Blocker'&&openPhysicalBlocker&&!!spec&&(spec.activeRevisionId!==r.specRevisionId||spec.state==='invalidated')&&allWorkStopped;
  const begin=(value:'clarify'|'correct'|'reopen'|'retire')=>{setMode(value);setDraft('');setEvidence('');setBaseVersion(state.version);};
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(!draft.trim()||!mode||busy)return;
    let created:DecisionRequest|undefined;
    const payload=mode==='clarify'?{type:'requestDecisionClarification',decisionRequestId:r.id,question:draft}:mode==='retire'?{type:'retireHistoricalBlocker',decisionRequestId:r.id,reason:draft,evidence}:{type:mode==='reopen'?'reopenBlockerPlan':'correctDecision',decisionRequestId:r.id,reason:draft};
    if(await command(payload,mode==='clarify'?'Уточнение запрошено. Исходный запрос остаётся открытым.':mode==='retire'?'Применимость прежнего блокера завершена по свидетельству человека. Это не подтверждение его физического устранения.':'Создан связанный запрос. Прежние факты сохранены.',baseVersion,events=>{created=events.find(item=>item.type==='DecisionRequested')?.payload.request as DecisionRequest|undefined;})){
      setMode(null);setDraft('');if(created)onOpenRequest(created);
    }
  };
  return <section className="decision-maintenance" aria-label="История и уточнения решения">
    {original&&<div className="decision-lineage"><strong>{r.supersedesDecisionId?'Исправляет прежнее решение':'Новый запрос плана для прежнего блокера'}</strong><span>{r.correctionReason}</span><p>Прежний ответ: {original.decision?.outcome.kind==='answer'?original.decision.outcome.answer:original.decision?.outcome.kind==='reject'?original.decision.outcome.reason:original.options.find(o=>o.id===(original.decision?.outcome as {chosenOptionId?:string})?.chosenOptionId)?.title??'Решение не было принято'}</p><button type="button" className="text-btn" onClick={()=>onOpenRequest(original)}>Открыть исходный запрос</button></div>}
    {replacement&&<div className="decision-lineage"><strong>Для этого решения создан связанный запрос</strong><p>Прежнее решение сохранено. Его применение больше не разрешено.</p><button type="button" className="text-btn" onClick={()=>onOpenRequest(replacement)}>Открыть связанный запрос</button></div>}
    {r.state==='withdrawn'&&<div className="decision-lineage"><strong>Запрос отозван автором</strong><p>{r.withdrawalReason}</p><p>Отзыв не является решением человека, разрешением продолжения или снятием физического блокера.</p></div>}
    {clarifications.length>0&&<section className="decision-clarification-list" aria-label="Уточнения запроса"><h3>Уточнения запроса</h3>{clarifications.map(source=>{
      const reply=state.events.find(event=>event.type==='DecisionClarificationSubmitted'&&event.payload.clarificationEventId===source.id);
      return <article className="decision-clarification-item" key={source.id}><small>Запрос человека · #{source.version} · {source.actor.name??source.actor.id}</small><p>{String(source.payload.question)}</p>{reply?<><small>Ответ назначенного агента · #{reply.version}</small><p>{String(reply.payload.response)}</p></>:<small>Ожидается уточнение агента. Ответ человека по-прежнему требуется.</small>}<WorkspaceAccordion title={<>Связи с фактами</>}><code>{source.id}</code>{reply&&<p><code>{reply.id}</code> → <code>{String(reply.payload.clarificationEventId)}</code></p>}</WorkspaceAccordion></article>;
    })}</section>}
    {r.applicabilityEndedEvidence&&<div className="decision-lineage"><strong>Применимость прежнего блокера завершена человеком</strong><p>Контекст свидетельства: {r.applicabilityEndedForRevisionId?`r${state.revisions.find(item=>item.id===r.applicabilityEndedForRevisionId)?.revision??'?'}`:'без активной ревизии'}. {openPhysicalBlocker?'В текущем контракте физическое препятствие требует отдельного пересмотра.':'Свидетельство относится к текущему контракту.'}</p><p>{r.applicabilityEndedReason}</p><p>{r.applicabilityEndedEvidence}</p><p>Это свидетельство неприменимости в новом контракте. Физическое устранение этим действием не подтверждено.</p></div>}
    {canReopen&&<button type="button" className="btn" disabled={busy} onClick={()=>begin('reopen')}>Запросить новый план для блокера</button>}
    {canRetire&&<button type="button" className="btn" disabled={busy} onClick={()=>begin('retire')}>Завершить применимость прежнего блокера</button>}
    {r.state==='pending'&&<button type="button" className="btn" disabled={busy} onClick={()=>begin('clarify')}>Запросить уточнение</button>}
    {r.state==='resolved'&&!replacement&&(canCorrect?<button type="button" className="btn" disabled={busy} onClick={()=>begin('correct')}>Исправить отдельным запросом</button>:<p className="helper-note">Для изменения уже применённого решения или завершённой работы предложите новую ревизию или спеку. Прежнее решение и приёмка сохраняются.</p>)}
    {mode&&<form onSubmit={submit}><label className={humanElements.formLabel}>{mode==='clarify'?'Что нужно уточнить':mode==='retire'?'Почему прежний блокер неприменим':mode==='reopen'?'Основание нового плана':'Основание исправления'}<textarea className={humanElements.field} required maxLength={20000} rows={4} value={draft} onChange={event=>setDraft(event.target.value)} readOnly={busy}/></label>{mode==='retire'&&<label className={humanElements.formLabel}>Свидетельство неприменимости<textarea className={humanElements.field} required maxLength={20000} rows={4} value={evidence} onChange={event=>setEvidence(event.target.value)} readOnly={busy}/></label>}<p className="helper-note">{mode==='clarify'?'Уточнение не закрывает запрос и не разрешает действия вне указанного уточнения.':mode==='retire'?'Завершение применимости не утверждает физическое устранение препятствия и не переносит разрешения между ревизиями.':'Новый запрос потребует отдельного решения. Исходный ответ не изменится, исполнение автоматически не продолжится.'}</p>{state.version!==baseVersion&&<p className="helper-note">Проект изменился. <button type="button" className="text-btn" onClick={()=>setBaseVersion(state.version)}>Обновить базу уточнения после проверки</button></p>}<div><button type="submit" className="btn btn-primary" disabled={busy||!draft.trim()||state.version!==baseVersion||(mode==='correct'&&!canCorrect)||(mode==='reopen'&&!canReopen)||(mode==='retire'&&(!evidence.trim()||!canRetire))}>{mode==='clarify'?'Записать запрос уточнения':mode==='retire'?'Записать неприменимость блокера':mode==='reopen'?'Создать новый запрос плана':'Создать связанный запрос'}</button><button type="button" className="text-btn" disabled={busy} onClick={()=>setMode(null)}>Отменить ввод</button></div></form>}
  </section>;
}

function OperatorRecovery({execution:e,revoked,busy,version,command}:{execution:ProjectState['executions'][number];revoked:boolean;busy:boolean;version:number;command:(payload:Payload,notice?:string,expectedVersion?:number)=>Promise<boolean>}) {
  const [mode,setMode]=useState<'cancel'|'attest'|null>(null),[reason,setReason]=useState(''),[evidence,setEvidence]=useState(''),[baseVersion,setBaseVersion]=useState(version);
  const terminal=['succeeded','failed','cancelled','skipped'].includes(e.state);
  if(!revoked&&e.stopConfirmation!=='unknown'&&!e.stopAttestation)return null;
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(!mode||busy||!evidence.trim()||(mode==='cancel'&&!reason.trim()))return;
    const payload=mode==='cancel'?{type:'forceCancelRevokedExecution',executionId:e.id,reason,evidence}:{type:'attestExternalStop',executionId:e.id,evidence};
    if(await command(payload,mode==='cancel'?'Авторизация попытки отменена. Фактическая остановка остаётся неподтверждённой.':'Свидетельство оператора о внешней остановке записано. Новая попытка разрешается отдельно.',baseVersion)){setMode(null);setReason('');setEvidence('');}
  };
  return <section className="operator-recovery" aria-label="Операторское завершение попытки">
    {e.stopConfirmation==='unknown'?<><p className="recovery-unconfirmed">Фактическая остановка не подтверждена</p><p>Авторизация отменена после отзыва ключа. Новая работа в этой спеке запрещена до отдельного свидетельства оператора о внешней остановке.</p>{e.operatorCancellation&&<p>Основание отмены: {e.operatorCancellation.reason}<br/>{e.operatorCancellation.evidence}</p>}{mode!=='attest'&&<button type="button" className="btn btn-small" disabled={busy} onClick={()=>{setMode('attest');setEvidence('');setBaseVersion(version);}}>Подтвердить внешнюю остановку</button>}</>:e.stopAttestation?<><p>Внешняя остановка засвидетельствована оператором</p><p>{e.stopAttestation.evidence}</p><p className="helper-note">Свидетельство: {e.stopAttestation.actorId} · {shortDate(e.stopAttestation.at)}. Это свидетельство человека, отдельное от ACK агента.</p></>:revoked&&!terminal?<><p>Ключ назначенного агента отозван. Агент не может отправить ACK остановки.</p>{mode!=='cancel'&&<button type="button" className="btn btn-small" disabled={busy} onClick={()=>{setMode('cancel');setReason('');setEvidence('');setBaseVersion(version);}}>Завершить авторизацию отозванного агента</button>}</>:<p className="helper-note">Ключ назначенного агента отозван.</p>}
    {mode&&<form onSubmit={submit}>{mode==='cancel'&&<label className={twMerge(humanElements.formLabel,'text-[12px]')}>Причина завершения авторизации<textarea className={twMerge(humanElements.field,'text-[12px]')} required maxLength={20000} rows={3} value={reason} onChange={event=>setReason(event.target.value)} readOnly={busy}/></label>}<label className={twMerge(humanElements.formLabel,'text-[12px]')}>{mode==='cancel'?'Основание оператора':'Подтверждение внешней остановки'}<textarea className={twMerge(humanElements.field,'text-[12px]')} required maxLength={20000} rows={3} value={evidence} onChange={event=>setEvidence(event.target.value)} readOnly={busy}/></label><p>{mode==='cancel'?'Действие отменяет разрешение попытки. Оно не останавливает внешний процесс и не подтверждает ACK.':'Записывайте свидетельство после самостоятельной проверки внешней остановки. Ouro не проверяет состояние стороннего процесса.'}</p>{version!==baseVersion&&<p>Проект изменился после начала ввода. <button type="button" className="text-btn" onClick={()=>setBaseVersion(version)}>Обновить базу восстановления после проверки</button></p>}<button type="submit" className={`btn btn-small ${mode==='cancel'?'btn-danger':'btn-primary'}`} disabled={busy||version!==baseVersion||!evidence.trim()||(mode==='cancel'&&!reason.trim())}>{mode==='cancel'?'Отменить авторизацию без ACK':'Записать свидетельство оператора'}</button><button type="button" className="text-btn" disabled={busy} onClick={()=>setMode(null)}>Отменить ввод</button></form>}
  </section>;
}

function ExecutionPanel({
  execution: e,
  requests,
  agents = [],
  version,
  state,
  busy,
  command,
  compact = false,
  context = false,
  readOnly = false,
}: {
  execution?: ProjectState["executions"][number];
  requests: DecisionRequest[];
  agents?:AgentRegistration[];
  version:number;
  state:ProjectState;
  busy: boolean;
  command: (p: Payload, n?: string, expectedVersion?:number) => Promise<boolean>;
  compact?: boolean;
  context?: boolean;
  readOnly?: boolean;
}) {
  if (!e)
    return <div className={humanDecision.noExecution}>Исполнение ещё не начато.</div>;
  const targetRequest=e.remediatesBlockerId?state.requests.find(r=>r.id===e.remediatesBlockerId):undefined;
  const targetRoot=targetRequest?decisionRoot(targetRequest):undefined;
  const blocking = currentDecisionRequests(state).some(r=>
    (r.executionId===e.id||r.executionId===targetRequest?.executionId)&&decisionRoot(r)!==targetRoot&&
    ((r.state==='pending'&&r.blockingScope==='execution')||(r.state==='resolved'&&r.blockingScope==='execution'&&r.decision?.outcome.kind==='reject'))
  )||openPhysicalBlockers(state,e.specId).some(r=>decisionRoot(r)!==targetRoot)||state.executions.some(item=>item.specId===e.specId&&item.stopConfirmation==='unknown');
  return (
    <section className={twMerge(humanDecision.execution,compact?humanDecision.compactExecution:'')} aria-label="Исполнение">
      <div className={twMerge(humanElements.sectionHeading,compact?humanDecision.compactHeading:'')}>
        <h3 className={compact?humanDecision.compactTitle:undefined}>Исполнение</h3>
        {!compact && <span className={humanContext.badge}>{e.agentId===AGENT_ID?'SIMULATION':'MCP AGENT'}</span>}
      </div>
      <Status state={e.state} />
      {!compact && <code className={humanDecision.executionId}>{e.id}</code>}
      {e.resultEvidence && (
        <p className="helper-note">Результат попытки: {e.resultEvidence}</p>
      )}
      {e.resumeAuthorized && (
        <p className="helper-note">
          Продолжение разрешено человеком. Ожидается подтверждение агента.
        </p>
      )}
      {e.stopRequested && (
        <p className="helper-note">
          Остановка запрошена. Фактическая остановка ещё не подтверждена.
        </p>
      )}
      {!readOnly&&<>
        <OperatorRecovery key={e.id} version={version} execution={e} revoked={agents.some(a=>a.id===e.agentId&&!!a.revokedAt)} busy={busy} command={command}/>
        {(e.state === "waiting_for_human" || e.state === "paused") &&
          !e.resumeAuthorized && (
            <button
              className={twMerge('btn btn-small btn-full',humanDecision.executionAction,context?humanContext.action:'')}
              disabled={busy || blocking}
              title={
                blocking
                  ? "Сначала разрешите блокирующие запросы и устраните блокеры"
                  : undefined
              }
              onClick={() =>
                command(
                  { type: "resumeExecution", executionId: e.id },
                  "Продолжение разрешено. Агент должен подтвердить применение",
                )
              }
            >
              <Play size={13} />
              Разрешить продолжение
            </button>
          )}
        {(e.state === "queued" || e.state === "paused") && (
          <button
            className={twMerge('btn btn-small btn-full',humanDecision.executionAction,context?humanContext.action:'')}
            disabled={busy}
            onClick={() =>
              command(
                {
                  type: "cancelExecution",
                  executionId: e.id,
                  reason: "Человек завершил разрешённую попытку без продолжения",
                },
                "Попытка отменена человеком",
              )
            }
          >
            Отменить попытку
          </button>
        )}
        {(e.state === "running" || e.state === "queued") && !e.stopRequested && (
          <button
            className={twMerge('btn btn-small btn-full',humanDecision.executionAction,context?humanContext.action:'')}
            disabled={busy}
            onClick={() =>
              command(
                {
                  type: "requestStop",
                  executionId: e.id,
                  reason: "Человек запросил остановку из Human View",
                },
                "Остановка запрошена. Подтверждение ожидается",
              )
            }
          >
            Запросить остановку
          </button>
        )}
      </>}
    </section>
  );
}

function RealitySwitch({
  value,
  onChange,
}: {
  value: "history" | "graph";
  onChange: (v: "history" | "graph") => void;
}) {
  return (
    <div className={humanSpec.realitySwitch}>
      <div className={humanRoadmap.segmented}>
        <button
          className={twMerge(humanRoadmap.segment,value==='history'?humanRoadmap.segmentSelected:'')}
          onClick={() => onChange("history")}
        >
          <History size={14} />
          История
        </button>
        <button
          className={twMerge(humanRoadmap.segment,value==='graph'?humanRoadmap.segmentSelected:'')}
          onClick={() => onChange("graph")}
        >
          <Network size={14} />
          Причинный граф
        </button>
      </div>
      <p className={humanSpec.realityExplanation}>
        Связь показывает явное основание события. Последовательность сама по
        себе не означает причину.
      </p>
    </div>
  );
}

function Timeline({
  state,
  specId,
  expanded = false,
  comparison = false,
}: {
  state: ProjectState;
  specId: string | null;
  expanded?: boolean;
  comparison?: boolean;
}) {
  const events = state.events
    .filter((e) => !specId || e.specId === specId)
    .toReversed();
  return (
    <div className={`${humanHistory.timeline} ${expanded?'expanded':''}`}>
      {events.length ? (
        events.map((e) => (
          <article className={humanHistory.item} key={e.id}>
            <div className={twMerge(`${humanHistory.icon} actor-${e.actor.kind}`,e.actor.kind==='human'?humanHistory.humanIcon:'')}>
              {e.actor.kind === "human" ? (
                <ShieldCheck size={15} />
              ) : e.type.includes("Decision") ? (
                <CircleDot size={15} />
              ) : (
                <Code2 size={15} />
              )}
            </div>
            <div className={humanHistory.body}>
              <div className={twMerge(humanHistory.metadata,comparison?humanHistory.comparisonMetadata:'')}>
                <strong className={twMerge(humanHistory.eventTitle,comparison?humanHistory.comparisonTitle:'')}>
                  {eventLabels[e.type] ??
                    e.type.replace(/([A-Z])/g, " $1").trim()}
                </strong>
                <time className={humanHistory.time}>{shortDate(e.occurredAt)}</time>
              </div>
              <p className={humanHistory.copy}>
                {String(
                  e.payload.title ??
                    e.payload.evidence ??
                    e.payload.reason ??
                    e.payload.message ??
                    (e.actor.kind === "human"
                      ? "Подтверждённое действие человека"
                      : "Зафиксированный факт"),
                )}
              </p>
              <div className={twMerge(humanHistory.tags,comparison?humanHistory.comparisonTags:'')}>
                <span className={humanHistory.version}>#{e.version}</span>
                {e.specRevisionId && (
                  <span>
                    r
                    {state.revisions.find((r) => r.id === e.specRevisionId)
                      ?.revision ?? "?"}
                  </span>
                )}
                <span>{e.actor.name ?? e.actor.id}</span>
                {e.specId && (
                  <span>
                    {state.specs.find((s) => s.id === e.specId)?.humanId}
                  </span>
                )}
              </div>
              {expanded && (
                <WorkspaceAccordion className={humanHistory.accordion} title={<>Событие JSON</>}>
                  <pre className={humanHistory.source}>{JSON.stringify(e, null, 2)}</pre>
                </WorkspaceAccordion>
              )}
            </div>
          </article>
        ))
      ) : (
        <Empty>
          Событий в выбранном контексте пока нет.
        </Empty>
      )}
    </div>
  );
}

function ModalDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,textarea,select,[href]",
        ) ?? [],
      );
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const all = focusable(),
          first = all[0],
          last = all.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className={humanModal.backdrop}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={humanModal.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={ref}
      >
        <div className={humanModal.header}>
          <h2 className={humanModal.title} id="modal-title">{title}</h2>
          <button
            className="icon-btn"
            aria-label="Закрыть диалог"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function SpecForm({
  revision: sourceRevision,
  version,
  busy,
  onSubmit,
}: {
  revision?: SpecRevision;
  version:number;
  busy: boolean;
  onSubmit: (content: Payload,base:{revision?:SpecRevision;expectedVersion:number}) => Promise<void>;
}) {
  const [revision] = useState(sourceRevision);
  const [baseVersion,setBaseVersion]=useState(version);
  const baseChanged = revision?.id !== sourceRevision?.id;
  const [title, setTitle] = useState(revision?.title ?? ""),
    [goal, setGoal] = useState(revision?.goal ?? ""),
    [dod, setDod] = useState(revision?.dod.map((c) => c.text).join("\n") ?? ""),
    [constraints, setConstraints] = useState(revision?.constraints ?? "");
  return (
    <form
      className={humanModal.form}
      onSubmit={(e) => {
        e.preventDefault();
        if(baseChanged||busy)return;
        void onSubmit({
          title,
          goal,
          dod: dod
            .split("\n")
            .filter((t) => t.trim())
            .map((text) => ({
              id:
                revision?.dod.find((c) => c.text === text)?.id ??
                crypto.randomUUID(),
              text: text.trim(),
              required: true,
            })),
          constraints:
            constraints.trim() || "Дополнительные ограничения не заданы",
          assumptions: revision?.assumptions || "Допущения не заданы",
          risks: revision?.risks || "Риски требуют уточнения",
          inputs: revision?.inputs || "Постановка человека в Human View",
          comment: revision
            ? "Новая ревизия предложена человеком через Human View"
            : "Создано через Human View",
          ...(revision?.flow ? {flow:revision.flow} : {}),
        },{revision,expectedVersion:baseVersion});
      }}
    >
      <label className={humanElements.formLabel}>
        Название
        <input className={humanElements.field}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={180}
          placeholder="Например: показать ответы человека в истории"
        />
      </label>
      <label className={humanElements.formLabel}>
        Цель
        <textarea className={humanElements.field}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          required
          rows={3}
          placeholder="Что должно измениться для человека?"
        />
      </label>
      <label className={humanElements.formLabel}>
        Definition of Done
        <span className={humanModal.hint}>Один проверяемый критерий на строку</span>
        <textarea className={humanElements.field}
          value={dod}
          onChange={(e) => setDod(e.target.value)}
          required
          rows={4}
          placeholder="Ответ человека виден в истории спеки\nПовтор команды не создаёт второй ответ"
        />
      </label>
      <label className={humanElements.formLabel}>
        Ограничения
        <textarea className={humanElements.field}
          value={constraints}
          onChange={(e) => setConstraints(e.target.value)}
          rows={2}
        />
      </label>
      <p className={twMerge("helper-note",humanModal.copy,humanModal.helper)}>
        Содержание сохраняется неизменяемой ревизией. Активация — отдельное
        действие человека.
      </p>
      {baseChanged && <p className={humanModal.copy} role="alert">Ревизия изменилась. Текст черновика сохранён; проверьте новое ожидание перед созданием следующей ревизии.</p>}
      {!baseChanged&&baseVersion!==version&&<p className={twMerge("helper-note",humanModal.copy,humanModal.helper)}>Проект изменился после начала ввода. <button type="button" className="text-btn" onClick={()=>setBaseVersion(version)}>Обновить версию после проверки</button></p>}
      <button
        className={twMerge("btn btn-primary",humanModal.submit)}
        disabled={busy || baseChanged || !title.trim() || !goal.trim() || !dod.trim()}
        type="submit"
      >
        {busy ? (
          <LoaderCircle className="spin" size={15} />
        ) : (
          <Plus size={15} />
        )}{" "}
        {revision ? "Сохранить предложение" : "Создать спецификацию"}
      </button>
    </form>
  );
}
function AcceptanceForm({
  spec: sourceSpec,
  revision: sourceRevision,
  version,
  busy,
  onSubmit,
}: {
  spec: Spec;
  revision: SpecRevision;
  version:number;
  busy: boolean;
  onSubmit: (evidence: Record<string, string>,base:{specId:string;revisionId:string;expectedVersion:number}) => Promise<void>;
}) {
  const [base]=useState(()=>({spec:sourceSpec,revision:sourceRevision}));
  const [baseVersion,setBaseVersion]=useState(version);
  const {spec,revision}=base;
  const baseChanged=sourceSpec.id!==spec.id||sourceRevision.id!==revision.id||sourceSpec.activeRevisionId!==revision.id;
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  return (
    <form
      className={humanModal.form}
      onSubmit={(e) => {
        e.preventDefault();
        if(baseChanged||busy)return;
        void onSubmit(evidence,{specId:spec.id,revisionId:revision.id,expectedVersion:baseVersion});
      }}
    >
      <p className={twMerge("helper-note",humanModal.copy,humanModal.helper)}>
        {spec.humanId} · ревизия {revision.revision}. Укажите основание проверки
        каждого обязательного критерия. Успех агента сам по себе не означает
        приёмку.
      </p>
      {revision.dod.map((c, i) => (
        <label className={humanElements.formLabel} key={c.id}>
          <span>
            {i + 1}. {c.text}
          </span>
          <textarea className={humanElements.field}
            readOnly={baseChanged}
            required={c.required}
            value={evidence[c.id] ?? ""}
            onChange={(e) =>
              setEvidence((prev) => ({ ...prev, [c.id]: e.target.value }))
            }
            rows={2}
            placeholder="Ссылка на проверку или наблюдаемый результат…"
          />
        </label>
      ))}
      {baseChanged&&<p className={humanModal.copy} role="alert">Ревизия изменилась. Основания по r{revision.revision} сохранены для проверки и не перенесены на новое ожидание.</p>}
      {!baseChanged&&baseVersion!==version&&<p className={twMerge("helper-note",humanModal.copy,humanModal.helper)}>Проект изменился после открытия приёмки. <button type="button" className="text-btn" onClick={()=>setBaseVersion(version)}>Обновить версию после проверки</button></p>}
      <button
        className={twMerge("btn btn-primary",humanModal.submit)}
        type="submit"
        disabled={
          busy ||
          baseChanged ||
          revision.dod.some((c) => c.required && !evidence[c.id]?.trim())
        }
      >
        <ShieldCheck size={15} />
        Подтверждаю приёмку по DoD
      </button>
    </form>
  );
}
function DependencyForm({
  specs,
  busy,
  onSubmit,
}: {
  specs: Spec[];
  busy: boolean;
  onSubmit: (from: string, to: string) => Promise<void>;
}) {
  const [from, setFrom] = useState(specs[0]?.id ?? ""),
    [to, setTo] = useState(specs[1]?.id ?? "");
  return (
    <form
      className={humanModal.form}
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(from, to);
      }}
    >
      <p className={humanModal.copy}>
        Связь A → B означает, что B требует принятого результата A. Сервер
        отклоняет циклы с указанием пути.
      </p>
      <label className={humanElements.formLabel}>
        A · Предшествующая спека
        <AppSelect className="w-full text-[14px] font-normal" aria-label="A · Предшествующая спека" value={from} onValueChange={(value) => setFrom(value)} required>
          {specs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.humanId} — {s.title}
            </option>
          ))}
        </AppSelect>
      </label>
      <label className={humanElements.formLabel}>
        B · Зависимая спека
        <AppSelect className="w-full text-[14px] font-normal" aria-label="B · Зависимая спека" value={to} onValueChange={(value) => setTo(value)} required>
          {specs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.humanId} — {s.title}
            </option>
          ))}
        </AppSelect>
      </label>
      <button
        className={twMerge("btn btn-primary",humanModal.submit)}
        type="submit"
        disabled={busy || !from || !to || from === to}
      >
        <GitBranch size={15} />
        Добавить зависимость
      </button>
    </form>
  );
}

function Methodology() {
  const sources = [
    {
      title: "Roadmap: зависимости и направление",
      text: "Граф отвечает на вопрос «что требуется для чего». Даты показываются отдельно, когда они действительно заданы. Расположение узла не создаёт зависимость.",
      links: [
        [
          "GitHub Projects · Roadmap",
          "https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-roadmap-layout",
        ],
        ["Dagre · directed graph layout", "https://github.com/dagrejs/dagre"],
      ],
    },
    {
      title: "Процесс, исполнение и человеческое решение",
      text: "Развилка здесь — выбор человеком одного пути. Циклы допустимы в схеме процесса; каждый фактический повтор получает новый идентификатор. Решение, исполнение и DoD имеют отдельные статусы.",
      links: [
        ["OMG BPMN 2.0.2", "https://www.omg.org/spec/BPMN/2.0.2"],
        ["W3C SCXML · State Chart XML", "https://www.w3.org/TR/scxml/"],
      ],
    },
    {
      title: "История — источник истины",
      text: "Факты и ревизии добавляются без перезаписи. Проекции можно восстановить повторным чтением событий. Идемпотентность и проверка версии защищают от повторов и гонок.",
      links: [
        [
          "Martin Fowler · Event Sourcing",
          "https://martinfowler.com/eaaDev/EventSourcing.html",
        ],
        [
          "Microsoft · CQRS",
          "https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs",
        ],
      ],
    },
    {
      title: "Управляемый и доступный граф",
      text: "Перекомпоновка выполняется явно. Таблица даёт альтернативный путь к тем же данным. Цвет всегда сопровождается подписью; анимация не нужна для понимания состояния.",
      links: [
        [
          "React Flow · Accessibility",
          "https://reactflow.dev/learn/advanced-use/accessibility",
        ],
        ["WCAG 2.2", "https://www.w3.org/TR/WCAG22/"],
      ],
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Методология и источники</h1>
          <p>Практики, которые определяют поведение прототипа.</p>
        </div>
      </div>
      <div className={humanMethodology.intro}>
        <BookOpen className={humanMethodology.introIcon} size={24} />
        <div>
          <h2 className={humanMethodology.introTitle}>От литературы — к проверяемым правилам</h2>
          <p className={humanMethodology.introCopy}>
            Выбранные принципы применены к Human View. Ouro не объявляется
            BPMN-редактором или полной реализацией SCXML.
          </p>
        </div>
      </div>
      <div className="methodology-articles">
        {sources.map((s, i) => (
          <article className={humanMethodology.article} key={s.title}>
            <span className={humanMethodology.number}>0{i + 1}</span>
            <div>
              <h2 className={humanMethodology.title}>{s.title}</h2>
              <p className={humanMethodology.copy}>{s.text}</p>
              <div className={humanMethodology.links}>
                {s.links.map(([title, url]) => (
                  <a className={humanMethodology.link} href={url} target="_blank" rel="noreferrer" key={url}>
                    {title}
                    <ArrowUpRight size={13} />
                  </a>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className={humanMethodology.footnote}>
        <h3 className={humanMethodology.footnoteTitle}>Границы прототипа</h3>
        <p className={humanMethodology.footnoteCopy}>
          MCP-совместимые агенты подключаются через stdio или Streamable HTTP;
          симулятор доступен отдельно для учебных попыток. Контекст Meridian
          загружается из JSON; нативный мост и SSO остаются отдельным этапом.
          Структура интерфейса основана на
          Ouro.pen, визуальные токены — на Meridian в Figma. Разобранные
          источники, компромиссы и критерии проверки находятся в документации
          репозитория.
        </p>
        <a
          className={twMerge('btn',humanMethodology.footnoteAction)}
          target="_blank"
          rel="noreferrer"
          href="https://github.com/QahNaaRlN/ouro/tree/feat/meridian-context/docs"
        >
          Открыть документацию
          <ArrowUpRight size={15} />
        </a>
      </div>
    </>
  );
}
