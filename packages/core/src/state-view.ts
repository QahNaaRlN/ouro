import { emptyState, replay } from './engine';
import type { DomainEvent, ProjectState } from './types';

export type StateAxis = 'roadmap' | 'spec' | 'execution' | 'request';
export type StateDescription = { id:string; label:string; description:string; terminal?:boolean; reserved?:boolean };
export type TransitionDescription = { id:string; from:string; to:string; label:string; actor:'human'|'agent'|'system'|'mixed'; guard:string };
export type StateChange = { from:string|null; to:string; eventId:string; eventType:string; version:number; actor:DomainEvent['actor'] };
export type StateNotice = { code:string; text:string };
export type StateSelection = { axis:StateAxis; specId?:string|null; executionId?:string; requestId?:string };
export type StateView = { axis:StateAxis; title:string; entityId:string|null; current:string|null; states:StateDescription[]; transitions:TransitionDescription[]; history:StateChange[]; notices:StateNotice[] };
const edge=(from:string,to:string,label:string,actor:TransitionDescription['actor'],guard:string):TransitionDescription=>({id:`${from}:${to}`,from,to,label,actor,guard});

/** Presentation metadata explains possibilities; the command engine remains the authority. */
export const STATE_MODELS: Record<StateAxis,{title:string;states:StateDescription[];transitions:TransitionDescription[]}> = {
  roadmap:{title:'Дорожная карта',states:[
    {id:'draft',label:'Черновик',description:'Карта ещё не разрешает исполнение.'},
    {id:'active',label:'Активна',description:'Работа может быть разрешена при соблюдении остальных условий.'},
    {id:'frozen',label:'Заморожена',description:'Новые старты запрещены; незавершённым попыткам запрошена остановка. ACK приходит отдельно.'},
    {id:'archived',label:'В архиве',description:'Работа завершена, карта доступна для чтения.',terminal:true},
  ],transitions:[
    edge('draft','active','Активировать','human','В карте есть хотя бы одна спецификация.'),
    edge('draft','archived','Архивировать','human','Все попытки завершены.'),
    edge('active','frozen','Заморозить','human','Остановка попыток запрашивается отдельно от их фактического ACK.'),
    edge('active','archived','Архивировать','human','Все попытки завершены.'),
    edge('frozen','active','Возобновить карту','human','В карте есть спецификации; разрешение каждой попытки и её ACK остаются отдельными.'),
    edge('frozen','archived','Архивировать','human','Все попытки завершены.'),
  ]},
  execution:{title:'Исполнение',states:[
    {id:'queued',label:'В очереди',description:'Человек разрешил одну попытку. Агент ещё не подтвердил фактический запуск.'},
    {id:'running',label:'Выполняется',description:'Агент подтвердил запуск или продолжение. Запрос остановки сам по себе не меняет это состояние.'},
    {id:'waiting_for_human',label:'Ожидает человека',description:'Затронутая работа ожидает решения и отдельного разрешения продолжения с ACK.'},
    {id:'paused',label:'Приостановлено',description:'Агент подтвердил фактическую остановку.'},
    {id:'succeeded',label:'Попытка успешна',description:'Агент предъявил результат и evidence. Приёмка DoD человеком остаётся отдельной.',terminal:true},
    {id:'failed',label:'Ошибка попытки',description:'Агент сообщил неуспешный результат с evidence.',terminal:true},
    {id:'cancelled',label:'Отменено',description:'Человек отменил ещё не начатую либо подтверждённо остановленную попытку.',terminal:true},
    {id:'skipped',label:'Пропущено',description:'Человек пропустил попытку до запуска, указав причину.',terminal:true},
  ],transitions:[
    edge('queued','running','ACK запуска','agent','Есть разрешение человека; карта активна, ревизия актуальна, зависимости приняты и блокировки сняты.'),
    edge('running','waiting_for_human','Блокирующий запрос','agent','Question/Fork/Blocker относится к назначенной актуальной ревизии и блокирует эту попытку.'),
    edge('waiting_for_human','running','ACK продолжения','agent','Человек отдельно разрешил продолжение; остальные блокировки сняты, активная ревизия и зависимости проверены.'),
    edge('paused','running','ACK продолжения','agent','Есть новое разрешение человека, актуальный контракт и отсутствуют блокировки.'),
    ...['queued','running','waiting_for_human'].map(from=>edge(from,'paused','ACK остановки','agent','Есть запрос остановки от человека либо системы; ACK подтверждает фактическую остановку.')),
    edge('running','succeeded','Результат + evidence','agent','Попытка выполняется по разрешённому актуальному контракту, без stopRequested и открытых блокировок.'),
    ...['queued','running','waiting_for_human','paused'].map(from=>edge(from,'failed','Ошибка + evidence','agent','Попытка ещё не завершена; предъявлено основание неуспеха.')),
    ...['queued','paused'].map(from=>edge(from,'cancelled','Отменить с причиной','human','Попытка не начата либо её остановка уже подтверждена.')),
    edge('queued','skipped','Пропустить с причиной','human','Попытка ещё находится в очереди.'),
  ]},
  spec:{title:'Спецификация',states:[
    {id:'idea',label:'Идея',description:'Черновик ожидания без активной ревизии.'},
    {id:'specified',label:'Специфицировано',description:'Ревизия активирована. Подтверждённого начала её основной попытки ещё нет.'},
    {id:'in_progress',label:'В работе',description:'Есть подтверждённое начало актуальной основной попытки. Даже её успех не принимает DoD.'},
    {id:'blocked',label:'Заблокировано',description:'В актуальном контексте есть ожидание, пауза, блокер или перестала быть принятой обязательная зависимость.'},
    {id:'done',label:'Принято',description:'Человек отдельно принял каждый обязательный критерий DoD с evidence.'},
    {id:'invalidated',label:'Неактуально',description:'Человек признал цель неактуальной; новая цель требует новой спецификации.',terminal:true},
  ],transitions:[
    edge('idea','specified','Активировать ревизию','human','Активируется проверенный snapshot ожидания; создание черновика само его не активирует.'),
    edge('specified','in_progress','Подтверждённый старт','system','Агент подтвердил начало актуальной основной попытки.'),
    edge('specified','blocked','Ожидание / пауза','system','Состояние вычислено из актуальных попыток и блокирующих запросов.'),
    edge('in_progress','blocked','Появилась блокировка','system','Ожидание, пауза, открытый блокер либо обязательная зависимость больше не принята.'),
    edge('blocked','in_progress','Условия восстановлены','system','Нет блокировок актуального контекста и есть подтверждённый старт. Решение само по себе не подменяет ACK.'),
    edge('in_progress','done','Принять DoD','human','Актуальная основная попытка успешна, вспомогательные завершены, открытых запросов/блокеров нет; каждый обязательный DoD имеет evidence.'),
    ...['specified','in_progress','blocked','done'].flatMap(from=>['specified','in_progress','blocked'].filter(to=>to!==from).map(to=>edge(from,to,'Активировать другую ревизию','human','Новый активный snapshot сохраняет историю; итоговое состояние вычисляется по фактам именно этой ревизии.'))),
    ...['idea','specified','in_progress','blocked','done'].map(from=>edge(from,'invalidated','Признать неактуальной','human','Человек указал причину; незавершённым попыткам запрошена остановка, без подделки ACK.')),
  ]},
  request:{title:'Запрос решения',states:[
    {id:'pending',label:'Нужно решение',description:'Ожидается явный ответ человека. Отсрочка, время и confidence не закрывают запрос.'},
    {id:'resolved',label:'Решение записано',description:'Человек ответил, выбрал вариант либо отклонил запрос. Применение и разрешение продолжения отдельны.'},
    {id:'superseded',label:'Замещён',description:'Человек активировал другую ревизию. Старый запрос сохранён и автоматически не переносится.',terminal:true},
    {id:'withdrawn',label:'Отозван',description:'Состояние зарезервировано контрактом. Команда отзыва в текущем ядре ещё не реализована.',reserved:true},
  ],transitions:[
    edge('pending','resolved','Ответ / выбор / отклонение','human','Тип outcome соответствует Question/Fork/Blocker; выбранный option существует, ревизия актуальна.'),
    edge('pending','superseded','Другая активная ревизия','system','Человек активировал другую ревизию спеки; история запроса сохраняется.'),
  ]},
};

