'use client';

import {Children,Fragment,createContext,forwardRef,isValidElement,useCallback,useContext,useId,useLayoutEffect,useMemo,useRef,useState,type ButtonHTMLAttributes,type ReactNode} from 'react';
import {Select} from '@base-ui/react/select';
import {Combobox} from '@base-ui/react/combobox';
import {Check,ChevronDown,Search,X} from 'lucide-react';
import {twMerge} from 'tailwind-merge';
import {selectAvailability} from '../lib/select-availability';

/** Классы примитива сохраняют оформление; hook-классы ouro-select не владеют стилями. */
const selectClasses={
  trigger:'box-border inline-flex min-w-0 max-w-full cursor-pointer items-center justify-between gap-3 rounded-[var(--radius,6px)] border border-solid border-ouro-control bg-ouro-bg px-[11px] py-[9px] text-left align-middle font-[family-name:inherit] text-[length:inherit] leading-[inherit] font-[number:inherit] text-ouro-text [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ouro-text focus-visible:outline-offset-[3px] disabled:cursor-not-allowed disabled:opacity-45',
  value:'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap',
  icon:'inline-flex flex-[0_0_auto] items-center text-ouro-text-muted transition-transform duration-[150ms] ease-[ease] group-data-[popup-open]/ouro-select:rotate-180 motion-reduce:transition-none',
  positioner:'z-[1000] max-w-(--available-width) outline-0',
  popup:'box-border max-h-(--available-height) max-w-[min(var(--available-width),520px)] rounded-[8px] border border-solid border-ouro-control bg-ouro-subtle p-[5px] font-sans text-[13px] leading-[1.5] font-normal text-ouro-text shadow-[0_12px_36px_#0005] outline-0 [transform-origin:var(--transform-origin)] transition-[opacity,transform] duration-[120ms] ease-[ease] data-[starting-style]:-translate-y-[3px] data-[starting-style]:opacity-0 data-[ending-style]:-translate-y-[3px] data-[ending-style]:opacity-0 motion-reduce:transition-none',
  list:'max-h-[min(320px,calc(var(--available-height)_-_12px))] overflow-y-auto overscroll-contain scroll-p-[5px] outline-0',
  searchList:'min-h-0 max-h-[min(320px,calc(var(--available-height)_-_65px))]',
  searchPopup:'flex min-w-[max(var(--anchor-width),min(280px,var(--available-width)))] flex-col',
  item:'box-border flex min-h-[35px] cursor-default select-none items-center justify-between gap-[18px] rounded-[4px] px-[10px] py-[8px] outline-0 [overflow-wrap:anywhere] data-[highlighted]:bg-ouro-muted data-[highlighted]:text-ouro-text data-[selected]:text-ouro-positive data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40',
  check:'inline-flex flex-[0_0_15px] items-center text-ouro-positive',
  searchRow:'m-[2px_2px_5px] flex flex-none items-center gap-[7px] rounded-[5px] border border-solid border-ouro-control bg-ouro-bg px-[8px] text-ouro-text-muted focus-within:border-ouro-positive focus-within:shadow-[0_0_0_1px_var(--positive)]',
  search:'box-border w-full min-w-0 rounded-none border-0 bg-transparent px-0 py-[8px] font-[family-name:inherit] text-[length:inherit] leading-[inherit] font-[number:inherit] text-ouro-text shadow-none outline-0 placeholder:text-ouro-text-muted placeholder:opacity-100',
  clear:'inline-flex h-[28px] w-[26px] flex-none cursor-pointer items-center justify-center rounded-[4px] border-0 bg-transparent p-0 text-ouro-text-muted hover:bg-ouro-muted hover:text-ouro-text focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ouro-positive focus-visible:outline-offset-[1px]',
  message:'px-[10px] py-[9px] font-[family-name:inherit] text-[length:inherit] leading-[inherit] font-[number:inherit] whitespace-normal text-ouro-text-muted',
  disabledReason:'mt-[4px] block font-sans text-[12px] leading-[1.5] font-normal whitespace-normal text-ouro-text-muted',
};

const AppearanceContext=createContext('');

