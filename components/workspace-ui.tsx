'use client';

import {createContext,forwardRef,useCallback,useContext,useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode,type TextareaHTMLAttributes} from 'react';
import {Check,ChevronRight,Copy,X} from 'lucide-react';
import {twMerge} from 'tailwind-merge';
import {workspacePresentation as ui} from './workspace-presentation';

/** Оформление элементов этого модуля; общие элементы используют workspacePresentation. */
const presentationSlots={
  dialog:"ws-dialog box-border w-[min(680px,calc(100vw_-_40px))] max-w-[calc(100vw_-_40px)] max-h-[calc(100dvh_-_48px)] overflow-auto rounded-[12px] border border-solid border-ouro-border bg-ouro-subtle p-0 text-ouro-text shadow-[0_24px_80px_#0007] [&:not([open])]:hidden backdrop:bg-[#0009] backdrop:backdrop-blur-[3px] at-most-560:w-[calc(100vw_-_24px)] at-most-560:max-w-[calc(100vw_-_24px)] at-most-560:max-h-[calc(100dvh_-_24px)]",
  accordionTrigger:"ws-accordion-trigger group/accordion flex min-w-0 max-w-full cursor-pointer items-center gap-[7px] border-0 border-none border-current bg-transparent px-0 py-[6px] text-left font-[family-name:inherit] text-[length:inherit] leading-[inherit] font-[number:inherit] text-ouro-text-muted",
} as const;

const AppearanceContext=createContext(false);

/** Включает оформление рабочего места для общих элементов управления, сохраняя внешний legacy Human View. */
export function WorkspaceUIAppearanceProvider({children}:{children:ReactNode}){
  return <AppearanceContext.Provider value>{children}</AppearanceContext.Provider>;
}

/** Позволяет общему элементу выбрать оформление рабочего места без зависимости от DOM-селекторов предков. */
export function useWorkspaceAppearance(){return useContext(AppearanceContext);}

type DialogProps={open:boolean;onClose:()=>void;title:ReactNode;children:ReactNode;footer?:ReactNode;className?:string};
function dialogFocusTargets(dialog:HTMLDialogElement){
  return [...dialog.querySelectorAll<HTMLElement>('a[href],area[href],button,input,select,textarea,iframe,object,embed,[tabindex],[contenteditable=true],audio[controls],video[controls],summary')]
    .filter(node=>node.tabIndex>=0&&!node.matches(':disabled,input[type=hidden]')&&!node.closest('[hidden],[inert],[aria-hidden=true]')&&node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden')
    .sort((a,b)=>a.tabIndex>0&&b.tabIndex>0?a.tabIndex-b.tabIndex:a.tabIndex>0?-1:b.tabIndex>0?1:0);
}

/** Children stay mounted when closed, so drafts and one-time keys are not discarded. */
export function WorkspaceDialog({open,onClose,title,children,footer,className=''}:DialogProps){
  const workspace=useContext(AppearanceContext);
  const dialog=useRef<HTMLDialogElement>(null),opener=useRef<HTMLElement|null>(null),latest=useRef({open,onClose});
  const heading=useId();latest.current={open,onClose};
  const restoreFocus=useCallback(()=>{const target=opener.current;opener.current=null;if(target?.isConnected)target.focus({preventScroll:true});},[]);
  useLayoutEffect(()=>{
    const node=dialog.current;if(!node)return;
    if(open&&!node.open){opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;node.showModal();}
    else if(!open&&node.open){node.close();restoreFocus();}
  },[open,restoreFocus]);
  useEffect(()=>()=>{if(dialog.current?.open)dialog.current.close();restoreFocus();},[restoreFocus]);
  return <dialog ref={dialog} className={twMerge(presentationSlots.dialog,className)} aria-labelledby={heading}
    onKeyDown={event=>{
      if(event.key!=='Tab'||event.altKey||event.ctrlKey||event.metaKey||event.defaultPrevented)return;
      const targets=dialogFocusTargets(event.currentTarget),first=targets[0],last=targets.at(-1),active=document.activeElement;
      if(!first){event.preventDefault();event.currentTarget.focus();return;}
      if(event.shiftKey&&(active===first||!event.currentTarget.contains(active))){event.preventDefault();last!.focus();}
      else if(!event.shiftKey&&(active===last||!event.currentTarget.contains(active))){event.preventDefault();first.focus();}
    }}
    onCancel={event=>{event.preventDefault();latest.current.onClose();}}
    onClose={event=>{if(event.currentTarget.open)return;restoreFocus();if(latest.current.open)latest.current.onClose();}}
    onClick={event=>{if(event.target!==event.currentTarget)return;const bounds=event.currentTarget.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)latest.current.onClose();}}>
    <header className="ws-dialog-heading flex items-center justify-between gap-[20px] border-0 border-b border-solid border-ouro-border px-[24px] pt-[22px] pb-[18px] at-most-560:p-[18px]"><h2 id={heading} className="m-0 text-[19px] leading-[1.4] font-medium tracking-[-0.4px]">{title}</h2><button type="button" className={twMerge(workspace&&ui.button,'ws-icon-button min-h-[30px] min-w-[30px] flex-[0_0_auto] bg-transparent p-[6px]')} aria-label="Закрыть окно" onClick={onClose}><X size={18}/></button></header>
    <div className="ws-dialog-content min-w-0 px-[24px] py-[22px] [&>.ws-panel]:m-0 [&>.ws-panel]:border-0 [&>.ws-panel]:bg-transparent [&>.ws-panel]:p-0 at-most-560:p-[18px]">{children}</div>
    {footer&&<footer className="ws-dialog-footer flex flex-wrap justify-end gap-[10px] border-0 border-t border-solid border-ouro-border px-[24px] py-[16px]">{footer}</footer>}
  </dialog>;
}