// Different causes can have the same pair of states; combine their explanations in one edge.
for(const model of Object.values(STATE_MODELS)) {
  const combined=new Map<string,TransitionDescription>();
  for(const transition of model.transitions) {
    const prior=combined.get(transition.id);
    if(prior){prior.label+=` / ${transition.label}`;prior.guard+=` Или: ${transition.guard}`;if(prior.actor!==transition.actor)prior.actor='mixed';}
    else combined.set(transition.id,{...transition});
  }
  model.transitions=[...combined.values()];
}

type HistoryIndex=Map<string,StateChange[]>;
const historyCache=new WeakMap<DomainEvent[],HistoryIndex>();
function stateEntries(state:ProjectState):Array<[string,string]> {
  return [[`roadmap:${state.roadmap.id}`,state.roadmap.state],...state.specs.map(s=>[`spec:${s.id}`,s.state] as [string,string]),...state.executions.map(e=>[`execution:${e.id}`,e.state] as [string,string]),...state.requests.map(r=>[`request:${r.id}`,r.state] as [string,string])];
}
function histories(state:ProjectState):HistoryIndex {
  const cached=historyCache.get(state.events);if(cached)return cached;
  const result:HistoryIndex=new Map();
  let previous=new Map(stateEntries(emptyState(state.projectId)));
  const prefix:DomainEvent[]=[];
  // The authoritative replay handles indirect changes too (e.g. a prerequisite becoming invalid).
  // No second state machine is maintained by this visualization.
  for(const event of state.events) {
    prefix.push(event);
    const snapshot=replay(prefix,state.projectId);
    const current=new Map(stateEntries(snapshot));
    for(const [key,to] of current) {
      const from=previous.get(key)??null;
      if(from!==to){const changes=result.get(key)??[];changes.push({from,to,eventId:event.id,eventType:event.type,version:event.version,actor:event.actor});result.set(key,changes);}
    }
    previous=current;
  }
  historyCache.set(state.events,result);return result;
}

