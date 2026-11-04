import type {WorkTone} from '@/packages/core/src/work-presentation';

/** Цвет сообщает только presentation tone, не меняя canonical status или authority. */
export const workStatusPresentation={
 root:'inline-flex max-w-full items-center gap-[6px] rounded-[5px] bg-ouro-subtle px-[7px] py-[3px] align-middle text-[11px] leading-[1.5] whitespace-normal text-ouro-text-muted',
 icon:'flex-none',
 label:'min-w-0',
 code:'text-[10px] opacity-85 [overflow-wrap:anywhere]',
} as const;

/** Purple сохраняется как объявленный публичный вариант; нынешний mapper не выдаёт его как canonical факт. */
export const workStatusTone={
 neutral:'',
 blue:'text-[color:var(--work-running,var(--text))] bg-[var(--work-running-surface,var(--selected))]',
 amber:'text-[var(--attention)] bg-[var(--attention-surface)]',
 green:'text-ouro-positive bg-[var(--positive-surface)]',
 red:'text-[var(--negative)] bg-[var(--negative-surface)]',
 purple:'text-ouro-text bg-[var(--selected)]',
} as const satisfies Readonly<Record<WorkTone,string>>;
