'use client';

import {forwardRef,useCallback,useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode,type TextareaHTMLAttributes} from 'react';
import {Check,ChevronRight,Copy,X} from 'lucide-react';
import './workspace-ui.css';

type DialogProps={open:boolean;onClose:()=>void;title:ReactNode;children:ReactNode;footer?:ReactNode;className?:string};
function dialogFocusTargets(dialog:HTMLDialogElement){
  return [...dialog.querySelectorAll<HTMLElement>('a[href],area[href],button,input,select,textarea,iframe,object,embed,[tabindex],[contenteditable=true],audio[controls],video[controls],summary')]
    .filter(node=>node.tabIndex>=0&&!node.matches(':disabled,input[type=hidden]')&&!node.closest('[hidden],[inert],[aria-hidden=true]')&&node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden')
    .sort((a,b)=>a.tabIndex>0&&b.tabIndex>0?a.tabIndex-b.tabIndex:a.tabIndex>0?-1:b.tabIndex>0?1:0);
}

/** Children stay mounted when closed, so drafts and one-time keys are not discarded. */
export function WorkspaceDialog({open,onClose,title,children,footer,className=''}:DialogProps){
  const dialog=useRef<HTMLDialogElement>(null),opener=useRef<HTMLElement|null>(null),latest=useRef({open,onClose});
  const heading=useId();latest.current={open,onClose};
  const restoreFocus=useCallback(()=>{const target=opener.current;opener.current=null;if(target?.isConnected)target.focus({preventScroll:true});},[]);
  useLayoutEffect(()=>{
    const node=dialog.current;if(!node)return;
    if(open&&!node.open){opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;node.showModal();}
    else if(!open&&node.open){node.close();restoreFocus();}
  },[open,restoreFocus]);
  useEffect(()=>()=>{if(dialog.current?.open)dialog.current.close();restoreFocus();},[restoreFocus]);
  return <dialog ref={dialog} className={`ws-dialog ${className}`} aria-labelledby={heading}
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
    <header className="ws-dialog-heading"><h2 id={heading}>{title}</h2><button type="button" className="ws-icon-button" aria-label="Закрыть окно" onClick={onClose}><X size={18}/></button></header>
    <div className="ws-dialog-content">{children}</div>
    {footer&&<footer className="ws-dialog-footer">{footer}</footer>}
  </dialog>;
}

export {AppSelect as WorkspaceSelect} from './app-select';

export const WorkspaceTextarea=forwardRef<HTMLTextAreaElement,TextareaHTMLAttributes<HTMLTextAreaElement>>(function WorkspaceTextarea({className='',onInput,value,defaultValue,rows=3,...props},forwardedRef){
  const textarea=useRef<HTMLTextAreaElement|null>(null);
  const resize=useCallback(()=>{const node=textarea.current;if(!node||!node.getClientRects().length)return;node.style.height='auto';const css=getComputedStyle(node);const borders=(parseFloat(css.borderTopWidth)||0)+(parseFloat(css.borderBottomWidth)||0);node.style.height=`${node.scrollHeight+borders}px`;},[]);
  const attach=useCallback((node:HTMLTextAreaElement|null)=>{textarea.current=node;if(typeof forwardedRef==='function')forwardedRef(node);else if(forwardedRef)forwardedRef.current=node;},[forwardedRef]);
  useLayoutEffect(resize,[resize,value,defaultValue,rows]);
  useEffect(()=>{const node=textarea.current;if(!node)return;let width=node.getBoundingClientRect().width;const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(()=>{const next=node.getBoundingClientRect().width;if(next!==width){width=next;resize();}});observer?.observe(node);window.addEventListener('resize',resize);return()=>{observer?.disconnect();window.removeEventListener('resize',resize);};},[resize]);
  return <textarea {...props} ref={attach} rows={rows} value={value} defaultValue={defaultValue} className={`ws-textarea ${className}`} onInput={event=>{resize();onInput?.(event);}}/>;
});

type AccordionProps={title:ReactNode;children:ReactNode;open?:boolean;defaultOpen?:boolean;onOpenChange?:(open:boolean)=>void;className?:string};
export function WorkspaceAccordion({title,children,open,defaultOpen=false,onOpenChange,className=''}:AccordionProps){
  const [localOpen,setLocalOpen]=useState(defaultOpen),expanded=open??localOpen,id=useId();
  return <section className={`ws-accordion ${className}`}>
    <button type="button" className="ws-accordion-trigger" aria-expanded={expanded} aria-controls={id} onClick={()=>{if(open===undefined)setLocalOpen(!expanded);onOpenChange?.(!expanded);}}><ChevronRight size={15} aria-hidden="true"/>{title}</button>
    <div className="ws-accordion-grid" data-open={expanded} aria-hidden={!expanded} inert={!expanded}><div className="ws-accordion-clip"><div className="ws-accordion-content" id={id}>{children}</div></div></div>
  </section>;
}

export function WorkspaceCopyValue({value,label,displayValue,className=''}:{value:string;label?:string;displayValue?:string;className?:string}){
  const [copied,setCopied]=useState<string|null>(null),[failed,setFailed]=useState<string|null>(null);
  const statusId=useId(),fullValueId=useId(),revealFullValue=failed===value&&displayValue!==undefined&&displayValue!==value;
  const copy=async()=>{setCopied(null);setFailed(null);try{await navigator.clipboard.writeText(value);setCopied(value);}catch{setFailed(value);}};
  return <span className={`ws-copy-value ${className}`}><span className="ws-copy-content">{label&&<span className="ws-copy-label">{label}</span>}<code>{displayValue??value}</code></span><button type="button" className="ws-icon-button" aria-label={`Копировать ${label??'значение'}`} aria-describedby={failed===value?`${statusId}${revealFullValue?' '+fullValueId:''}`:undefined} onClick={()=>void copy()}>{copied===value?<Check size={15}/>:<Copy size={15}/>}</button><span id={statusId} className={failed===value?'ws-copy-error':'ws-visually-hidden'} role="status">{failed===value?'Не удалось скопировать. Выделите текст вручную.':copied===value?'Скопировано':''}</span>{revealFullValue&&<code id={fullValueId} className="ws-copy-full-value">{value}</code>}</span>;
}
