'use client';

import {Children,Fragment,forwardRef,isValidElement,useCallback,useLayoutEffect,useMemo,useRef,useState,type ButtonHTMLAttributes,type ReactNode} from 'react';
import {Select} from '@base-ui/react/select';
import {Check,ChevronDown} from 'lucide-react';
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

export const AppSelect=forwardRef<HTMLButtonElement,AppSelectProps>(function AppSelect({children,value,defaultValue,onValueChange,required,disabled,name,form,autoComplete,id,className='',...props},forwardedRef){
  const options=useMemo(()=>readOptions(children),[children]);
  const [uncontrolled,setUncontrolled]=useState(()=>defaultValue??options.find(option=>!option.disabled)?.value??'');
  const selected=value??uncontrolled;
  const trigger=useRef<HTMLButtonElement|null>(null);
  const [portalContainer,setPortalContainer]=useState<HTMLElement|null>(null);
  const attach=useCallback((node:HTMLButtonElement|null)=>{
    trigger.current=node;
    if(typeof forwardedRef==='function')forwardedRef(node);else if(forwardedRef)forwardedRef.current=node;
  },[forwardedRef]);
  useLayoutEffect(()=>{setPortalContainer(trigger.current?.closest('dialog')??null);},[]);
  return <Select.Root<string> id={id} value={selected} onValueChange={next=>{
    const nextValue=next??'';
    if(value===undefined)setUncontrolled(nextValue);
    onValueChange?.(nextValue);
  }} items={options} required={required} disabled={disabled} name={name} form={form} autoComplete={autoComplete} modal={false}>
    <Select.Trigger {...props} ref={attach} type="button" className={`ouro-select ${className}`} data-base-ui-select="" data-value={selected}>
      <Select.Value className="ouro-select-value">{()=>options.find(option=>option.value===selected)?.label??'Выберите значение'}</Select.Value>
      <Select.Icon className="ouro-select-icon"><ChevronDown size={15} aria-hidden="true"/></Select.Icon>
    </Select.Trigger>
    <Select.Portal container={portalContainer??undefined}>
      <Select.Positioner className="ouro-select-positioner" sideOffset={5} align="start" alignItemWithTrigger={false} positionMethod="fixed" collisionPadding={8}>
        <Select.Popup className="ouro-select-popup">
          <Select.List className="ouro-select-list">
            {options.map(option=><Select.Item key={option.value} value={option.value} label={option.text} disabled={option.disabled} data-value={option.value} className="ouro-select-item">
              <Select.ItemText>{option.label}</Select.ItemText>
              <Select.ItemIndicator className="ouro-select-check"><Check size={15} aria-hidden="true"/></Select.ItemIndicator>
            </Select.Item>)}
          </Select.List>
        </Select.Popup>
      </Select.Positioner>
    </Select.Portal>
  </Select.Root>;
});