export {AppSelect as WorkspaceSelect} from './app-select';

export const WorkspaceTextarea=forwardRef<HTMLTextAreaElement,TextareaHTMLAttributes<HTMLTextAreaElement>>(function WorkspaceTextarea({className='',onInput,value,defaultValue,rows=3,...props},forwardedRef){
  const workspace=useContext(AppearanceContext);
  const textarea=useRef<HTMLTextAreaElement|null>(null);
  const resize=useCallback(()=>{const node=textarea.current;if(!node||!node.getClientRects().length)return;node.style.setProperty('--ouro-textarea-height','auto');const css=getComputedStyle(node);const borders=(parseFloat(css.borderTopWidth)||0)+(parseFloat(css.borderBottomWidth)||0);node.style.setProperty('--ouro-textarea-height',`${node.scrollHeight+borders}px`);},[]);
  const attach=useCallback((node:HTMLTextAreaElement|null)=>{textarea.current=node;if(typeof forwardedRef==='function')forwardedRef(node);else if(forwardedRef)forwardedRef.current=node;},[forwardedRef]);
  useLayoutEffect(resize,[resize,value,defaultValue,rows]);
  useEffect(()=>{const node=textarea.current;if(!node)return;let width=node.getBoundingClientRect().width;const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(()=>{const next=node.getBoundingClientRect().width;if(next!==width){width=next;resize();}});observer?.observe(node);window.addEventListener('resize',resize);return()=>{observer?.disconnect();window.removeEventListener('resize',resize);};},[resize]);
  return <textarea {...props} ref={attach} rows={rows} value={value} defaultValue={defaultValue} className={twMerge('ws-textarea [height:var(--ouro-textarea-height,auto)]',workspace&&ui.textarea,workspace&&'resize-none overflow-hidden max-h-none',className)} onInput={event=>{resize();onInput?.(event);}}/>;
});

