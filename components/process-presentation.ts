import {twMerge} from 'tailwind-merge';
import type {FlowNodeKind} from '@/packages/core/src';

/** Локальные slots схемы не меняют draft/base, runtime или выбранные источники фактов. */
export const processPresentation={
 root:'min-w-0',
 row:'flex items-center justify-between gap-[12px]',
 heading:'mb-[20px] items-start at-most-1000:flex-wrap',
 headingTitle:'mt-[5px] mb-[8px] text-[20px]',
 introduction:'max-w-[550px] text-[12px] text-ouro-text-muted',
 headingAction:'shrink-0',
 empty:'flex min-h-[340px] flex-col items-center justify-center gap-[14px] rounded-[var(--radius)] border border-dashed border-ouro-border p-[32px] text-center text-ouro-text-muted',
 emptyIcon:'text-[var(--text-faint)]',
 emptyTitle:'text-[17px] text-ouro-text',
 draftBar:'mt-[12px] mb-[20px] flex-wrap rounded-[var(--radius)] border border-solid border-ouro-border bg-ouro-subtle p-[16px]',
 draftTitle:'text-[13px]',
 draftActions:'flex-wrap justify-end',
 toolbar:'mt-[16px] mb-[12px] flex-wrap',
 segmented:'mr-auto',
 canvas:'h-[510px] overflow-hidden rounded-[var(--radius)] border border-solid border-ouro-border bg-ouro-bg at-most-1000:h-[450px]',
 outerNode:'h-[172px] w-[248px]',
 node:'flex h-[172px] w-[248px] flex-col rounded-[8px] border border-solid border-ouro-control bg-ouro-subtle p-[15px] text-ouro-text shadow-[0_3px_12px_#0000000a]',
 nodeSelected:'outline-2 outline-solid outline-ouro-text outline-offset-[3px]',
 nodeKind:'mb-[10px] flex items-center gap-[7px] text-[11px] text-ouro-text-muted',
 nodeTitle:'line-clamp-3 text-[14px] leading-[1.4] [overflow-wrap:anywhere]',
 trackedTitle:'line-clamp-2',
 entry:'ml-auto rounded-[3px] bg-ouro-muted px-[4px] py-[1px] font-workspace-mono text-[9px] font-normal [line-height:normal]',
 nodeMeta:'mt-auto flex items-center gap-[5px] pt-[7px] text-[10px] text-ouro-text-muted',
 evidence:'mt-[5px] overflow-hidden text-[10px] text-ellipsis whitespace-nowrap',
 trackedEvidence:'overflow-visible leading-[1.5] whitespace-normal',
 visits:'mt-[3px] text-[9px] text-[var(--text-faint)]',
 legend:'flex flex-wrap items-center gap-[16px] border-b [border-bottom-style:solid] border-b-ouro-border pt-[14px] pb-[18px] text-[11px] text-ouro-text-muted at-most-1000:gap-[10px]',
 legendItem:'flex items-center gap-[6px]',
 legendLine:'w-[18px] border-t-2 [border-top-style:solid] border-t-[var(--graph-edge)]',
 chosenLine:'[border-top-style:dashed] border-t-[var(--attention)]',
 appliedLine:'border-t-[var(--positive)]',
 legendText:'text-[11px]',
 notice:'my-[12px] rounded-[var(--radius)] border border-solid border-[var(--attention)] bg-[var(--attention-surface)] px-[16px] py-[14px] text-[12px] text-[var(--attention)]',
 noticeText:'mt-[5px] mb-[10px]',
 error:'my-[12px] rounded-[var(--radius)] border border-solid border-[var(--negative)] bg-[var(--negative-surface)] p-[14px] text-[12px] text-[var(--negative)]',
 tables:'grid min-w-0 gap-[16px]',
 tableNote:'mt-[4px] block text-[11px] text-ouro-text-muted',
 cell:'max-w-[330px] align-top break-normal whitespace-normal [overflow-wrap:break-word]',
 headerCell:'align-top break-normal whitespace-normal [overflow-wrap:break-word]',
 cellArrow:'mx-[8px] align-middle',
 cellTitle:'block',
 tableButton:'whitespace-nowrap',
 inspector:'mt-[20px] rounded-[var(--radius)] border border-solid border-ouro-border bg-ouro-subtle p-[20px]',
 inspectorHeading:'mb-[16px] flex-wrap',
 inspectorCode:'text-[var(--text-faint)] [overflow-wrap:anywhere]',
 inspectorText:'mt-[9px] [overflow-wrap:anywhere]',
 fields:'grid grid-cols-[2fr_1fr] gap-[14px] at-most-1000:grid-cols-[1fr]',
 label:'flex min-w-0 flex-col gap-[6px] text-[12px] text-ouro-text-muted',
 input:'w-full text-ouro-text',
 wide:'col-span-full',
 delete:'justify-self-start text-[var(--negative)]',
 editor:'py-[22px]',
 entryField:'mb-[22px] max-w-[400px]',
 editorForms:'grid grid-cols-[1fr_1fr] gap-[24px] at-most-1000:grid-cols-[1fr]',
 editorForm:'flex flex-col items-stretch gap-[13px] rounded-[var(--radius)] border border-solid border-ouro-border p-[18px]',
 editorSubmit:'mt-[3px] self-start',
 facts:'mt-[20px] border-t [border-top-style:solid] border-t-ouro-border py-[22px]',
 factsHeading:'flex-wrap items-start gap-[12px]',
 factsText:'mt-[10px] text-[12px] text-ouro-text-muted',
 factsAccordion:'mt-[14px] text-[12px] text-ouro-text-muted',
 factsTrigger:'cursor-pointer',
 factsItem:'mt-[7px]',
 selection:'my-[14px] max-w-[480px]',
 runtimeContext:'[overflow-wrap:anywhere]',
 runtimeCode:'text-[10px] [overflow-wrap:anywhere]',
 tableScroll:'w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-[var(--radius)] border border-solid border-ouro-border focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ouro-text focus-visible:outline-offset-2',
 tableHint:'m-0 text-[11px] leading-[1.7] text-ouro-text-muted',
 nodeTable:'min-w-[700px] table-fixed',
 edgeTable:'min-w-[640px] table-fixed',
} as const;

