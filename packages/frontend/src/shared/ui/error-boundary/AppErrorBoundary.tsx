'use client';

import {Component,type ReactNode} from 'react';
import type {AppError,ErrorReporterPort} from '../../../../../client/src/ports';
import {captureClientError,normalizeAppError} from '../../../../../client/src/lifecycle/client-error-reporting';

let nextBoundary=0;
/** Перехватывает только ошибки клиентского рендера потомков; runtime и UNKNOWN intents остаются у родителя. */
export class AppErrorBoundary extends Component<{children:ReactNode;reporter?:ErrorReporterPort},{error:AppError|null}>{
 state:{error:AppError|null}={error:null};
 private readonly occurrenceId='render:'+String(++nextBoundary);
 static getDerivedStateFromError(error:unknown){return {error:normalizeAppError(error)};}
 componentDidCatch(error:unknown){captureClientError(error,{reporter:this.props.reporter,reuseOccurrence:true,occurrence:normalized=>({occurrenceId:this.occurrenceId,code:normalized.code,kind:normalized.kind,operation:'render-ui',sourceId:'ouro:browser'})});}
 render(){
  if(!this.state.error)return this.props.children;
  return <section role="alert" className="m-[24px] rounded-[8px] border border-solid border-ouro-border bg-ouro-bg p-[20px] text-ouro-text"><h2 className="m-0 text-[18px] leading-[1.5] font-semibold">Не удалось показать раздел</h2><p className="my-[12px] text-[13px] leading-[1.6]">{this.state.error.message}</p><code className="font-mono text-[11px] [overflow-wrap:anywhere]">{this.state.error.code}</code></section>;
 }
}
