'use client';

import {Children,Fragment,forwardRef,isValidElement,useCallback,useId,useLayoutEffect,useMemo,useRef,useState,type ButtonHTMLAttributes,type ReactNode} from 'react';
import {Select} from '@base-ui/react/select';
import {Combobox} from '@base-ui/react/combobox';
import {Check,ChevronDown,Search,X} from 'lucide-react';
import {selectAvailability} from '../lib/select-availability';
import './app-select.css';

type Option={value:string;label:ReactNode;text:string;disabled:boolean};
type OptionProps={value?:string|number;children?:ReactNode;disabled?:boolean;label?:string};
export type AppSelectProps=Omit<ButtonHTMLAttributes<HTMLButtonElement>,'value'|'defaultValue'|'onChange'|'children'|'name'|'form'> & {
  children:ReactNode;
  value?:string;
  defaultValue?:string;
  onValueChange?:(value:string)=>void;
  required?:boolean;
  name?:string;
  form?:string;
  autoComplete?:string;
  /** Defaults to search for lists with at least ten options. */
  searchable?:boolean;
  /** Explains why a list has no choices, or why all its choices are disabled. */
  emptyReason?:ReactNode;
};

function optionText(children:ReactNode):string{
  return Children.toArray(children).map(child=>isValidElement<{children?:ReactNode}>(child)?optionText(child.props.children):typeof child==='string'||typeof child==='number'?String(child):'').join('');
}

/** Existing option declarations are configuration only; Base UI renders every visible option. */
function readOptions(children:ReactNode,inheritedDisabled=false):Option[]{
  return Children.toArray(children).flatMap(child=>{
    if(!isValidElement<OptionProps>(child))return [];
    if(child.type===Fragment)return readOptions(child.props.children,inheritedDisabled);
    if(child.type==='optgroup')return readOptions(child.props.children,inheritedDisabled||!!child.props.disabled);
    if(child.type!=='option')return [];
    const text=child.props.label??optionText(child.props.children);
    return [{value:String(child.props.value??text),label:child.props.label??child.props.children,text,disabled:inheritedDisabled||!!child.props.disabled}];
  });
}