const nodeKind={action:'',condition:'border-t-[3px] border-t-ouro-control',question:'border-t-[3px] border-t-[var(--attention)]',fork:'border-t-[3px] border-t-[var(--attention)]',blocker:'border-t-[3px] border-t-[var(--negative)]',wait:'border-dashed',result:'rounded-[20px] border-t-[3px] border-t-[var(--positive)]'} as const satisfies Record<FlowNodeKind,string>;
export function processNodeClassName(kind:FlowNodeKind,selected:boolean){return twMerge(processPresentation.node,nodeKind[kind],selected&&processPresentation.nodeSelected);}

const runColor={succeeded:'text-[var(--positive)]',failed:'text-[var(--negative)]',running:'text-[var(--attention)]',waiting:'text-[var(--attention)]'} as const;
/** Прежний has-facts selector имел приоритет над цветом runtime state; приоритет сохраняется. */
export function processEvidenceClassName(tracked:boolean,facts:boolean,state?:string){
 const color=facts?'text-ouro-text-muted':tracked&&state&&Object.hasOwn(runColor,state)?runColor[state as keyof typeof runColor]:'text-[var(--text-faint)]';
 return twMerge(processPresentation.evidence,tracked&&processPresentation.trackedEvidence,color);
}

type EdgeColor='var(--positive)'|'var(--attention)'|'var(--text-muted)'|'var(--graph-edge)';
const edgeColor={
 'var(--positive)':String.raw`[&>.react-flow\_\_edge-path]:stroke-[var(--positive)] [&_.react-flow\_\_edge-text]:fill-[var(--positive)]`,
 'var(--attention)':String.raw`[&>.react-flow\_\_edge-path]:stroke-[var(--attention)] [&_.react-flow\_\_edge-text]:fill-[var(--attention)]`,
 'var(--text-muted)':String.raw`[&>.react-flow\_\_edge-path]:stroke-[var(--text-muted)] [&_.react-flow\_\_edge-text]:fill-[var(--text-muted)]`,
 'var(--graph-edge)':String.raw`[&>.react-flow\_\_edge-path]:stroke-[var(--graph-edge)] [&_.react-flow\_\_edge-text]:fill-[var(--graph-edge)]`,
} as const satisfies Record<EdgeColor,string>;
/** Только paint уже вычисленного состояния: marker/label semantics и interaction path не затрагиваются. */
export function processEdgeClassName(color:EdgeColor,taken:boolean,thick:boolean,dash:'chosen'|'not-selected'|undefined){
 return twMerge(edgeColor[color],String.raw`[&_.react-flow\_\_edge-text]:text-[12px] [&_.react-flow\_\_edge-textbg]:fill-[var(--bg)]`,taken?String.raw`[&>.react-flow\_\_edge-path]:[stroke-width:3]`:thick?String.raw`[&>.react-flow\_\_edge-path]:[stroke-width:2.5]`:String.raw`[&>.react-flow\_\_edge-path]:[stroke-width:1.5]`,dash==='chosen'?String.raw`[&>.react-flow\_\_edge-path]:[stroke-dasharray:6_4]`:dash==='not-selected'?String.raw`[&>.react-flow\_\_edge-path]:[stroke-dasharray:3_6]`:'');
}
