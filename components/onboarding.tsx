'use client';

import {useCallback,useEffect,useId,useLayoutEffect,useRef,useState,type KeyboardEvent} from 'react';
import './onboarding.css';

type Scope='catalog'|'project';
type Preference={version:1;status:'dismissed'|'completed'};
type Step={target:string;title:string;body:string;optional?:boolean};
type Rect={left:number;top:number;width:number;height:number};
type Geometry={view:Rect;highlight:Rect|null;card:{left:number;top:number};missing:boolean};
const memoryPreferences=new Map<string,Preference>();
const folderTarget='[data-onboarding="folder-input"]';

function readPreference(key:string):Preference|null{
  try{
    const raw=localStorage.getItem(key);if(!raw)return memoryPreferences.get(key)??null;
    const value=JSON.parse(raw) as Partial<Preference>|null;
    return value?.version===1&&(value.status==='dismissed'||value.status==='completed')?value as Preference:null;
  }catch{return memoryPreferences.get(key)??null;}
}
function savePreference(key:string,status:Preference['status']){
  const value:Preference={version:1,status};memoryPreferences.set(key,value);
  try{localStorage.setItem(key,JSON.stringify(value));}catch{/* Learning does not depend on browser storage. */}
}
function stepsFor(scope:Scope,hasFlow:boolean):Step[]{
  if(scope==='catalog')return [
    {target:folderTarget,title:'Выберите папку проекта',body:'Укажите существующую папку на компьютере с Ouro или нажмите «Выбрать папку». Добавление создаёт рабочее место и не меняет ваши файлы. Git не требуется.'},
    {target:'[data-onboarding="saved-projects"]',title:'Возвращайтесь к своим проектам',body:'Открывайте сохранённые папки отсюда. У каждого проекта своя история, задачи и подключения агентов; выбор проекта ничего не запускает.'},
    {target:'[data-onboarding="agent-help"]',title:'Подключите MCP-клиент',body:'Здесь инструкции для Cursor, Claude Code, Claude Desktop и ChatGPT. Само подключение создаётся внутри выбранного проекта. Настройка MCP и начало работы агента — разные шаги.'},
  ];
  return [
    {target:'[aria-label="MCP-клиент"]',title:'Подключите агента',body:'Выберите свой MCP-клиент, зарегистрируйте агента и сохраните одноразовый ключ в отдельный файл. Добавьте готовую конфигурацию в клиент. Регистрация сама не подключает модель и не начинает работу.'},
    {target:'[aria-label="Задача для агента"]',title:'Опишите задачу и готовность',body:'Выберите исполнителя, опишите цель и проверяемые критерии готовности. «Начать работу» назначает попытку. Передайте задание в MCP-клиент; до подтверждения агента попытка остаётся в ожидании.'},
    {target:'[data-onboarding="project-roadmap"] > .ws-section-top',title:'Следите за дорожной картой',body:'Здесь задачи, зависимости и текущие статусы. Выберите спеку на графе или в списке: ниже откроются её ожидание, попытка и подробный процесс. В пустом проекте сначала назначьте работу.'},
    ...(hasFlow?[{target:'[data-onboarding="project-flow"] > .ws-section-top',title:'Откройте процесс выбранной спеки',body:'Здесь блок-схема именно выбранной ревизии и ход её выполнения. Если схема ещё не описана, Ouro прямо сообщает об этом. Предложение агента и активация ревизии требуют отдельных решений человека.',optional:true}]:[]),
    {target:'[aria-label="Вопросы и решения"] > h2',title:'Решайте вопросы и развилки',body:'Агент сообщает вопросы, варианты и блокеры сюда. Ответ человека, подтверждение применения агентом и разрешение продолжения фиксируются отдельно. Итоговую готовность по DoD тоже принимает человек.'},
    {target:'[aria-label="Живая лента событий"] > .ws-section-top',title:'Проверяйте факты в живой ленте',body:'Лента обновляется по подтверждённым событиям Ouro. Проверяйте действия, основания и результаты. Действия IDE не появляются автоматически: агент должен сообщать их через контракт. Обучение не создаёт событий или заданий.'},
  ];
}