export const AppSelect=forwardRef<HTMLButtonElement,AppSelectProps>(function AppSelect({children,value,defaultValue,onValueChange,required,disabled,name,form,autoComplete,searchable,emptyReason,id,className='',...props},forwardedRef){
  const options=useMemo(()=>readOptions(children),[children]);
  const items=useMemo(()=>Combobox.createItems(options,{getValue:option=>option.value,getLabel:option=>option.text}),[options]);
  const [uncontrolled,setUncontrolled]=useState(()=>defaultValue??options.find(option=>!option.disabled)?.value??'');
  const selected=value??uncontrolled;
  const selectedLabel=options.find(option=>option.value===selected)?.label??'Выберите значение';
  const availability=selectAvailability(options,required);
  const unavailableReason=availability==='available'?null:emptyReason??(availability==='no-options'?'Нет вариантов для выбора.':'Все варианты сейчас недоступны.');
  const reasonId=useId(),showDisabledReason=disabled&&availability!=='available';
  const description=[props['aria-describedby'],showDisabledReason?reasonId:null].filter(Boolean).join(' ')||undefined;
  const disabledDescription=showDisabledReason?<span id={reasonId} className="ouro-select-disabled-reason">{unavailableReason}</span>:null;
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState('');
  const searchInput=useRef<HTMLInputElement|null>(null);
  const trigger=useRef<HTMLButtonElement|null>(null);
  const [portalContainer,setPortalContainer]=useState<HTMLElement|null>(null);
  const attach=useCallback((node:HTMLButtonElement|null)=>{
    trigger.current=node;
    if(typeof forwardedRef==='function')forwardedRef(node);else if(forwardedRef)forwardedRef.current=node;
  },[forwardedRef]);
  useLayoutEffect(()=>{setPortalContainer(trigger.current?.closest('dialog')??null);},[]);
  const changeValue=(next:string|null)=>{
    const nextValue=next??'';
    if(value===undefined)setUncontrolled(nextValue);
    onValueChange?.(nextValue);
  };
  const changeOpen=(next:boolean)=>{setOpen(next);if(next)setQuery('');};
  if(searchable??options.length>=10){
    const searchLabel=props['aria-label']?`Поиск вариантов: ${props['aria-label']}`:'Поиск вариантов';
    return <><Combobox.Root<string,false,Option> id={id} items={items} value={selected} onValueChange={changeValue} open={open} onOpenChange={changeOpen} inputValue={query} onInputValueChange={setQuery} autoHighlight required={required} disabled={disabled} name={name} form={form} autoComplete={autoComplete} modal={false}>
      <Combobox.Trigger {...props} aria-describedby={description} ref={attach} type="button" className={`ouro-select ${className}`} data-base-ui-select="" data-searchable="" data-value={selected}>
        <span className="ouro-select-value"><Combobox.Value>{()=>selectedLabel}</Combobox.Value></span>
        <Combobox.Icon className="ouro-select-icon"><ChevronDown size={15} aria-hidden="true"/></Combobox.Icon>
      </Combobox.Trigger>
      <Combobox.Portal container={portalContainer??undefined}>
        <Combobox.Positioner className="ouro-select-positioner" sideOffset={5} align="start" positionMethod="fixed" collisionPadding={8}>
          <Combobox.Popup className="ouro-select-popup ouro-select-popup--searchable" aria-label={props['aria-label']??'Выбор значения'}>
            <div className="ouro-select-search-row">
              <Search size={15} aria-hidden="true"/>
              <Combobox.Input ref={searchInput} className="ouro-select-search" aria-label={searchLabel} placeholder="Поиск…" autoComplete="off"/>
              {query!==''&&<button type="button" className="ouro-select-search-clear" aria-label="Очистить поиск" onClick={()=>{setQuery('');searchInput.current?.focus();}}><X size={15} aria-hidden="true"/></button>}
            </div>
            {unavailableReason&&<div className="ouro-select-message" role="status">{unavailableReason}</div>}
            <Combobox.Empty>{availability==='available'&&<div className="ouro-select-message">По запросу ничего не найдено.</div>}</Combobox.Empty>
            <Combobox.List className="ouro-select-list">
              {(option:Option)=><Combobox.Item key={option.value} value={option.value} disabled={option.disabled} data-value={option.value} className="ouro-select-item">
                <span>{option.label}</span>
                <Combobox.ItemIndicator className="ouro-select-check"><Check size={15} aria-hidden="true"/></Combobox.ItemIndicator>
              </Combobox.Item>}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>{disabledDescription}</>;
  }
  return <><Select.Root<string> id={id} value={selected} onValueChange={changeValue} open={open} onOpenChange={changeOpen} items={options} required={required} disabled={disabled} name={name} form={form} autoComplete={autoComplete} modal={false}>
    <Select.Trigger {...props} aria-describedby={description} ref={attach} type="button" className={`ouro-select ${className}`} data-base-ui-select="" data-value={selected}>
      <Select.Value className="ouro-select-value">{()=>selectedLabel}</Select.Value>
      <Select.Icon className="ouro-select-icon"><ChevronDown size={15} aria-hidden="true"/></Select.Icon>
    </Select.Trigger>
    <Select.Portal container={portalContainer??undefined}>
      <Select.Positioner className="ouro-select-positioner" sideOffset={5} align="start" alignItemWithTrigger={false} positionMethod="fixed" collisionPadding={8}>
        <Select.Popup className="ouro-select-popup">
          {unavailableReason&&<div className="ouro-select-message" role="status">{unavailableReason}</div>}
          <Select.List className="ouro-select-list">
            {options.map(option=><Select.Item key={option.value} value={option.value} label={option.text} disabled={option.disabled} data-value={option.value} className="ouro-select-item">
              <Select.ItemText>{option.label}</Select.ItemText>
              <Select.ItemIndicator className="ouro-select-check"><Check size={15} aria-hidden="true"/></Select.ItemIndicator>
            </Select.Item>)}
          </Select.List>
        </Select.Popup>
      </Select.Positioner>
    </Select.Portal>
  </Select.Root>{disabledDescription}</>;
});