/** Поставщик общих классов выбора для оболочки; локальный className поля имеет приоритет. */
export function AppSelectAppearanceProvider({triggerClassName,children}:{triggerClassName:string;children:ReactNode}){
  return <AppearanceContext.Provider value={triggerClassName}>{children}</AppearanceContext.Provider>;
}

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
  const appearance=useContext(AppearanceContext);
  const options=useMemo(()=>readOptions(children),[children]);
  const items=useMemo(()=>Combobox.createItems(options,{getValue:option=>option.value,getLabel:option=>option.text}),[options]);
  const [uncontrolled,setUncontrolled]=useState(()=>defaultValue??options.find(option=>!option.disabled)?.value??'');
  const selected=value??uncontrolled;
  const selectedLabel=options.find(option=>option.value===selected)?.label??'Выберите значение';
  const availability=selectAvailability(options,required);
  const unavailableReason=availability==='available'?null:emptyReason??(availability==='no-options'?'Нет вариантов для выбора.':'Все варианты сейчас недоступны.');
  const reasonId=useId(),showDisabledReason=disabled&&availability!=='available';
  const description=[props['aria-describedby'],showDisabledReason?reasonId:null].filter(Boolean).join(' ')||undefined;
  const disabledDescription=showDisabledReason?<span id={reasonId} className={`ouro-select-disabled-reason ${selectClasses.disabledReason}`}>{unavailableReason}</span>:null;
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
      <Combobox.Trigger {...props} aria-describedby={description} ref={attach} type="button" className={twMerge('ouro-select group/ouro-select',selectClasses.trigger,appearance,className)} data-base-ui-select="" data-searchable="" data-value={selected}>
        <span className={`ouro-select-value ${selectClasses.value}`}><Combobox.Value>{()=>selectedLabel}</Combobox.Value></span>
        <Combobox.Icon className={`ouro-select-icon ${selectClasses.icon}`}><ChevronDown size={15} aria-hidden="true"/></Combobox.Icon>
      </Combobox.Trigger>
      <Combobox.Portal container={portalContainer??undefined}>
        <Combobox.Positioner className={`ouro-select-positioner ${selectClasses.positioner}`} sideOffset={5} align="start" positionMethod="fixed" collisionPadding={8}>
          <Combobox.Popup className={`ouro-select-popup ouro-select-popup--searchable ${selectClasses.popup} ${selectClasses.searchPopup}`} aria-label={props['aria-label']??'Выбор значения'}>
            <div className={`ouro-select-search-row ${selectClasses.searchRow}`}>
              <Search size={15} aria-hidden="true"/>
              <Combobox.Input ref={searchInput} className={`ouro-select-search ${selectClasses.search}`} aria-label={searchLabel} placeholder="Поиск…" autoComplete="off"/>
              {query!==''&&<button type="button" className={`ouro-select-search-clear ${selectClasses.clear}`} aria-label="Очистить поиск" onClick={()=>{setQuery('');searchInput.current?.focus();}}><X size={15} aria-hidden="true"/></button>}
            </div>
            {unavailableReason&&<div className={`ouro-select-message ${selectClasses.message}`} role="status">{unavailableReason}</div>}
            <Combobox.Empty>{availability==='available'&&<div className={`ouro-select-message ${selectClasses.message}`}>По запросу ничего не найдено.</div>}</Combobox.Empty>
            <Combobox.List className={twMerge('ouro-select-list',selectClasses.list,selectClasses.searchList)}>
              {(option:Option)=><Combobox.Item key={option.value} value={option.value} disabled={option.disabled} data-value={option.value} className={`ouro-select-item ${selectClasses.item}`}>
                <span>{option.label}</span>
                <Combobox.ItemIndicator className={`ouro-select-check ${selectClasses.check}`}><Check size={15} aria-hidden="true"/></Combobox.ItemIndicator>
              </Combobox.Item>}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>{disabledDescription}</>;
  }
  return <><Select.Root<string> id={id} value={selected} onValueChange={changeValue} open={open} onOpenChange={changeOpen} items={options} required={required} disabled={disabled} name={name} form={form} autoComplete={autoComplete} modal={false}>
    <Select.Trigger {...props} aria-describedby={description} ref={attach} type="button" className={twMerge('ouro-select group/ouro-select',selectClasses.trigger,appearance,className)} data-base-ui-select="" data-value={selected}>
      <Select.Value className={`ouro-select-value ${selectClasses.value}`}>{()=>selectedLabel}</Select.Value>
      <Select.Icon className={`ouro-select-icon ${selectClasses.icon}`}><ChevronDown size={15} aria-hidden="true"/></Select.Icon>
    </Select.Trigger>
    <Select.Portal container={portalContainer??undefined}>
      <Select.Positioner className={`ouro-select-positioner ${selectClasses.positioner}`} sideOffset={5} align="start" alignItemWithTrigger={false} positionMethod="fixed" collisionPadding={8}>
        <Select.Popup className={`ouro-select-popup ${selectClasses.popup} min-w-(--anchor-width)`}>
          {unavailableReason&&<div className={`ouro-select-message ${selectClasses.message}`} role="status">{unavailableReason}</div>}
          <Select.List className={`ouro-select-list ${selectClasses.list}`}>
            {options.map(option=><Select.Item key={option.value} value={option.value} label={option.text} disabled={option.disabled} data-value={option.value} className={`ouro-select-item ${selectClasses.item}`}>
              <Select.ItemText>{option.label}</Select.ItemText>
              <Select.ItemIndicator className={`ouro-select-check ${selectClasses.check}`}><Check size={15} aria-hidden="true"/></Select.ItemIndicator>
            </Select.Item>)}
          </Select.List>
        </Select.Popup>
      </Select.Positioner>
    </Select.Portal>
  </Select.Root>{disabledDescription}</>;
});