export default function WorkspaceOnboarding({scope,hasFlow=false}:{scope:Scope;hasFlow?:boolean}){
  const key=`ouro:onboarding:${scope}:v1`,launcher=useRef<HTMLButtonElement>(null),returnFocus=useRef<HTMLElement|null>(null);
  const [ready,setReady]=useState(false),[preference,setPreference]=useState<Preference|null>(null),[active,setActive]=useState<{steps:Step[];index:number}|null>(null);
  useEffect(()=>{setPreference(readPreference(key));setReady(true);},[key]);
  const remember=useCallback((status:Preference['status'])=>{savePreference(key,status);setPreference({version:1,status});},[key]);
  const start=()=>{
    returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    remember('dismissed');
    const steps=stepsFor(scope,hasFlow).filter(step=>!step.optional||document.querySelector(step.target));
    setActive({steps,index:0});
  };
  const exit=useCallback((completed=false)=>{remember(completed?'completed':'dismissed');setActive(null);},[remember]);
  const restoreFocus=useCallback(()=>{const target=returnFocus.current?.isConnected?returnFocus.current:launcher.current;target?.focus({preventScroll:true});},[]);
  return <>
    <div className="onboarding-entry">
      <button type="button" ref={launcher} onClick={start}>Обучение</button>
      {ready&&!preference&&<section className="onboarding-invitation" aria-label="Знакомство с Ouro">
        <p><strong>Первый раз в Ouro?</strong> Короткий обзор покажет, с чего начать.</p>
        <div className="onboarding-invitation-actions"><button type="button" onClick={start}>Начать обзор</button><button type="button" onClick={()=>remember('dismissed')}>Не сейчас</button></div>
      </section>}
    </div>
    {active&&<GuidedTour steps={active.steps} index={active.index} onStep={index=>setActive(current=>current?{...current,index}:null)} onExit={exit} restoreFocus={restoreFocus}/>}
  </>;
}

