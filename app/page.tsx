"use client";

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
  ChevronDown,
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
import LessonsPanel from '@/components/lessons-panel';
import ImpactPanel from '@/components/impact-panel';
import SpecFlow from "@/components/spec-flow";
import { StateTransitions } from "@/components/state-transitions";
import { createProjectSnapshotAdopter, type ProjectSnapshot } from '@/lib/project-snapshot';
import { startProjectSubscription, type ProjectSubscriptionStatus } from '@/lib/project-subscription';
import { getRoadmapFilterOptions, matchesRoadmapFilter } from '@/packages/core/src/roadmap-filter';
import {
  AGENT_ID,
  PROJECT_ID,
  type DecisionRequest,
  type ProjectState,
  type DomainEvent,
  type Spec,
  type SpecRevision,
  type FlowDefinition,
} from "@/packages/core/src";

type View = "roadmap" | "specs" | "decisions" | "history" | "methodology" | "agents" | "integrations" | "lessons" | "impact";
type Modal = "create" | "revision" | "accept" | "dependency" | null;
type ProjectResponse = { state: ProjectState; cursor: number; storage: string };
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
function Empty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="empty-state">
      {icon}
      <p>{children}</p>
    </div>
  );
}

export default function Home() {
  const [state, setState] = useState<ProjectState | null>(null),
    [storage, setStorage] = useState(""),
    [cursor, setCursor] = useState(0);
  const [agents, setAgents] = useState<AgentRegistration[]>([]);
  const [assignmentAgentId, setAssignmentAgentId] = useState(AGENT_ID);
  const [snapshotAdopter] = useState(()=>createProjectSnapshotAdopter(PROJECT_ID));
  const [streamStatus,setStreamStatus] = useState<ProjectSubscriptionStatus>('connecting');
  const [agentFilter,setAgentFilter] = useState(''),[requestFilter,setRequestFilter] = useState('');
  const [flowRevisionId, setFlowRevisionId] = useState<string | null>(null);
  const [view, setView] = useState<View>("roadmap"),
    [selected, setSelected] = useState<string | null>(null),
    [requestId, setRequestId] = useState<string | null>(null);
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [graphView, setGraphView] = useState(true),
    [layoutKey, setLayoutKey] = useState(0);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const [theme, setTheme] = useState("dark"),
    [mobileNav, setMobileNav] = useState(false),
    [modal, setModal] = useState<Modal>(null),
    [detailTab, setDetailTab] = useState("expectation"),
    [realityView, setRealityView] = useState<"history" | "graph">("history");
  const cursorRef = useRef(0);
  const hasInitialSelection = useRef(false);
  const pendingRef = useRef(false);
  const presentSnapshot=useCallback((snapshot:ProjectSnapshot)=>{
    setState(snapshot.state);
    if(snapshot.storage)setStorage(snapshot.storage);
    setCursor(snapshot.cursor);cursorRef.current=snapshot.cursor;
  },[]);
  const adoptSnapshot=useCallback((value:unknown)=>{
    const result=snapshotAdopter.adopt(value);
    if(result.status==='invalid')throw new Error(`Невозможно подтвердить историю: ${result.reason}. Обновите страницу после проверки сервера.`);
    presentSnapshot(result.snapshot);return result.snapshot;
  },[snapshotAdopter,presentSnapshot]);
  const refresh = useCallback(async () => {
    const response = await fetch("/api/project", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error?.message ?? "Не удалось прочитать проект");
    const adopted=adoptSnapshot(data);
    if (!hasInitialSelection.current) {
      setSelected(adopted.state.specs[0]?.id ?? null);
      hasInitialSelection.current = true;
    }
    return adopted as ProjectResponse;
  }, [adoptSnapshot]);
  const adoptMutation=async(data:unknown)=>{
    if((data as {replayed?:boolean})?.replayed)await refresh();else adoptSnapshot(data);
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await fetch("/api/session");
        if (!session.ok) {
          const data = await session.json();
          throw new Error(
            data.error?.message ?? "Не удалось открыть локальную сессию",
          );
        }
        if (!cancelled) {
          await refresh();
          const agentsResponse=await fetch('/api/agents',{cache:'no-store'});
          if(agentsResponse.ok){const body=await agentsResponse.json();if(!cancelled)setAgents(body.agents);}
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);
  useEffect(() => {
    const saved = localStorage.getItem("ouro-theme");
    if (saved === "light") setTheme(saved);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("ouro-theme", theme);
  }, [theme]);
  useEffect(() => {
    if(loading||!snapshotAdopter.getSnapshot())return;
    const subscription=startProjectSubscription({adopter:snapshotAdopter,onSnapshot:presentSnapshot,onStatus:setStreamStatus,reconcile:async()=>{
      const response=await fetch('/api/project',{cache:'no-store'});
      if(!response.ok)throw new Error('Не удалось сверить историю');return response.json();
    }});
    const offline=()=>{subscription.reconnect();setStreamStatus(current=>current==='reload-required'?current:'reconnecting');};
    const online=()=>subscription.reconnect();
    window.addEventListener('offline',offline);window.addEventListener('online',online);
    if(!navigator.onLine)offline();
    return ()=>{window.removeEventListener('offline',offline);window.removeEventListener('online',online);subscription.close();};
  }, [loading,snapshotAdopter,presentSnapshot]);
  useEffect(()=>{
    if(loading)return;let live=true;
    const timer=setInterval(()=>{void fetch('/api/agents',{cache:'no-store'}).then(async response=>{if(response.ok){const data=await response.json();if(live)setAgents(data.agents);}}).catch(()=>{});},8000);
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
  ) => {
    if (!state || busy) return false;
    setBusy(true);
    pendingRef.current = true;
    setError("");
    try {
      const r = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          requestId: crypto.randomUUID(),
          expectedVersion: expectedVersionOverride ?? state.version,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        if (data.state) adoptSnapshot(data);
        else await refresh();
        throw new Error(
          `${data.error?.code ?? "ERROR"}: ${data.error?.message ?? "Команда не выполнена"}`,
        );
      }
      if (data.replayed) {
        await refresh();
      } else if (data.state) {
        adoptSnapshot(data);
      } else await refresh();
      onCommitted?.(Array.isArray(data.events)?data.events:[]);
      setToast(notice);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
      pendingRef.current = false;
    }
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
    if (!state || !selected || busy) return;
    const target=state.executions.filter(e=>e.specId===selected&&!['succeeded','failed','cancelled','skipped'].includes(e.state)).at(-1);
    if(target?.agentId!==AGENT_ID){setError('Подтверждение назначенного MCP-агента поступает через его подключение. Симулятор не управляет этой попыткой.');return;}
    setBusy(true);
    pendingRef.current = true;
    setError("");
    try {
      const r = await fetch("/api/simulator", {
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
  const openRequest = (r: DecisionRequest) => {
    setSelected(r.specId);
    setRequestId(r.id);
    setView("decisions");
  };
  const navigate = (v: View) => {
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
  const originLessonRevision=spec?.origin?.kind==='lesson'?state?.lessonRevisions.find(item=>item.id===spec.origin?.lessonRevisionId):undefined;
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
  const simulatorAvailable = simulationExecution?.agentId===AGENT_ID;
  const selectedAgentName = execution ? execution.agentId===AGENT_ID ? 'Симулятор агента' : agents.find(a=>a.id===execution.agentId)?.name??'Назначенный MCP-агент' : 'MCP и симулятор';
  const assignmentValid=assignmentAgentId===AGENT_ID || agents.some(a=>a.id===assignmentAgentId&&!a.revokedAt);
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
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <a className="brand" href="/" aria-label="Ouro — главная">
          <span className="brand-symbol">O</span>
          <span>
            ouro<span className="brand-dot">.</span>
          </span>
          <span className="alpha-label">ALPHA</span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-avatar">
            <Box size={17} />
          </span>
          <div>
            <strong>Ouro OS</strong>
            <small>Локальное рабочее место</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">ПРОЕКТ</div>
        <nav aria-label="Основная навигация">
          {nav.map((item) => (
            <button
              className={`nav-item ${view === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.id === "decisions" && pending.length > 0 && (
                <span className="nav-count">{pending.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <div className="sidebar-note-icon">
            <GitBranch size={16} />
          </div>
          <strong>Ожидание → реальность</strong>
          <p>
            Агент сообщает факты.
            <br />
            Человек принимает решения.
          </p>
        </div>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${view === "methodology" ? "active" : ""}`}
            onClick={() => navigate("methodology")}
          >
            <BookOpen size={18} />
            Методология и источники
            <ArrowUpRight size={13} />
          </button>
          <div className="profile">
            <span className="avatar">ВЫ</span>
            <div>
              <strong>Локальный исследователь</strong>
              <small>Человек · решения и приёмка</small>
            </div>
            <ShieldCheck size={15} />
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-btn mobile-menu"
              aria-label="Открыть меню"
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu size={19} />
            </button>
            <span className="project-crumb">Проекты</span>
            <span className="crumb-slash">/</span>
            <span className="current-project">
              <Box size={15} />
              Ouro OS
            </span>
            <span className="project-tag">Human View</span>
          </div>
          <div className="topbar-actions">
            <span className="demo-label">
              <span className="tiny-dot" />
              {selectedAgentName}
            </span>
            <button
              className="icon-btn"
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
              className="icon-btn"
              target="_blank"
              rel="noreferrer"
              aria-label="Открыть репозиторий"
            >
              <Code2 size={18} />
            </a>
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <TriangleAlert size={16} />
            <span>{error}</span>
            <button aria-label="Закрыть сообщение" onClick={() => setError("")}>
              <X size={15} />
            </button>
          </div>
        )}
        {toast && (
          <div className="toast" role="status">
            <Check size={16} />
            {toast}
          </div>
        )}
        {loading ? (
          <main className="loading-screen">
            <LoaderCircle className="spin" size={25} />
            <h1>Открываем рабочее место</h1>
            <p>Восстанавливаем состояние из истории событий…</p>
          </main>
        ) : !state ? (
          <main className="loading-screen">
            <TriangleAlert size={30} />
            <h1>Проект недоступен</h1>
            <p>{error || "Проверьте запуск сервера и локальную сессию."}</p>
            <button className="btn" onClick={() => location.reload()}>
              Повторить
            </button>
          </main>
        ) : (
          <div className="workspace-body">
            <main className={`main-content view-${view}`}>
              {view === "roadmap" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">НАПРАВЛЕНИЕ ПРОЕКТА</div>
                      <h1>
                        Дорожная карта{" "}
                        <span className="heading-count">
                          {state.specs.length}
                        </span>
                      </h1>
                      <p>
                        {state.roadmap.goal ||
                          "От замысла до подтверждённого результата — с решениями человека."}
                      </p>
                    </div>
                    <button
                      className="btn btn-primary"
                      onClick={() => setModal("create")}
                    >
                      <Plus size={16} />
                      Новая спека
                    </button>
                  </div>
                  <div className="overview-metrics">
                    <div>
                      <span className="metric-dot running" />
                      <strong>
                        {
                          state.specs.filter((s) => s.state === "in_progress")
                            .length
                        }
                      </strong>
                      <span>в работе</span>
                    </div>
                    <div>
                      <span className="metric-dot attention" />
                      <strong>{pending.length}</strong>
                      <span>ждут решения</span>
                    </div>
                    <div>
                      <span className="metric-dot done" />
                      <strong>
                        {state.specs.filter((s) => s.state === "done").length}
                        <small> / {state.specs.length}</small>
                      </strong>
                      <span>принято по DoD</span>
                    </div>
                    <span className="metrics-divider" />
                    <span className="roadmap-state">
                      <span className="tiny-dot" />
                      {state.roadmap.state === "active"
                        ? "Активная карта"
                        : state.roadmap.state}
                    </span>
                  </div>
                  <div className="canvas-toolbar">
                    <div
                      className="segmented"
                      aria-label="Представление дорожной карты"
                    >
                      <button
                        className={graphView ? "selected" : ""}
                        onClick={() => setGraphView(true)}
                      >
                        <Network size={15} />
                        Граф
                      </button>
                      <button
                        className={!graphView ? "selected" : ""}
                        onClick={() => setGraphView(false)}
                      >
                        <List size={15} />
                        Таблица
                      </button>
                    </div>
                    <div className="toolbar-right">
                      <div className="search-field">
                        <Search size={14} />
                        <input
                          aria-label="Поиск спецификаций"
                          placeholder="Найти спеку…"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </div>
                      <select
                        aria-label="Фильтр по статусу"
                        className="filter-select"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                      >
                        <option value="">Все статусы</option>
                        {Object.entries(specLabels).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <select aria-label="Фильтр по агенту" className="filter-select" value={agentFilter} onChange={e=>setAgentFilter(e.target.value)}>
                        <option value="">Все агенты</option>{[...new Set([...filterOptions.agentIds,...(agentFilter?[agentFilter]:[])])].map(id=><option key={id} value={id}>{id===AGENT_ID?'Симулятор агента':`${agents.find(a=>a.id===id)?.name??id.slice(0,8)}${agents.find(a=>a.id===id)?.revokedAt?' · ключ отозван':''}`}</option>)}
                      </select>
                      <select aria-label="Фильтр по открытому запросу" className="filter-select" value={requestFilter} onChange={e=>setRequestFilter(e.target.value)}>
                        <option value="">Все открытые запросы</option>{Object.entries(kinds).map(([kind,label])=><option key={kind} value={kind}>{label}</option>)}
                      </select>
                      <button
                        className="icon-btn"
                        title="Новая зависимость"
                        aria-label="Добавить зависимость"
                        onClick={() => setModal("dependency")}
                      >
                        <GitBranch size={17} />
                      </button>
                      <button
                        className="icon-btn"
                        title="Пересчитать расположение графа"
                        aria-label="Пересчитать расположение графа"
                        onClick={() => setLayoutKey((k) => k + 1)}
                      >
                        <LayoutGrid size={17} />
                      </button>
                    </div>
                  </div>
                  <div
                    className={graphView ? "roadmap-surface" : "table-surface"}
                  >
                    {graphView ? (
                      <Roadmap
                        state={state}
                        selected={selected}
                        onSelect={pick}
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
                        onSelect={(id) => {
                          pick(id);
                          setView("specs");
                        }}
                      />
                    )}
                  </div>
                  {selected&&!visibleSpecs.some(s=>s.id===selected)&&<p className="helper-note" role="status">Выбранная спека вне фильтра. Выбор и контекст сохранены.</p>}
                  <div className="canvas-bottom">
                    <span>
                      <span className="legend-line" />
                      Обязательная зависимость
                    </span>
                    <span>Положение узла не определяет порядок исполнения</span>
                  </div>
                  {spec && (
                    <div className="selection-strip">
                      <div>
                        <span className="mono">{spec.humanId}</span>
                        <strong>{spec.title}</strong>
                      </div>
                      <button
                        className="text-btn"
                        onClick={() => setView("specs")}
                      >
                        Открыть спецификацию
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
                      <div className="eyebrow">ОЖИДАНИЕ И РЕАЛЬНОСТЬ</div>
                      <h1>Спецификация</h1>
                      <p>Ожидание версионируется. Факты сохраняются.</p>
                    </div>
                    <button className="btn" onClick={() => setModal("create")}>
                      <Plus size={16} />
                      Новая спека
                    </button>
                  </div>
                  <div className="spec-picker">
                    <select
                      aria-label="Выбрать спецификацию"
                      value={selected ?? ""}
                      onChange={(e) => pick(e.target.value)}
                    >
                      {state.specs.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.humanId} — {s.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  {spec && revision ? (
                    <>
                      <div className="spec-title-row">
                        <div>
                          <span className="mono eyebrow">{spec.humanId}</span>
                          <h2>{spec.title}</h2>
                        </div>
                        <Status state={spec.state} />
                      </div>
                      <div className="spec-submeta">
                        <span>
                          Ревизия <strong>{revision.revision}</strong>
                        </span>
                        <span className="mono id-text" title={spec.id}>
                          Agent ID · {spec.id}
                        </span>
                      </div>
                      <div className="detail-tabs">
                        <button
                          className={
                            detailTab === "expectation" ? "selected" : ""
                          }
                          onClick={() => setDetailTab("expectation")}
                        >
                          <FileText size={15} />
                          Ожидание
                        </button>
                        <button
                          className={detailTab==='process'?'selected':''}
                          onClick={()=>{if(!state.revisions.some(r=>r.id===flowRevisionId&&r.specId===spec.id))setFlowRevisionId(spec.revisionIds.at(-1)??revision.id);setDetailTab('process');}}
                        >
                          <GitBranch size={15}/>Процесс
                        </button>
                        <button className={detailTab==='states'?'selected':''} onClick={()=>setDetailTab('states')}>
                          <Network size={15}/>Состояния
                        </button>
                        <button
                          className={detailTab === "compare" ? "selected" : ""}
                          onClick={() => setDetailTab("compare")}
                        >
                          <Columns2 size={15} />
                          Сопоставление
                        </button>
                        <button
                          className={detailTab === "reality" ? "selected" : ""}
                          onClick={() => setDetailTab("reality")}
                        >
                          <History size={15} />
                          Реальность
                          <span>
                            {
                              state.events.filter((e) => e.specId === selected)
                                .length
                            }
                          </span>
                        </button>
                        <button
                          className={
                            detailTab === "revisions" ? "selected" : ""
                          }
                          onClick={() => setDetailTab("revisions")}
                        >
                          <Layers3 size={15} />
                          Ревизии<span>{spec.revisionIds.length}</span>
                        </button>
                      </div>
                      {detailTab==='process' && (()=>{
                        const shown=state.revisions.find(r=>r.id===flowRevisionId&&r.specId===spec.id)??state.revisions.find(r=>r.id===spec.revisionIds.at(-1))??revision;
                        return <>
                          <div className="run-toolbar">
                            <label className="form-label">Ревизия схемы<select aria-label="Ревизия схемы" value={shown.id} onChange={e=>setFlowRevisionId(e.target.value)}>{state.revisions.filter(r=>r.specId===spec.id).toReversed().map(r=><option key={r.id} value={r.id}>r{r.revision} · {r.id===spec.activeRevisionId?'активная':r.id===spec.revisionIds.at(-1)?'предложена':'историческая'}</option>)}</select></label>
                            {shown.id!==spec.activeRevisionId&&shown.id===spec.revisionIds.at(-1)&&<button className="btn" disabled={busy} onClick={()=>command({type:'activateRevision',specId:spec.id,revisionId:shown.id},'Ревизия схемы активирована. История прежних попыток сохранена.')}><Check size={14}/>Активировать ревизию {shown.revision}</button>}
                          </div>
                          <SpecFlow key={shown.id} revision={shown} state={state} busy={busy} onSave={saveFlow}/>
                        </>;
                      })()}
                      {detailTab==='states'&&<StateTransitions state={state} specId={spec.id} executionId={execution?.id}/>}
                      {detailTab === "expectation" && (
                        <div className="expectation-content">
                          {spec.origin?.kind==='lesson'&&<section className="content-section small-section" aria-label="Происхождение спеки">
                            <h3>Происхождение спеки</h3>
                            {originLessonRevision?<><p>Урок «{originLessonRevision.title}» · r{originLessonRevision.revision}</p><p>Спека создана из этой опубликованной редакции. Новые публикации урока не меняют её источник.</p></>:<p>Редакция урока-источника недоступна в текущем снимке.</p>}
                          </section>}
                          <section className="content-section">
                            <div className="section-heading">
                              <h3>Что должно измениться</h3>
                              <span className="quiet-label">
                                {spec.activeRevisionId
                                  ? "АКТИВНОЕ ОЖИДАНИЕ"
                                  : "ПРОЕКТ РЕВИЗИИ"}
                              </span>
                            </div>
                            <p className="goal-text">{revision.goal}</p>
                          </section>
                          <section className="content-section">
                            <div className="section-heading">
                              <h3>Definition of Done</h3>
                              <span className="quiet-label">
                                {revision.dod.length} КРИТЕРИЯ
                              </span>
                            </div>
                            <div className="criterion-list">
                              {revision.dod.map((c, i) => (
                                <div className="criterion" key={c.id}>
                                  <span
                                    className={`criterion-check ${spec.acceptance ? "checked" : ""}`}
                                  >
                                    {spec.acceptance ? (
                                      <Check size={13} />
                                    ) : (
                                      String(i + 1).padStart(2, "0")
                                    )}
                                  </span>
                                  <div>
                                    <p>{c.text}</p>
                                    {spec.acceptance?.evidence[c.id] && (
                                      <small>
                                        {spec.acceptance.evidence[c.id]}
                                      </small>
                                    )}
                                  </div>
                                  {c.required && (
                                    <span className="criterion-required">
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
                                className="content-section small-section"
                                key={label}
                              >
                                <h3>{label}</h3>
                                <p>{value}</p>
                              </section>
                            ))}
                          {!spec.activeRevisionId && (
                            <div className="draft-notice">
                              <p>
                                Ревизия ещё не активирована. До активации
                                исполнение недоступно.
                              </p>
                              <button
                                className="btn btn-small"
                                disabled={busy}
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
                          <div className="detail-actions">
                            <button
                              className="btn"
                              onClick={() => setModal("revision")}
                            >
                              <Plus size={15} />
                              Предложить ревизию
                            </button>
                            <button
                              className="btn btn-primary"
                              disabled={busy || spec.state === "done"}
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
                        <div className="comparison-view">
                          <section className="comparison-expectation">
                            <div className="comparison-heading">
                              <FileText size={16} />
                              <h3>Ожидание</h3>
                              <span>Ревизия {revision.revision}</span>
                            </div>
                            <div className="comparison-block">
                              <span className="quiet-label">ЦЕЛЬ</span>
                              <p className="goal-text">{revision.goal}</p>
                            </div>
                            <div className="comparison-block">
                              <h3>Definition of Done</h3>
                              <div className="criterion-list">
                                {revision.dod.map((c, i) => (
                                  <div className="criterion" key={c.id}>
                                    <span
                                      className={`criterion-check ${spec.acceptance ? "checked" : ""}`}
                                    >
                                      {spec.acceptance ? (
                                        <Check size={13} />
                                      ) : (
                                        i + 1
                                      )}
                                    </span>
                                    <div>
                                      <p>{c.text}</p>
                                      {spec.acceptance?.evidence[c.id] && (
                                        <small>
                                          {spec.acceptance.evidence[c.id]}
                                        </small>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            {revision.constraints && (
                              <div className="comparison-block">
                                <h3>Ограничения</h3>
                                <p>{revision.constraints}</p>
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
                          <section className="comparison-reality">
                            <div className="comparison-heading">
                              <History size={16} />
                              <h3>Реальность</h3>
                              <span>Только r{revision.revision}</span>
                            </div>
                            {execution &&
                              execution.specRevisionId === revision.id && (
                                <ExecutionPanel
                                  compact
                                  execution={execution}
                                  requests={selectedRequests.filter(
                                    (r) => r.specRevisionId === revision.id,
                                  )}
                                  busy={busy}
                                  command={command}
                                />
                              )}
                            <Timeline
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
                          <div className="run-toolbar">
                            <div>
                              <h3>Управление попыткой</h3>
                              <p>
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
                                <div className="agent-assignment-actions">
                                <AgentPicker agents={agents} value={assignmentAgentId} onChange={setAssignmentAgentId} disabled={busy}/>
                                <button
                                  className="btn btn-small"
                                  disabled={busy || !assignmentValid}
                                  onClick={() =>
                                    command(
                                      {
                                        type: "startExecution",
                                        specId: spec.id,
                                        specRevisionId: spec.activeRevisionId,
                                        agentId: assignmentAgentId,
                                      },
                                      "Попытка разрешена. Ожидается подтверждение назначенного исполнителя",
                                    )
                                  }
                                >
                                  <Play size={13} />
                                  Разрешить попытку
                                </button>
                                </div>
                              )}
                            <select
                              aria-label="Симулятор в контексте спецификации"
                              defaultValue=""
                              disabled={busy || !simulatorAvailable}
                              onChange={(e) => {
                                if (e.target.value)
                                  void simulate(e.target.value);
                                e.target.value = "";
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
                            </select>
                          </div>
                          <ExecutionPanel
                            execution={execution}
                            requests={selectedRequests}
                            busy={busy}
                            command={command}
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
                        <div className="revisions-list">
                          {state.revisions
                            .filter((r) => r.specId === selected)
                            .toReversed()
                            .map((r) => (
                              <article key={r.id} className="revision-card">
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
                                <strong>{r.title}</strong>
                                <p>{r.goal}</p>
                                <small>
                                  {shortDate(r.createdAt)} · {r.authorId}
                                </small>
                                <code>{r.id}</code>
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
                    <Empty icon={<FileText size={30} />}>
                      Выберите спецификацию или создайте первую.
                    </Empty>
                  )}
                </>
              )}
              {view === "decisions" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">ЧЕЛОВЕК В КОНТУРЕ</div>
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
                  <div className="decision-layout">
                    <div className="decision-list">
                      {state.requests.length ? (
                        state.requests.toReversed().map((r) => (
                          <button
                            className={`decision-row ${r.id === currentRequest?.id ? "selected" : ""}`}
                            key={r.id}
                            onClick={() => {
                              setRequestId(r.id);
                              setSelected(r.specId);
                            }}
                          >
                            <div
                              className={`request-kind kind-${r.kind.toLowerCase()}`}
                            >
                              <RequestIcon kind={r.kind} />
                              <span>{kinds[r.kind]}</span>
                              <span
                                className={`request-state-dot ${r.state === "pending" ? "pending" : ""}`}
                              />
                            </div>
                            <strong>{r.title}</strong>
                            <small>
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
                        <Empty icon={<CircleDot size={28} />}>
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
                        />
                      ) : (
                        <Empty icon={<MessageCircle size={30} />}>
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
                      <div className="eyebrow">НЕИЗМЕНЯЕМАЯ ИСТОРИЯ</div>
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
                  <div className="history-filter">
                    <label>
                      Контекст
                      <select
                        value={selected ?? ""}
                        onChange={(e) => setSelected(e.target.value || null)}
                      >
                        <option value="">Весь проект</option>
                        {state.specs.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.humanId} — {s.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="text-btn"
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
              {view === "agents" && <AgentsPanel onAgentsChange={setAgents}/>}
              {view==='integrations'&&<GitHubPanel state={state} onSnapshot={adoptMutation}/>}
              {view==='lessons'&&<LessonsPanel state={state} onSnapshot={adoptMutation} onOpenSpec={id=>{pick(id);setView('specs');setDetailTab('expectation');}}/>}
              {view==='impact'&&<ImpactPanel state={state}/>}
            </main>
            {view !== 'agents' && view!=='integrations' && view!=='lessons' && view!=='impact' && <aside className="context-panel">
              <div className="context-panel-heading">
                <span>Требует внимания</span>
                <span className="attention-counter">{pending.length}</span>
                <button
                  className="icon-btn"
                  aria-label="Обновить проект"
                  onClick={() => refresh().catch((e) => setError(e.message))}
                >
                  <RefreshCw size={14} />
                </button>
              </div>
              <div className="attention-list">
                {pending.length ? (
                  pending.slice(0, 4).map((r) => (
                    <button
                      className={`attention-card ${r.specId === selected ? "selected" : ""}`}
                      key={r.id}
                      onClick={() => openRequest(r)}
                    >
                      <div
                        className={`request-kind kind-${r.kind.toLowerCase()}`}
                      >
                        <RequestIcon kind={r.kind} />
                        <span>{kinds[r.kind]}</span>
                        <ArrowUpRight size={14} />
                      </div>
                      <strong>{r.title}</strong>
                      <small>
                        {state.specs.find((s) => s.id === r.specId)?.humanId}
                        <span>Решение за вами</span>
                      </small>
                    </button>
                  ))
                ) : (
                  <div className="attention-clear">
                    <ShieldCheck size={22} />
                    <strong>Всё разобрано</strong>
                    <p>Новых запросов человеку нет.</p>
                  </div>
                )}
              </div>
              {spec && (
                <div className="context-selected">
                  <div className="section-heading">
                    <h3>Контекст работы</h3>
                    <FileText size={15} />
                  </div>
                  <span className="mono">{spec.humanId}</span>
                  <strong className="selected-title">{spec.title}</strong>
                  <Status state={spec.state} />
                  <div className="context-facts">
                    <div>
                      <span>Ревизия</span>
                      <strong>{revision?.revision ?? "—"}</strong>
                    </div>
                    <div>
                      <span>Исполнение</span>
                      <strong>
                        {execution
                          ? execution.kind === "remediation"
                            ? "Устранение блокера"
                            : "Основная попытка"
                          : "Не начато"}
                      </strong>
                    </div>
                    <div>
                      <span>Результат принят</span>
                      <strong>{spec.acceptance ? "Человеком" : "Нет"}</strong>
                    </div>
                  </div>
                  {(!execution ||
                    ["succeeded", "failed", "cancelled", "skipped"].includes(
                      execution.state,
                    )) &&
                    spec.activeRevisionId &&
                    spec.state !== "done" &&
                    spec.state !== "invalidated" && (
                      <div className="agent-assignment-actions agent-assignment-vertical">
                      <AgentPicker agents={agents} value={assignmentAgentId} onChange={setAssignmentAgentId} disabled={busy}/>
                      <button
                        className="btn btn-small btn-full"
                        disabled={busy || !assignmentValid}
                        onClick={() =>
                          command(
                            {
                              type: "startExecution",
                              specId: spec.id,
                              specRevisionId: spec.activeRevisionId,
                              agentId: assignmentAgentId,
                            },
                            "Попытка разрешена человеком. Ожидается подтверждение назначенного исполнителя",
                          )
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
                      execution={execution}
                      requests={selectedRequests}
                      busy={busy}
                      command={command}
                    />
                  )}
                  <button
                    className="btn btn-full"
                    onClick={() => setView("specs")}
                  >
                    Открыть ожидание и реальность
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
              <div className="simulator-panel">
                <div className="section-heading">
                  <h3>
                    <Zap size={15} />
                    Симулятор
                  </h3>
                  <span className="small-tag">DEMO</span>
                </div>
                <p>{execution?.agentId && execution.agentId!==AGENT_ID ? 'Эта попытка назначена MCP-агенту. Его факты и подтверждения поступают через подключение.' : 'Учебные сценарии работают только для попыток, назначенных симулятору.'}</p>
                <label>
                  Сообщение агента
                  <select
                    aria-label="Сценарий симулятора"
                    defaultValue=""
                    disabled={busy || !selected || !simulatorAvailable}
                    onChange={(e) => {
                      if (e.target.value) void simulate(e.target.value);
                      e.target.value = "";
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
                  </select>
                </label>
                <span className="simulator-footnote">
                  Action фиксирует факт. Решения остаются за человеком.
                </span>
              </div>
              <div className="right-panel-bottom">
                <ShieldCheck size={15} />
                <span>Решение ≠ исполнение ≠ приёмка</span>
              </div>
            </aside>}
          </div>
        )}
        <footer className="statusbar">
          <div role="status" aria-live="polite">
            <span className={`connection-dot ${connected ? "online" : ""}`} />
            {connected?'Живые обновления подключены':streamStatus==='reload-required'?'История сервера изменилась · требуется проверка и перезагрузка':streamStatus==='connecting'?'Подключаем живые обновления…':'Нет связи · переподключаемся, показаны последние данные'}
            <span className="footer-separator" />
            <span className="mono">cursor {cursor}</span>
          </div>
          <div>
            <span>
              {storage === "postgres"
                ? "PostgreSQL"
                : storage
                  ? "PostgreSQL · embedded"
                  : "Хранилище…"}
            </span>
            <span className="footer-separator" />
            <span>0.1.0-alpha.7</span>
            <span className="small-tag">PROTOTYPE</span>
          </div>
        </footer>
      </div>
      {modal && state && (
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
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Спецификация</th>
            <th>Статус</th>
            <th>Ревизия</th>
            <th>Решения</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {specs.map((s) => (
            <tr key={s.id} className={s.id === selected ? "selected" : ""}>
              <td>
                <button className="table-spec" onClick={() => onSelect(s.id)}>
                  <span className="mono">{s.humanId}</span>
                  <strong>{s.title}</strong>
                </button>
              </td>
              <td>
                <Status state={s.state} />
              </td>
              <td className="mono">
                r
                {state.revisions.find((r) => r.id === s.activeRevisionId)
                  ?.revision ?? "—"}
              </td>
              <td>
                {state.requests.filter(
                  (r) => r.specId === s.id && r.state === "pending",
                ).length || "—"}
              </td>
              <td>
                <button
                  className="icon-btn"
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
        <Empty icon={<Search size={25} />}>
          По текущим фильтрам ничего не найдено.
        </Empty>
      )}
    </div>
  );
}

function AgentPicker({agents,value,onChange,disabled=false}:{agents:AgentRegistration[];value:string;onChange:(id:string)=>void;disabled?:boolean}){
  const valid=value===AGENT_ID||agents.some(a=>a.id===value&&!a.revokedAt);
  return <label className="agent-picker">Исполнитель попытки<select aria-label="Исполнитель попытки" value={valid?value:''} onChange={e=>onChange(e.target.value)} disabled={disabled}><option value="" disabled>Выберите исполнителя</option><option value={AGENT_ID}>Симулятор · учебный режим</option>{agents.filter(a=>!a.revokedAt).map(a=><option value={a.id} key={a.id}>{a.name} · MCP</option>)}</select></label>;
}

function DecisionForm({
  request: r,
  spec,
  busy,
  command,
  agents,
  version,
}: {
  request: DecisionRequest;
  spec?: Spec;
  busy: boolean;
  command: (p: Payload, n?: string, expectedVersion?:number) => Promise<boolean>;
  agents: AgentRegistration[];
  version:number;
}) {
  const [text, setText] = useState(""),
    [option, setOption] = useState(""),
    [mode, setMode] = useState<"decide" | "reject" | "defer">("decide");
  const [remediationAgentId,setRemediationAgentId]=useState(r.agentId);
  const [baseVersion,setBaseVersion]=useState(version);
  const closed=r.state!=='pending';
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
      <div className="request-detail-meta">
        <span className={`request-kind kind-${r.kind.toLowerCase()}`}>
          <RequestIcon kind={r.kind} />
          {kinds[r.kind]}
        </span>
        <Status state={r.state} />
      </div>
      <span className="mono eyebrow">{spec?.humanId}</span>
      <h2>{r.title}</h2>
      <div className="request-context">
        <span className="quiet-label">КОНТЕКСТ</span>
        <p>{r.context}</p>
      </div>
      {r.question && (
        <section>
          <h3>Вопрос агента</h3>
          <p>{r.question}</p>
        </section>
      )}
      {r.reason && (
        <section>
          <h3>Основание</h3>
          <p>{r.reason}</p>
        </section>
      )}
      {r.kind === "Blocker" && (
        <div className="blocker-comparison">
          <div>
            <span>Ожидалось</span>
            <p>{r.expected}</p>
          </div>
          <div>
            <span>Наблюдается</span>
            <p>{r.actual}</p>
          </div>
          <p className="blocker-impact">Влияние: {r.impact}</p>
        </div>
      )}
      {(r.state === 'pending'||text.length>0||option.length>0) && (
        <form onSubmit={submit}>
          {closed&&<p className="helper-note">Запрос уже закрыт. Ваш введённый текст сохранён для сравнения; повторная запись недоступна.</p>}
          {!closed&&version!==baseVersion&&<p className="helper-note">Проект изменился после начала ответа. <button type="button" className="text-btn" onClick={()=>setBaseVersion(version)}>Обновить версию после проверки</button></p>}
          <div className="decision-mode">
            <button
              type="button"
              disabled={closed||busy}
              className={mode === "decide" ? "active" : ""}
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
              className={mode === "reject" ? "active" : ""}
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
              className={mode === "defer" ? "active" : ""}
              onClick={() => {
                setMode("defer");
                setText("");
              }}
            >
              Отложить
            </button>
          </div>
          {mode === "decide" && r.kind !== "Question" && (
            <fieldset className="option-list">
              <legend>
                {r.kind === "Blocker" ? "План устранения" : "Варианты решения"}
              </legend>
              {r.options.map((o) => (
                <label
                  className={`option-card ${option === o.id ? "selected" : ""}`}
                  key={o.id}
                >
                  <input
                    type="radio"
                    disabled={closed||busy}
                    name="decision-option"
                    value={o.id}
                    checked={option === o.id}
                    onChange={() => setOption(o.id)}
                    required
                  />
                  <div>
                    <strong>{o.title}</strong>
                    <p>{o.description}</p>
                    {r.recommendationOptionId === o.id && (
                      <small>Рекомендация агента</small>
                    )}
                  </div>
                </label>
              ))}
              {r.options.length === 0 && (
                <p className="inline-warning">
                  Путь устранения пока неизвестен: {r.noPathReason}. Нужен
                  уточняющий запрос; одобрение без плана недоступно.
                </p>
              )}
            </fieldset>
          )}
          {(mode !== "decide" || r.kind === "Question") && (
            <label className="form-label">
              {mode === "reject"
                ? "Причина отклонения"
                : mode === "defer"
                  ? "Почему откладываем на сутки"
                  : "Ваш ответ"}
              <textarea
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
          <div className="decision-warning">
            <ShieldCheck size={16} />
            <p>
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
        <div className="recorded-decision">
          <div className="section-heading">
            <h3>Решение человека</h3>
            <ShieldCheck size={17} />
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
            <small>
              {shortDate(r.decision.at)} · {r.decision.actorId}
            </small>
          )}
          <div className="application-state">
            {r.decision?.appliedAt ? (
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
          </div>
          {r.kind === "Blocker" && (
            <>
              <p className="helper-note">
                {r.clearedEvidence
                  ? `Блокер снят: ${r.clearedEvidence}`
                  : "Одобрение плана не снимает блокер."}
              </p>
              {r.decision?.outcome.kind === "approve" && !r.clearedEvidence && (
                <div className="agent-assignment-actions agent-assignment-vertical">
                <AgentPicker agents={agents} value={remediationAgentId} onChange={setRemediationAgentId} disabled={busy}/>
                <button
                  className="btn"
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
      <div className="request-id">
        <span>Decision Request</span>
        <code>{r.id}</code>
      </div>
    </article>
  );
}

function ExecutionPanel({
  execution: e,
  requests,
  busy,
  command,
  compact = false,
}: {
  execution?: ProjectState["executions"][number];
  requests: DecisionRequest[];
  busy: boolean;
  command: (p: Payload, n?: string) => Promise<boolean>;
  compact?: boolean;
}) {
  if (!e)
    return <div className="execution-empty">Исполнение ещё не начато.</div>;
  const blocking = requests.some(
    (r) =>
      r.executionId === e.id &&
      ((r.state === "pending" && r.blockingScope === "execution") ||
        (r.kind === "Blocker" && !r.clearedEvidence) ||
        (r.state === "resolved" &&
          r.blockingScope === "execution" &&
          r.decision?.outcome.kind === "reject")),
  );
  return (
    <section className={`execution-panel ${compact ? "compact" : ""}`}>
      <div className="section-heading">
        <h3>Исполнение</h3>
        {!compact && <span className="small-tag">{e.agentId===AGENT_ID?'SIMULATION':'MCP AGENT'}</span>}
      </div>
      <Status state={e.state} />
      {!compact && <code>{e.id}</code>}
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
      {(e.state === "waiting_for_human" || e.state === "paused") &&
        !e.resumeAuthorized && (
          <button
            className="btn btn-small btn-full"
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
          className="btn btn-small btn-full"
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
          className="btn btn-small btn-full"
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
    <div className="reality-switch">
      <div className="segmented">
        <button
          className={value === "history" ? "selected" : ""}
          onClick={() => onChange("history")}
        >
          <History size={14} />
          История
        </button>
        <button
          className={value === "graph" ? "selected" : ""}
          onClick={() => onChange("graph")}
        >
          <Network size={14} />
          Причинный граф
        </button>
      </div>
      <p>
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
}: {
  state: ProjectState;
  specId: string | null;
  expanded?: boolean;
}) {
  const events = state.events
    .filter((e) => !specId || e.specId === specId)
    .toReversed();
  return (
    <div className={`timeline ${expanded ? "expanded" : ""}`}>
      {events.length ? (
        events.map((e) => (
          <article className="timeline-item" key={e.id}>
            <div className={`timeline-icon actor-${e.actor.kind}`}>
              {e.actor.kind === "human" ? (
                <ShieldCheck size={15} />
              ) : e.type.includes("Decision") ? (
                <CircleDot size={15} />
              ) : (
                <Code2 size={15} />
              )}
            </div>
            <div className="timeline-body">
              <div className="timeline-meta">
                <strong>
                  {eventLabels[e.type] ??
                    e.type.replace(/([A-Z])/g, " $1").trim()}
                </strong>
                <time>{shortDate(e.occurredAt)}</time>
              </div>
              <p>
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
              <div className="timeline-tags">
                <span className="mono">#{e.version}</span>
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
                <details>
                  <summary>Событие JSON</summary>
                  <pre>{JSON.stringify(e, null, 2)}</pre>
                </details>
              )}
            </div>
          </article>
        ))
      ) : (
        <Empty icon={<History size={28} />}>
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
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={ref}
      >
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
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
      className="modal-form"
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
      <label className="form-label">
        Название
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={180}
          placeholder="Например: показать ответы человека в истории"
        />
      </label>
      <label className="form-label">
        Цель
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          required
          rows={3}
          placeholder="Что должно измениться для человека?"
        />
      </label>
      <label className="form-label">
        Definition of Done
        <span className="input-hint">Один проверяемый критерий на строку</span>
        <textarea
          value={dod}
          onChange={(e) => setDod(e.target.value)}
          required
          rows={4}
          placeholder="Ответ человека виден в истории спеки\nПовтор команды не создаёт второй ответ"
        />
      </label>
      <label className="form-label">
        Ограничения
        <textarea
          value={constraints}
          onChange={(e) => setConstraints(e.target.value)}
          rows={2}
        />
      </label>
      <p className="helper-note">
        Содержание сохраняется неизменяемой ревизией. Активация — отдельное
        действие человека.
      </p>
      {baseChanged && <p role="alert">Ревизия изменилась. Текст черновика сохранён; проверьте новое ожидание перед созданием следующей ревизии.</p>}
      {!baseChanged&&baseVersion!==version&&<p className="helper-note">Проект изменился после начала ввода. <button type="button" className="text-btn" onClick={()=>setBaseVersion(version)}>Обновить версию после проверки</button></p>}
      <button
        className="btn btn-primary"
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
      className="modal-form"
      onSubmit={(e) => {
        e.preventDefault();
        if(baseChanged||busy)return;
        void onSubmit(evidence,{specId:spec.id,revisionId:revision.id,expectedVersion:baseVersion});
      }}
    >
      <p className="helper-note">
        {spec.humanId} · ревизия {revision.revision}. Укажите основание проверки
        каждого обязательного критерия. Успех агента сам по себе не означает
        приёмку.
      </p>
      {revision.dod.map((c, i) => (
        <label className="form-label" key={c.id}>
          <span>
            {i + 1}. {c.text}
          </span>
          <textarea
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
      {baseChanged&&<p role="alert">Ревизия изменилась. Основания по r{revision.revision} сохранены для проверки и не перенесены на новое ожидание.</p>}
      {!baseChanged&&baseVersion!==version&&<p className="helper-note">Проект изменился после открытия приёмки. <button type="button" className="text-btn" onClick={()=>setBaseVersion(version)}>Обновить версию после проверки</button></p>}
      <button
        className="btn btn-primary"
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
      className="modal-form"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(from, to);
      }}
    >
      <p>
        Связь A → B означает, что B требует принятого результата A. Сервер
        отклоняет циклы с указанием пути.
      </p>
      <label className="form-label">
        A · Предшествующая спека
        <select value={from} onChange={(e) => setFrom(e.target.value)} required>
          {specs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.humanId} — {s.title}
            </option>
          ))}
        </select>
      </label>
      <label className="form-label">
        B · Зависимая спека
        <select value={to} onChange={(e) => setTo(e.target.value)} required>
          {specs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.humanId} — {s.title}
            </option>
          ))}
        </select>
      </label>
      <button
        className="btn btn-primary"
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
          <div className="eyebrow">ОБОСНОВАННЫЕ РЕШЕНИЯ</div>
          <h1>Методология и источники</h1>
          <p>Практики, которые определяют поведение прототипа.</p>
        </div>
      </div>
      <div className="methodology-intro">
        <BookOpen size={24} />
        <div>
          <h2>От литературы — к проверяемым правилам</h2>
          <p>
            Выбранные принципы применены к Human View. Ouro не объявляется
            BPMN-редактором или полной реализацией SCXML.
          </p>
        </div>
      </div>
      <div className="methodology-articles">
        {sources.map((s, i) => (
          <article key={s.title}>
            <span className="methodology-number">0{i + 1}</span>
            <div>
              <h2>{s.title}</h2>
              <p>{s.text}</p>
              <div className="source-links">
                {s.links.map(([title, url]) => (
                  <a href={url} target="_blank" rel="noreferrer" key={url}>
                    {title}
                    <ArrowUpRight size={13} />
                  </a>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="methodology-footnote">
        <h3>Границы прототипа</h3>
        <p>
          MCP-совместимые агенты подключаются через stdio или Streamable HTTP;
          симулятор доступен отдельно для учебных попыток. Интеграция Meridian и
          полноценный SSO остаются следующим этапом. Структура интерфейса основана на
          Ouro.pen, визуальные токены — на Meridian в Figma. Разобранные
          источники, компромиссы и критерии проверки находятся в документации
          репозитория.
        </p>
        <a
          className="btn"
          target="_blank"
          rel="noreferrer"
          href="https://github.com/QahNaaRlN/ouro/tree/feat/agent-connect/docs"
        >
          Открыть документацию
          <ArrowUpRight size={15} />
        </a>
      </div>
    </>
  );
}
