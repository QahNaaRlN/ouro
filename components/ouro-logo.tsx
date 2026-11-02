'use client';

import {useEffect,useRef} from 'react';
import {ouroLogoShape,OURO_LOGO_PERIOD_SECONDS} from '@/lib/ouro-logo-geometry';

type OuroLogoProps = {
  size?: number;
  className?: string;
};
const rest=ouroLogoShape(0);

/** The surrounding home link supplies the visible name and accessible label. */
export default function OuroLogo({size = 28, className}: OuroLogoProps) {
  const svg=useRef<SVGSVGElement>(null),body=useRef<SVGPathElement>(null),head=useRef<SVGPathElement>(null),eye=useRef<SVGPathElement>(null);
  useEffect(()=>{
    const mark=svg.current,owner=mark?.closest('a[href],button');
    if(!mark||!(owner instanceof HTMLElement))return;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    let pointer=owner.matches(':hover'),focused=owner.contains(document.activeElement),phase=0,last=0,frame=0;
    const canRun=()=>!reduced.matches&&document.visibilityState!=='hidden'&&(pointer||focused);
    const stop=()=>{cancelAnimationFrame(frame);frame=0;last=0;mark.setAttribute('data-motion',reduced.matches?'reduced':'idle');};
    const paint=()=>{const shape=ouroLogoShape(phase);body.current?.setAttribute('d',shape.body);head.current?.setAttribute('d',shape.head);eye.current?.setAttribute('d',shape.eye);mark.setAttribute('data-head-x',shape.headPoint.x.toFixed(3));mark.setAttribute('data-head-y',shape.headPoint.y.toFixed(3));};
    const tick=(now:number)=>{
      frame=0;if(!canRun()){stop();return;}
      if(last)phase=(phase+Math.min(.05,(now-last)/1000))%OURO_LOGO_PERIOD_SECONDS;
      last=now;paint();frame=requestAnimationFrame(tick);
    };
    const sync=()=>{if(canRun()){if(!frame){last=0;mark.setAttribute('data-motion','running');frame=requestAnimationFrame(tick);}}else stop();};
    const enter=()=>{pointer=true;sync();},leave=()=>{pointer=false;sync();},focus=()=>{focused=true;sync();};
    const blur=(event:FocusEvent)=>{focused=event.relatedTarget instanceof Node&&owner.contains(event.relatedTarget);sync();};
    const visibility=()=>{pointer=owner.matches(':hover');focused=owner.contains(document.activeElement);sync();};
    owner.addEventListener('pointerenter',enter);owner.addEventListener('pointerleave',leave);owner.addEventListener('focusin',focus);owner.addEventListener('focusout',blur);
    reduced.addEventListener('change',sync);document.addEventListener('visibilitychange',visibility);sync();
    return()=>{stop();owner.removeEventListener('pointerenter',enter);owner.removeEventListener('pointerleave',leave);owner.removeEventListener('focusin',focus);owner.removeEventListener('focusout',blur);reduced.removeEventListener('change',sync);document.removeEventListener('visibilitychange',visibility);};
  },[]);
  return (
    <svg
      ref={svg}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      width={size}
      height={size}
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-motion="idle"
    >
      <path ref={body} d={rest.body} fill="currentColor" data-ouro-body=""/>
      <path ref={head} d={rest.head} fill="currentColor" data-ouro-head=""/>
      <path ref={eye} d={rest.eye} fill="var(--bg,#101315)" display={size<40?'none':undefined} data-ouro-eye=""/>
    </svg>
  );
}