function GuidedTour({steps,index,onStep,onExit,restoreFocus}:{steps:Step[];index:number;onStep:(index:number)=>void;onExit:(completed?:boolean)=>void;restoreFocus:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),card=useRef<HTMLElement>(null),heading=useRef<HTMLHeadingElement>(null),opened=useRef(new Set<HTMLDetailsElement>()),id=useId();
  const [geometry,setGeometry]=useState<Geometry|null>(null),step=steps[index];
  useLayoutEffect(()=>{
    const element=dialog.current;if(!element)return;
    const scroll={x:window.scrollX,y:window.scrollY},previousOverflow=document.body.style.overflow;
    element.showModal();document.body.style.overflow='hidden';
    return()=>{
      if(element.open)element.close();
      document.body.style.overflow=previousOverflow;
      for(const details of opened.current)if(details.isConnected)details.open=false;
      window.scrollTo({left:scroll.x,top:scroll.y,behavior:'instant'});
      restoreFocus();
    };
  },[restoreFocus]);
  useLayoutEffect(()=>{
    const element=dialog.current;if(!element)return;
    let frame=0,currentTarget:HTMLElement|null=null;
    const viewport=():Rect=>{const visual=window.visualViewport;return {left:visual?.offsetLeft??0,top:visual?.offsetTop??0,width:visual?.width??window.innerWidth,height:visual?.height??window.innerHeight};};
    const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(value,Math.max(min,max)));
    const measure=()=>{
      frame=0;
      const view=viewport(),margin=16,box=card.current?.getBoundingClientRect(),cardWidth=Math.min(box?.width??360,view.width-margin*2),cardHeight=Math.min(box?.height??270,view.height-margin*2);
      const target=document.querySelector<HTMLElement>(step.target),style=target?getComputedStyle(target):null;
      let bounds=target?.getBoundingClientRect();
      const visible=!!target?.isConnected&&!!bounds?.width&&!!bounds?.height&&style?.visibility!=='hidden'&&style?.display!=='none';
      if(visible&&target&&bounds&&(bounds.bottom<=view.top||bounds.top>=view.top+view.height||bounds.right<=view.left||bounds.left>=view.left+view.width)){
        target.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});bounds=target.getBoundingClientRect();
      }
      if(target!==currentTarget){if(currentTarget)resize.unobserve(currentTarget);currentTarget=target;if(target)resize.observe(target);}
      let highlight:Rect|null=null;
      if(visible&&bounds){
        const left=clamp(bounds.left-7,view.left,view.left+view.width),top=clamp(bounds.top-7,view.top,view.top+view.height),right=clamp(bounds.right+7,view.left,view.left+view.width),bottom=clamp(bounds.bottom+7,view.top,view.top+view.height);
        if(right>left&&bottom>top)highlight={left,top,width:right-left,height:bottom-top};
      }
      let left=view.left+(view.width-cardWidth)/2,top=view.top+(view.height-cardHeight)/2;
      if(highlight){
        const below=highlight.top+highlight.height+14,above=highlight.top-cardHeight-14;
        left=clamp(highlight.left,view.left+margin,view.left+view.width-cardWidth-margin);
        if(below+cardHeight<=view.top+view.height-margin)top=below;
        else if(above>=view.top+margin)top=above;
        else if(highlight.left+highlight.width+cardWidth+28<=view.left+view.width){left=highlight.left+highlight.width+14;top=highlight.top;}
        else if(highlight.left-cardWidth-14>=view.left+margin){left=highlight.left-cardWidth-14;top=highlight.top;}
        else top=below;
      }
      top=clamp(top,view.top+margin,view.top+view.height-cardHeight-margin);
      setGeometry({view,highlight,card:{left,top},missing:!visible});
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
    const resize=new ResizeObserver(schedule);
    if(card.current)resize.observe(card.current);
    const target=document.querySelector<HTMLElement>(step.target);
    if(target){
      for(let ancestor=target.parentElement;ancestor;ancestor=ancestor.parentElement)if(ancestor instanceof HTMLDetailsElement&&!ancestor.open){opened.current.add(ancestor);ancestor.open=true;}
      target.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
    }
    const observer=new MutationObserver(records=>{if(records.some(record=>!element.contains(record.target)))schedule();});
    observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','open','hidden']});
    window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);
    window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
    measure();heading.current?.focus({preventScroll:true});
    return()=>{cancelAnimationFrame(frame);resize.disconnect();observer.disconnect();window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);};
  },[step.target]);
  const trapFocus=(event:KeyboardEvent<HTMLDialogElement>)=>{
    if(event.key!=='Tab')return;
    const controls=Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]);
    const first=controls[0],last=controls.at(-1);if(!first||!last)return;
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===heading.current)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };
  const view=geometry?.view??{left:0,top:0,width:0,height:0},highlight=geometry?.highlight;
  const panes:Rect[]=highlight?[
    {left:view.left,top:view.top,width:view.width,height:highlight.top-view.top},
    {left:view.left,top:highlight.top,width:highlight.left-view.left,height:highlight.height},
    {left:highlight.left+highlight.width,top:highlight.top,width:view.left+view.width-highlight.left-highlight.width,height:highlight.height},
    {left:view.left,top:highlight.top+highlight.height,width:view.width,height:view.top+view.height-highlight.top-highlight.height},
  ]:[view];
  return <dialog ref={dialog} className="onboarding-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} onCancel={event=>{event.preventDefault();onExit();}} onKeyDown={trapFocus}>
    <div className="onboarding-mask" aria-hidden="true">{panes.map((pane,part)=><div key={part} className="onboarding-pane" style={pane}/>)}{highlight&&<div data-onboarding-highlight className="onboarding-highlight" style={highlight}/>}</div>
    <section ref={card} data-onboarding-card className="onboarding-card" style={geometry?{...geometry.card,width:Math.max(0,Math.min(360,geometry.view.width-32)),maxWidth:Math.max(0,geometry.view.width-32),maxHeight:Math.max(0,geometry.view.height-32)}:undefined}>
      <div className="onboarding-card-header"><p className="onboarding-count" aria-live="polite">Шаг {index+1} из {steps.length}</p><button className="onboarding-close" type="button" aria-label="Закрыть обучение" onClick={()=>onExit()}>×</button></div>
      <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>{step.title}</h2><p id={`${id}-body`}>{step.body}</p>
      {geometry?.missing&&<p className="onboarding-unavailable" role="status">Элемент сейчас недоступен. Перейдите дальше или закройте обучение — рабочее место останется доступно.</p>}
      <div className="onboarding-controls"><button type="button" onClick={()=>onExit()} aria-label="Пропустить обучение">Пропустить</button><div><button type="button" onClick={()=>onStep(index-1)} disabled={index===0}>Назад</button><button className="onboarding-next" type="button" onClick={()=>index===steps.length-1?onExit(true):onStep(index+1)}>{index===steps.length-1?'Завершить':'Далее'}</button></div></div>
    </section>
  </dialog>;
}