export function buildStateView(state:ProjectState,selection:StateSelection):StateView {
  const selectedExecution=selection.executionId?state.executions.find(e=>e.id===selection.executionId):state.executions.findLast(e=>!selection.specId||e.specId===selection.specId);
  const spec=selection.specId?state.specs.find(s=>s.id===selection.specId):selectedExecution?state.specs.find(s=>s.id===selectedExecution.specId):state.specs[0];
  const request=selection.requestId?state.requests.find(r=>r.id===selection.requestId):state.requests.findLast(r=>selection.executionId?r.executionId===selection.executionId:spec?r.specId===spec.id:true);
  const entity=selection.axis==='roadmap'?state.roadmap:selection.axis==='spec'?spec:selection.axis==='execution'?selectedExecution:request;
  const model=STATE_MODELS[selection.axis];
  const notices:StateNotice[]=[];
  if(selection.axis==='execution'&&selectedExecution) {
    if(selectedExecution.stopRequested)notices.push({code:'awaiting_stop_ack',text:'Остановка запрошена. Фактическая остановка ожидает ACK агента.'});
    if(selectedExecution.resumeAuthorized)notices.push({code:selectedExecution.state==='queued'?'awaiting_start_ack':'awaiting_resume_ack',text:selectedExecution.state==='queued'?'Запуск разрешён человеком. Ожидается ACK фактического начала.':'Продолжение разрешено человеком. Состояние изменится только после ACK агента.'});
    const decisions=state.requests.filter(r=>r.executionId===selectedExecution.id&&r.state==='resolved'&&r.decision?.outcome.kind!=='reject'&&!r.decision?.appliedAt);
    if(decisions.length)notices.push({code:'awaiting_decision_application',text:`Решений без подтверждения применения: ${decisions.length}. Запись решения не подтверждает его исполнение.`});
    if(selectedExecution.state==='succeeded')notices.push({code:'result_is_not_acceptance',text:'Успех попытки предъявлен агентом. Приёмка DoD спеки фиксируется отдельным человеческим решением.'});
  }
  if(selection.axis==='request'&&request) {
    if(request.deferredUntil)notices.push({code:'deferred',text:`Запрос отложен до ${request.deferredUntil}. Отсрочка не является ответом.`});
    if(request.decision) {
      const outcome=request.decision.outcome;
      notices.push({code:'decision_outcome',text:outcome.kind==='reject'?`Отклонено: ${outcome.reason}`:outcome.kind==='answer'?`Ответ человека: ${outcome.answer}`:`Выбран вариант: ${request.options.find(o=>o.id===outcome.chosenOptionId)?.title??outcome.chosenOptionId}`});
      if(outcome.kind!=='reject')notices.push({code:request.decision.appliedAt?'decision_applied':'awaiting_application',text:request.decision.appliedAt?'Агент отдельно подтвердил применение решения.':'Применение решения агентом ещё не подтверждено.'});
    }
    if(request.kind==='Blocker')notices.push({code:request.clearedEvidence?'blocker_cleared':'blocker_open',text:request.clearedEvidence?`Устранение подтверждено: ${request.clearedEvidence}`:'Одобрение плана не устраняет препятствие. Нужна отдельная успешная remediation и evidence.'});
  }
  return {axis:selection.axis,title:model.title,entityId:entity?.id??null,current:entity?.state??null,states:model.states,transitions:model.transitions,history:entity?(histories(state).get(`${selection.axis}:${entity.id}`)??[]):[],notices};
}
