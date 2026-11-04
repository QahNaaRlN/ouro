import type {FlowStepRun} from '@/packages/core/src';

/** Собственные slots runtime-панели; команды, pending intents и guards не зависят от оформления. */
export const runtimePresentation={
 tracking:'w-full min-w-0 rounded-[var(--radius)] border border-solid border-ouro-border bg-ouro-subtle p-[12px]',
 trackingLabel:'flex flex-row items-center gap-[8px]',
 checkbox:'w-auto shrink-0 accent-[var(--text)]',
 trackingHint:'mt-[7px] block text-[10px] leading-[1.6] text-ouro-text-muted [overflow-wrap:anywhere]',
 summary:'my-[18px] flex flex-wrap items-start justify-between gap-[15px] rounded-[var(--radius)] border border-solid border-ouro-border bg-ouro-subtle p-[18px] at-most-760:p-[14px]',
 summaryTitle:'mt-[7px] block text-[14px]',
 summaryText:'mt-[8px] text-[11px] text-ouro-text-muted',
 summaryAction:'at-most-760:w-full at-most-760:justify-center',
 summaryWarning:'m-0 basis-full',
 inspection:'mt-[18px] grid min-w-0 gap-[16px]',
 panel:'min-w-0 rounded-[var(--radius)] border border-solid border-ouro-border bg-ouro-bg p-[18px] at-most-760:p-[14px]',
 heading:'flex items-center gap-[8px]',
 text:'text-[11px] text-ouro-text-muted [overflow-wrap:anywhere]',
 status:'my-[14px] flex flex-wrap items-center justify-between gap-[8px] rounded-[5px] border border-solid border-ouro-border bg-ouro-subtle p-[12px] text-[12px] at-most-760:flex-col at-most-760:items-start',
 fields:'my-[16px] grid grid-cols-[1fr_1fr] gap-[12px] at-most-760:grid-cols-[1fr]',
 field:'min-w-0',
 term:'mb-[5px] text-[10px] text-[var(--text-faint)]',
 definition:'text-[11px] whitespace-pre-wrap [overflow-wrap:anywhere]',
 history:'mt-[18px] text-[11px] text-ouro-text-muted',
 historyList:'mt-[12px] grid list-none gap-[12px] p-0',
 historyEvent:'border-l-2 [border-left-style:solid] border-l-ouro-border bg-ouro-subtle p-[12px]',
 historyAuthor:'my-[6px] block text-[10px] text-[var(--text-faint)]',
 historyRecord:'mt-[8px] max-h-[260px] overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere]',
 actionList:'grid list-none gap-[10px] p-0',
 actionTitle:'block text-[11px] text-ouro-text',
 actionReason:'mt-[4px] block text-[10px] text-ouro-text-muted',
 form:'grid',
 textarea:'resize-y',
 submit:'justify-self-start at-most-760:w-full at-most-760:justify-self-stretch',
 message:'flex flex-wrap items-start gap-[8px] rounded-[5px] p-[12px] text-[11px] [overflow-wrap:anywhere]',
 warning:'border border-solid border-[color-mix(in_srgb,var(--attention)_35%,var(--border))] bg-[var(--attention-surface)] text-[var(--attention)]',
 success:'bg-[var(--positive-surface)] text-ouro-positive',
 warningValue:'block max-w-full [overflow-wrap:anywhere]',
 warningTitle:'w-full',
 simulation:'border-l-2 [border-left-style:solid] border-l-[var(--attention)] pl-[12px]',
} as const;

/** Ранее workspace defaults выигрывали при равной специфичности; сохраняем эти значения явно. */
export const runtimeSurfacePresentation={
 legacy:{trackingLabel:'text-[11px] text-ouro-text',heading:'m-0 mb-[12px] text-[14px]',paragraph:'leading-[1.7]',statusCode:'text-[10px]',record:'text-[10px]',form:'gap-[13px]',textarea:'leading-[1.7]',history:''},
 workspace:{trackingLabel:'text-[11px] leading-[1.6] text-ouro-text',heading:'m-0 mb-[12px] text-[14px] font-medium',paragraph:'leading-[1.7]',statusCode:'text-[10px]',record:'text-[10px]',form:'gap-[16px]',textarea:'leading-[1.7]',history:'mt-[14px]'},
} as const;

const runStatus:Readonly<Partial<Record<FlowStepRun['state'],string>>>={
 ready:'border-l-[3px] border-l-[var(--attention)]',running:'border-l-[3px] border-l-[var(--attention)]',waiting:'border-l-[3px] border-l-[var(--attention)]',
 succeeded:'border-l-[3px] border-l-ouro-positive',failed:'border-l-[3px] border-l-[var(--negative)]',
};

/** Только конечное оформление состояния, без вычисления доступности или переходов. */
export const runtimeRunStatusClassName=(state:FlowStepRun['state'])=>runStatus[state];