type AccordionProps={title:ReactNode;children:ReactNode;open?:boolean;defaultOpen?:boolean;onOpenChange?:(open:boolean)=>void;className?:string;
  /** Локальное оформление кнопки раскрытия имеет приоритет над общими defaults. */
  triggerClassName?:string;
  /** Сохраняет локальные отступы контейнера раскрытия, включая его закрытое состояние. */
  readonly gridClassName?:string;
};
export function WorkspaceAccordion({title,children,open,defaultOpen=false,onOpenChange,className='',triggerClassName='',gridClassName=''}:AccordionProps){
  const workspace=useContext(AppearanceContext);
  const [localOpen,setLocalOpen]=useState(defaultOpen),expanded=open??localOpen,id=useId();
  return <section className={twMerge('ws-accordion min-w-0',workspace&&'my-[14px]',className)}>
    <button type="button" className={twMerge(workspace&&ui.button,presentationSlots.accordionTrigger,workspace&&'justify-start font-normal',triggerClassName)} aria-expanded={expanded} aria-controls={id} onClick={()=>{if(open===undefined)setLocalOpen(!expanded);onOpenChange?.(!expanded);}}><ChevronRight className="shrink-0 transition-transform duration-[180ms] ease-[ease] group-aria-expanded/accordion:rotate-90 motion-reduce:transition-none" size={15} aria-hidden="true"/>{title}</button>
    <div className={twMerge('ws-accordion-grid grid grid-rows-[0fr] transition-[grid-template-rows] duration-[200ms] ease-[ease] data-[open=true]:grid-rows-[1fr] motion-reduce:transition-none',gridClassName)} data-open={expanded} aria-hidden={!expanded} inert={!expanded}><div className="ws-accordion-clip min-h-0 overflow-hidden"><div className="ws-accordion-content pt-[10px]" id={id}>{children}</div></div></div>
  </section>;
}

export function WorkspaceCopyValue({value,label,displayValue,className=''}:{value:string;label?:string;displayValue?:string;className?:string}){
  const workspace=useContext(AppearanceContext);
  const [copied,setCopied]=useState<string|null>(null),[failed,setFailed]=useState<string|null>(null);
  const statusId=useId(),fullValueId=useId(),revealFullValue=failed===value&&displayValue!==undefined&&displayValue!==value;
  const copy=async()=>{setCopied(null);setFailed(null);try{await navigator.clipboard.writeText(value);setCopied(value);}catch{setFailed(value);}};
  return <span className={twMerge('ws-copy-value',workspace&&'inline-flex min-w-0 max-w-full flex-wrap items-center gap-[8px]',className)}><span className={twMerge('ws-copy-content',workspace&&'flex min-w-0 flex-col gap-[3px] [overflow-wrap:anywhere]')}>{label&&<span className={twMerge('ws-copy-label',workspace&&'text-[11px] text-ouro-text-muted')}>{label}</span>}<code className={workspace?ui.code:undefined}>{displayValue??value}</code></span><button type="button" className={twMerge('ws-icon-button',workspace&&ui.button,workspace&&'min-h-[30px] min-w-[30px] flex-[0_0_auto] bg-transparent p-[6px]')} aria-label={`Копировать ${label??'значение'}`} aria-describedby={failed===value?`${statusId}${revealFullValue?' '+fullValueId:''}`:undefined} onClick={()=>void copy()}>{copied===value?<Check size={15}/>:<Copy size={15}/>}</button><span id={statusId} className={failed===value?twMerge('ws-copy-error',workspace&&'basis-full text-[11px] text-[color:var(--negative)]'):'ws-visually-hidden sr-only'} role="status">{failed===value?'Не удалось скопировать. Выделите текст вручную.':copied===value?'Скопировано':''}</span>{revealFullValue&&<code id={fullValueId} className={twMerge('ws-copy-full-value',workspace&&ui.code,workspace&&'basis-full whitespace-pre-wrap [overflow-wrap:anywhere] select-all')}>{value}</code>}</span>;
}
